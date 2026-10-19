"""Turns raw Synthea output into the EHR seed bundles.

    python3 transform.py --synthea seed/synthea/.cache --out seed

For each EHR (Cerner, Athena) it writes seed/<ehr>/00-directory.json (organizations, locations,
practitioners) and one transaction bundle per patient. Every entry is a PUT with a fixed id, so
loading is idempotent.

What it does to Synthea's output, and why:
  - keeps the clinical record (patients, encounters, conditions, observations, lab reports, medications,
    immunizations, allergies, procedures, notes); drops billing (Claim, ExplanationOfBenefit), Provenance,
    supply and device records — an EHR integration demo has no use for them
  - drops Synthea's sensitive social-screening data (abuse/violence questionnaires, criminal record,
    drug misuse findings): realistic in research data, wrong for a customer demo
  - keeps 8 years of history; active problems, allergies, immunizations and active medications are kept
    regardless of date, as an EHR would show them
  - resolves Synthea's conditional references (Practitioner?identifier=...) and urn:uuid references to
    plain Type/id references, so any FHIR server can load the bundles
  - adds typical adult reference ranges and H/L flags to common lab results (Synthea leaves them out)
  - picks the patients: the personas from storyline.py plus a few others per EHR, so patient search
    looks like a real clinic
  - overlays the personas' storyline (see storyline.py)
"""
import argparse
import base64
import copy
import glob
import json
import os
import re
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import storyline as story  # noqa: E402

REFERENCE_DATE = date(2026, 10, 17)
HISTORY_YEARS = 8
CUTOFF = REFERENCE_DATE.replace(year=REFERENCE_DATE.year - HISTORY_YEARS).isoformat()
# A persona's Synthea results for storyline analytes are dropped from this long before its first anchor,
# so the recent trend is exactly the storyline's.
STORY_WINDOW_DAYS = 400
BACKGROUND_PATIENTS = 6
MAX_BACKGROUND_RESOURCES = 1600   # skip Synthea's very long hospital histories for background patients

LOINC = "http://loinc.org"
UCUM = "http://unitsofmeasure.org"
OBS_CAT = "http://terminology.hl7.org/CodeSystem/observation-category"
INTERP = "http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation"

# Background patients' MRNs start well away from the personas' (MRN-100234…, ATH-40912…).
EHRS = {
    "cerner": {
        "display": "Oracle Health (Cerner)",
        "mrn_system": "urn:oid:2.16.840.1.113883.3.787.0.0",
        "mrn_prefix": "MRN-20",
    },
    "athena": {
        "display": "athenahealth",
        "mrn_system": "urn:demo:athenahealth:mrn",
        "mrn_prefix": "ATH-6",
    },
}

CLINIC_ORG = {
    "resourceType": "Organization", "id": "org-longview-clinic", "active": True, "name": "Longview Health Clinic",
    "type": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/organization-type", "code": "prov",
                          "display": "Healthcare Provider"}]}],
    "address": [{"city": "Boston", "state": "MA", "country": "US"}],
}
# The clinic's directory lists its reference lab, so orders and filed results can name it.
LAB_ORG = {
    "resourceType": "Organization", "id": "org-quest-lab", "active": True, "name": "Quest Diagnostics",
    "type": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/organization-type", "code": "prov"}],
              "text": "Reference laboratory"}],
}
PHYSICIAN = {
    "resourceType": "Practitioner", "id": "prac-elena-park", "active": True,
    "identifier": [{"system": "http://hl7.org/fhir/sid/us-npi", "value": "1588667795"}],
    "name": [{"family": "Park", "given": ["Elena"], "prefix": ["Dr."], "suffix": ["MD"], "text": "Dr. Elena Park, MD"}],
    "qualification": [{"code": {"text": "Internal Medicine — Preventive & Longevity Medicine"}}],
}
PHYSICIAN_REF = {"reference": "Practitioner/prac-elena-park", "display": "Dr. Elena Park, MD"}
CLINIC_REF = {"reference": "Organization/org-longview-clinic", "display": "Longview Health Clinic"}

DROP_TYPES = {"Claim", "ExplanationOfBenefit", "Provenance", "SupplyDelivery", "Device", "CareTeam", "CarePlan",
              "MedicationAdministration", "ImagingStudy", "Media"}
# Survey instruments kept (depression, anxiety, alcohol screening); others are dropped.
KEEP_SURVEYS = {"55758-7", "44249-1", "70274-6", "75626-2"}
SENSITIVE = re.compile(r"abuse|violence|criminal|victim|rape|overdose|misuse|drug|employ|labor force|education|"
                       r"educated|social isolation|social contact|housing|transport|refugee|stress|"
                       r"medication review due|risk activity|incarcerat|homeless|reports of", re.I)
SENSITIVE_PATIENT = re.compile(r"HIV|Human immunodeficiency|drug abuse|Opioid abuse|Overdose|Sepsis|"
                               r"brain injury", re.I)
# Synthea patient identifiers kept on the Patient (its SSN, licence and passport look like real PII).
DROP_IDENTIFIER_TYPES = {"SS", "DL", "PPN"}

# Typical adult reference ranges for common Synthea lab codes: (low, high, female low, female high).
REFERENCE_RANGES = {
    "2339-0": (70, 99, None, None), "2345-7": (70, 99, None, None), "6299-2": (7, 20, None, None),
    "3094-0": (7, 20, None, None), "38483-4": (0.7, 1.3, 0.5, 1.0), "2160-0": (0.7, 1.3, 0.5, 1.0),
    "49765-1": (8.6, 10.3, None, None), "17861-6": (8.6, 10.3, None, None), "2947-0": (136, 145, None, None),
    "2951-2": (136, 145, None, None), "6298-4": (3.5, 5.1, None, None), "2823-3": (3.5, 5.1, None, None),
    "2069-3": (98, 107, None, None), "2075-0": (98, 107, None, None), "20565-8": (22, 29, None, None),
    "2028-9": (22, 29, None, None), "718-7": (13.2, 17.1, 11.7, 15.5), "4544-3": (38.5, 50, 35, 45),
    "6690-2": (3.8, 10.8, None, None), "789-8": (4.2, 5.8, 3.8, 5.1), "777-3": (140, 400, None, None),
    "787-2": (80, 100, None, None), "785-6": (27, 33, None, None), "786-4": (32, 36, None, None),
    "4548-4": (None, 5.7, None, None), "2093-3": (None, 200, None, None), "18262-6": (None, 100, None, None),
    "2085-9": (40, None, 50, None), "2571-8": (None, 150, None, None), "1742-6": (7, 46, 6, 29),
    "1920-8": (10, 40, 10, 35), "6768-6": (36, 130, None, None), "1975-2": (0.2, 1.2, None, None),
    "1751-7": (3.6, 5.1, None, None), "2885-2": (6.1, 8.1, None, None), "33914-3": (60, None, None, None),
    "2276-4": (38, 380, 16, 232),
}


# ── Helpers ──────────────────────────────────────────────────────────────────────────────────────

def entry(resource):
    rt, rid = resource["resourceType"], resource["id"]
    return {"fullUrl": f"{rt}/{rid}", "resource": resource, "request": {"method": "PUT", "url": f"{rt}/{rid}"}}


def bundle(resources):
    return {"resourceType": "Bundle", "type": "transaction", "entry": [entry(r) for r in resources]}


def resource_date(r):
    """The clinically relevant date of a resource, as an ISO string ('' if it has none)."""
    for path in (("effectiveDateTime",), ("period", "start"), ("onsetDateTime",), ("authoredOn",),
                 ("performedPeriod", "start"), ("performedDateTime",), ("occurrenceDateTime",), ("date",),
                 ("recordedDate",), ("issued",)):
        value = r
        for key in path:
            value = value.get(key) if isinstance(value, dict) else None
        if isinstance(value, str):
            return value
    return ""


def first_code(concept):
    codings = (concept or {}).get("coding") or [{}]
    return codings[0].get("code"), codings[0].get("display", "")


def years_between(a, b):
    return (datetime.fromisoformat(b[:10]) - datetime.fromisoformat(a[:10])).days / 365.25


def precision_of(values):
    return max((len(str(v).split(".")[1]) if "." in str(v) else 0) for v in values)


def interpretation(value, low, high):
    if high is not None and value > high:
        return "H", "High"
    if low is not None and value < low:
        return "L", "Low"
    return "N", "Normal"


def reference_range(low, high, unit, ucum):
    rr = {}
    if low is not None:
        rr["low"] = {"value": low, "unit": unit, "system": UCUM, "code": ucum}
    if high is not None:
        rr["high"] = {"value": high, "unit": unit, "system": UCUM, "code": ucum}
    return [rr] if rr else []


def clinical_round(value):
    """Synthea reports values like 14.855 g/dL; a lab reports 14.9."""
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        return value
    magnitude = abs(value)
    if magnitude >= 100:
        return int(round(value))
    if magnitude >= 10:
        return round(value, 1)
    return round(value, 2)


def round_quantities(obs):
    for quantity in [obs.get("valueQuantity")] + [c.get("valueQuantity") for c in obs.get("component", [])]:
        if isinstance(quantity, dict) and "value" in quantity:
            quantity["value"] = clinical_round(quantity["value"])


def add_reference_range(obs, female):
    """Adds a typical adult range and H/L flag to a Synthea lab result that has none."""
    code, _ = first_code(obs.get("code"))
    ranges = REFERENCE_RANGES.get(code)
    quantity = obs.get("valueQuantity")
    if not ranges or not quantity or "referenceRange" in obs:
        return
    low, high, flow, fhigh = ranges
    if female:
        low = flow if flow is not None else low
        high = fhigh if fhigh is not None else high
    unit, ucum = quantity.get("unit", ""), quantity.get("code", quantity.get("unit", ""))
    obs["referenceRange"] = reference_range(low, high, unit, ucum)
    ic, idisp = interpretation(quantity["value"], low, high)
    obs["interpretation"] = [{"coding": [{"system": INTERP, "code": ic, "display": idisp}]}]


def clean_references(node, alive):
    """Rewrites references to Type/id and removes those pointing at resources not in the seed.
    Returns False when the node itself is a dangling reference (the caller removes it)."""
    if isinstance(node, dict):
        ref = node.get("reference")
        if isinstance(ref, str):
            if ref not in alive:
                return False
        for key in list(node.keys()):
            value = node[key]
            if isinstance(value, dict):
                if not clean_references(value, alive):
                    del node[key]
            elif isinstance(value, list):
                kept = [item for item in value if clean_references(item, alive)]
                if kept:
                    node[key] = kept
                else:
                    del node[key]
    elif isinstance(node, list):
        node[:] = [item for item in node if clean_references(item, alive)]
    return True


def rewrite_reference_strings(node, mapping):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "reference" and isinstance(value, str):
                node[key] = mapping.get(value, value)
            else:
                rewrite_reference_strings(value, mapping)
    elif isinstance(node, list):
        for item in node:
            rewrite_reference_strings(item, mapping)


# ── Synthea input ───────────────────────────────────────────────────────────────────────────────

def load_directory(out_dir):
    """Organizations, locations and practitioners, indexed by the conditional references Synthea uses."""
    index, resources = {}, {}
    for path in glob.glob(os.path.join(out_dir, "fhir", "*Information*.json")):
        for e in json.load(open(path))["entry"]:
            r = e["resource"]
            r.pop("meta", None)
            r.pop("text", None)
            r.pop("extension", None)
            key = f"{r['resourceType']}/{r['id']}"
            resources[key] = r
            for ident in r.get("identifier", []):
                index[f"{r['resourceType']}?identifier={ident.get('system')}|{ident.get('value')}"] = key
    return index, resources


def load_patients(out_dir):
    patients = []
    for path in sorted(glob.glob(os.path.join(out_dir, "fhir", "*.json"))):
        if "Information" in os.path.basename(path):
            continue
        entries = json.load(open(path))["entry"]
        patient = next(e["resource"] for e in entries if e["resource"]["resourceType"] == "Patient")
        patients.append({"id": patient["id"], "patient": patient, "entries": entries})
    return patients


OPIOIDS = re.compile(r"fentanyl|hydrocodone|oxycodone|buprenorphine|tramadol|codeine|morphine", re.I)


def unsuitable_background(p):
    """Patients left out of the clinic population: sensitive diagnoses, opioid therapy, very long records."""
    if len(p["entries"]) > MAX_BACKGROUND_RESOURCES:
        return True
    if any(SENSITIVE_PATIENT.search(d) for d in active_disorders(p)):
        return True
    return any(e["resource"]["resourceType"] == "MedicationRequest" and e["resource"].get("status") == "active"
               and OPIOIDS.search((e["resource"].get("medicationCodeableConcept") or {}).get("text", ""))
               for e in p["entries"])


def active_disorders(p):
    return [first_code(e["resource"]["code"])[1] for e in p["entries"]
            if e["resource"]["resourceType"] == "Condition"
            and first_code(e["resource"].get("clinicalStatus"))[0] == "active"]


# ── Filtering ───────────────────────────────────────────────────────────────────────────────────

def keep_resource(r):
    rt = r["resourceType"]
    if rt in DROP_TYPES:
        return False
    when = resource_date(r)[:10]
    if rt == "Observation":
        category = first_code((r.get("category") or [{}])[0])[0]
        code, _ = first_code(r.get("code"))
        if category == "survey" and code not in KEEP_SURVEYS:
            return False
    if rt == "DiagnosticReport":
        category = first_code((r.get("category") or [{}])[0])[0]
        if category != "LAB":
            return False   # Synthea also files notes and surveys as reports; notes are kept as DocumentReference
    if rt in ("Condition", "Procedure"):
        _, display = first_code(r.get("code"))
        if SENSITIVE.search(display):
            return False
    if rt == "Condition":
        if first_code(r.get("clinicalStatus"))[0] == "active":
            return True
    if rt in ("Patient", "AllergyIntolerance", "Immunization", "Medication"):
        return True
    if rt == "MedicationRequest" and r.get("status") == "active":
        return True
    return not when or when >= CUTOFF


def strip(r):
    r.pop("meta", None)
    if r["resourceType"] != "DocumentReference":
        r.pop("text", None)
    if r["resourceType"] == "Patient":
        r["extension"] = [x for x in r.get("extension", [])
                          if "us-core" in x.get("url", "") or x.get("url", "").endswith("patient-birthPlace")]
        r["identifier"] = [i for i in r.get("identifier", [])
                           if first_code(i.get("type"))[0] not in DROP_IDENTIFIER_TYPES]
    return r


# ── Persona overlay ─────────────────────────────────────────────────────────────────────────────

class Anchors:
    """Value of a storyline analyte on any date: the anchors themselves, a gentle lead-in before the
    first anchor, and the last value after the last."""

    def __init__(self, points):
        self.points = sorted(points)   # [(date, value)]
        self.decimals = precision_of([v for _, v in self.points])

    def value_on(self, when):
        (d1, v1) = self.points[0]
        if len(self.points) > 1:
            (d2, v2) = self.points[1]
            slope = (v2 - v1) / max(years_between(d1, d2), 0.1)
        else:
            slope = 0
        years_before = years_between(when, d1)
        value = v1 - slope * 0.6 * years_before
        value = min(max(value, v1 * 0.7), v1 * 1.3)
        return round(value, self.decimals) if self.decimals else int(round(value))


def persona_anchor_series(persona):
    series = {}
    for visit in persona["visits"]:
        for key, value in visit["labs"].items():
            series.setdefault(key, []).append((visit["date"], value))
        vitals = visit.get("vitals")
        if vitals:
            sys_bp, dia_bp, bmi, weight = vitals
            series.setdefault("sys", []).append((visit["date"], sys_bp))
            series.setdefault("dia", []).append((visit["date"], dia_bp))
            if bmi is not None:
                series.setdefault("bmi", []).append((visit["date"], bmi))
            if weight is not None:
                series.setdefault("weight", []).append((visit["date"], weight))
    return {key: Anchors(points) for key, points in series.items()}


def storyline_key(code):
    for key, spec in story.ANALYTES.items():
        if spec[0] == code:
            return key
    return story.ANALYTE_ALIASES.get(code)


def overlay_observation(obs, anchors, first_anchor_date, baseline):
    """Re-values a persona's Synthea result for a storyline analyte. Returns False to drop it."""
    code, _ = first_code(obs.get("code"))
    when = resource_date(obs)[:10]
    base_key = storyline_key(code)
    if base_key in baseline and "valueQuantity" in obs:
        # Not trended by the story: hold it near the persona's baseline (±2%, the same every run).
        wobble = (sum(ord(c) for c in when) % 5 - 2) / 100
        obs["valueQuantity"]["value"] = clinical_round(baseline[base_key] * (1 + wobble))
        obs.pop("interpretation", None)
        obs.pop("referenceRange", None)
        return True
    recent = years_between(when, first_anchor_date) * 365.25 < STORY_WINDOW_DAYS
    if code == story.VITAL_CODES["bp"]:
        if "sys" not in anchors:
            return True
        if recent:
            return False
        for comp in obs.get("component", []):
            ccode, _ = first_code(comp.get("code"))
            key = "sys" if ccode == "8480-6" else "dia" if ccode == "8462-4" else None
            if key and "valueQuantity" in comp:
                comp["valueQuantity"]["value"] = anchors[key].value_on(when)
        return True
    if code == story.VITAL_CODES["bmi"] or code == story.VITAL_CODES["weight"]:
        key = "bmi" if code == story.VITAL_CODES["bmi"] else "weight"
        if key not in anchors:
            return True
        if recent:
            return False
        obs["valueQuantity"]["value"] = anchors[key].value_on(when)
        return True
    key = storyline_key(code)
    if key is None or key not in anchors:
        return True
    if recent:
        return False
    if "valueQuantity" in obs:
        obs["valueQuantity"]["value"] = anchors[key].value_on(when)
        obs.pop("interpretation", None)
        obs.pop("referenceRange", None)
    return True


def persona_keeps(r, dropped_condition_refs):
    rt = r["resourceType"]
    if rt == "Condition":
        _, display = first_code(r.get("code"))
        return any(k.lower() in display.lower() for k in story.PERSONA_KEEP_CONDITIONS)
    if rt == "MedicationRequest":
        text = (r.get("medicationCodeableConcept") or {}).get("text", "")
        return any(k.lower() in text.lower() for k in story.PERSONA_KEEP_MEDICATIONS)
    if rt in ("AllergyIntolerance", "DocumentReference", "Medication"):
        return False   # the storyline supplies allergies and notes; Synthea's notes describe the base person
    if rt in ("Procedure", "MedicationRequest", "Encounter"):
        reasons = [x.get("reference") for x in r.get("reasonReference", [])]
        if reasons and all(ref in dropped_condition_refs for ref in reasons):
            return rt == "Encounter"   # keep the visit, drop care that only existed for a dropped condition
    return True


def curated_resources(persona, ehr):
    """The storyline's resources: anchor visits with their labs, vitals and notes; problems,
    medications, allergies and family history."""
    pid = persona["id"]
    female = persona["gender"] == "female"
    subject = {"reference": f"Patient/{pid}"}
    out = []
    slug = pid.replace("p-", "")

    for visit in persona["visits"]:
        d = visit["date"]
        eid = f"enc-{slug}-{d}"
        type_code, type_display = visit["type"]
        out.append({
            "resourceType": "Encounter", "id": eid, "status": "finished",
            "class": {"system": "http://terminology.hl7.org/CodeSystem/v3-ActCode", "code": "AMB", "display": "ambulatory"},
            "type": [{"coding": [{"system": story.SNOMED, "code": type_code, "display": type_display}], "text": type_display}],
            "subject": subject,
            "participant": [{"individual": PHYSICIAN_REF}],
            "period": {"start": f"{d}T08:00:00-05:00", "end": f"{d}T08:45:00-05:00"},
            "reasonCode": [{"text": visit["reason"]}],
            "serviceProvider": CLINIC_REF,
        })
        encounter_ref = {"reference": f"Encounter/{eid}"}
        vitals = visit.get("vitals")
        if vitals:
            sys_bp, dia_bp, bmi, weight = vitals
            base = {"resourceType": "Observation", "status": "final", "subject": subject, "encounter": encounter_ref,
                    "category": [{"coding": [{"system": OBS_CAT, "code": "vital-signs", "display": "Vital Signs"}]}],
                    "effectiveDateTime": f"{d}T08:10:00-05:00"}
            out.append({**base, "id": f"obs-{slug}-{d}-bp",
                        "code": {"coding": [{"system": LOINC, "code": "85354-9", "display": "Blood pressure panel with all children optional"}], "text": "Blood pressure"},
                        "component": [
                            {"code": {"coding": [{"system": LOINC, "code": "8480-6", "display": "Systolic blood pressure"}]},
                             "valueQuantity": {"value": sys_bp, "unit": "mm[Hg]", "system": UCUM, "code": "mm[Hg]"}},
                            {"code": {"coding": [{"system": LOINC, "code": "8462-4", "display": "Diastolic blood pressure"}]},
                             "valueQuantity": {"value": dia_bp, "unit": "mm[Hg]", "system": UCUM, "code": "mm[Hg]"}}]})
            if bmi is not None:
                out.append({**base, "id": f"obs-{slug}-{d}-bmi",
                            "code": {"coding": [{"system": LOINC, "code": "39156-5", "display": "Body mass index (BMI) [Ratio]"}], "text": "BMI"},
                            "valueQuantity": {"value": bmi, "unit": "kg/m2", "system": UCUM, "code": "kg/m2"}})
            if weight is not None:
                out.append({**base, "id": f"obs-{slug}-{d}-wt",
                            "code": {"coding": [{"system": LOINC, "code": "29463-7", "display": "Body weight"}], "text": "Body weight"},
                            "valueQuantity": {"value": weight, "unit": "kg", "system": UCUM, "code": "kg"}})
        for panel in visit["panels"]:
            pcode, pdisplay, keys = story.PANELS[panel]
            refs = []
            for key in keys:
                if key not in visit["labs"]:
                    continue
                code, display, unit, ucum, low, high, flow, fhigh = story.ANALYTES[key]
                if female:
                    low = flow if flow is not None else low
                    high = fhigh if fhigh is not None else high
                value = visit["labs"][key]
                oid = f"obs-{slug}-{d}-{key}"
                ic, idisp = interpretation(value, low, high)
                out.append({
                    "resourceType": "Observation", "id": oid, "status": "final",
                    "category": [{"coding": [{"system": OBS_CAT, "code": "laboratory", "display": "Laboratory"}]}],
                    "code": {"coding": [{"system": LOINC, "code": code, "display": display}], "text": display.split(" [")[0]},
                    "subject": subject, "encounter": encounter_ref,
                    "effectiveDateTime": f"{d}T08:30:00-05:00", "issued": f"{d}T16:00:00-05:00",
                    "valueQuantity": {"value": value, "unit": unit, "system": UCUM, "code": ucum},
                    "interpretation": [{"coding": [{"system": INTERP, "code": ic, "display": idisp}]}],
                    "referenceRange": reference_range(low, high, unit, ucum),
                })
                refs.append({"reference": f"Observation/{oid}"})
            if refs:
                out.append({
                    "resourceType": "DiagnosticReport", "id": f"dr-{slug}-{d}-{panel}", "status": "final",
                    "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v2-0074", "code": "LAB", "display": "Laboratory"}]}],
                    "code": {"coding": [{"system": LOINC, "code": pcode, "display": pdisplay}], "text": pdisplay.split(" - ")[0]},
                    "subject": subject, "encounter": encounter_ref,
                    "effectiveDateTime": f"{d}T08:30:00-05:00", "issued": f"{d}T16:00:00-05:00",
                    "performer": [{"reference": "Organization/org-longview-clinic", "display": "Longview Health Clinic Laboratory"}],
                    "result": refs,
                })
        title, text = visit["note"]
        out.append({
            "resourceType": "DocumentReference", "id": f"note-{slug}-{d}", "status": "current",
            "type": {"coding": [{"system": LOINC, "code": "11506-3", "display": "Progress note"}], "text": "Progress note"},
            "category": [{"coding": [{"system": "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category",
                                      "code": "clinical-note", "display": "Clinical Note"}]}],
            "subject": subject, "date": f"{d}T09:00:00-05:00", "author": [PHYSICIAN_REF],
            "description": title,
            "content": [{"attachment": {"contentType": "text/plain", "title": title,
                                        "data": base64.b64encode(text.encode()).decode()}}],
            "context": {"encounter": [encounter_ref], "period": {"start": f"{d}T08:00:00-05:00"}},
        })

    first_visit = f"enc-{slug}-{persona['visits'][0]['date']}"
    for i, (snomed, icd, display, onset, status) in enumerate(persona["conditions"]):
        cond = {
            "resourceType": "Condition", "id": f"cond-{slug}-{i + 1}",
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": status}]},
            "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-ver-status", "code": "confirmed"}]},
            "category": [{"coding": [{"system": "http://terminology.hl7.org/CodeSystem/condition-category",
                                      "code": "problem-list-item", "display": "Problem List Item"}]}],
            "code": {"coding": [{"system": story.SNOMED, "code": snomed, "display": display},
                                {"system": story.ICD10, "code": icd}], "text": display.replace(" (disorder)", "")},
            "subject": subject, "onsetDateTime": onset, "recordedDate": onset,
        }
        if onset >= persona["visits"][0]["date"]:
            cond["encounter"] = {"reference": f"Encounter/enc-{slug}-{onset}"} if any(
                v["date"] == onset for v in persona["visits"]) else {"reference": f"Encounter/{first_visit}"}
        if status == "resolved":
            cond["abatementDateTime"] = onset[:4] + "-09-20"
        out.append(cond)

    for i, med in enumerate(persona["medications"]):
        concept = {"coding": [{"system": story.RXNORM, "code": med["rxnorm"], "display": med["display"]}], "text": med["display"]}
        if med["kind"] == "statement":
            out.append({
                "resourceType": "MedicationStatement", "id": f"meds-{slug}-{i + 1}", "status": med["status"],
                "medicationCodeableConcept": concept, "subject": subject,
                "effectivePeriod": {"start": med["start"], **({"end": med["end"]} if "end" in med else {})},
                "dateAsserted": persona["visits"][0]["date"], "informationSource": subject,
                "dosage": [{"text": med["dosage"]}],
                "note": [{"text": "Over-the-counter; reported by the patient."}],
            })
        else:
            request = {
                "resourceType": "MedicationRequest", "id": f"medrx-{slug}-{i + 1}", "status": med["status"],
                "intent": "order", "medicationCodeableConcept": concept, "subject": subject,
                "authoredOn": med["start"], "requester": PHYSICIAN_REF,
                "dosageInstruction": [{"text": med["dosage"]}],
            }
            if "end" in med:
                request["dispenseRequest"] = {"validityPeriod": {"start": med["start"], "end": med["end"]}}
            out.append(request)

    for i, allergy in enumerate(persona["allergies"]):
        out.append({
            "resourceType": "AllergyIntolerance", "id": f"allergy-{slug}-{i + 1}",
            "clinicalStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", "code": "active"}]},
            "verificationStatus": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/allergyintolerance-verification", "code": "confirmed"}]},
            "type": "allergy", "category": [allergy["category"]], "criticality": allergy["criticality"],
            "code": {"coding": [{"system": allergy["system"], "code": allergy["code"], "display": allergy["display"]}],
                     "text": allergy["display"].replace(" (substance)", "")},
            "patient": subject, "recordedDate": allergy["recorded"],
            "reaction": [{"manifestation": [{"coding": [{"system": story.SNOMED, "code": c, "display": d}], "text": d}],
                          "severity": s} for c, d, s in allergy["reactions"]],
        })

    for i, member in enumerate(persona["family_history"]):
        rel_code, rel_display = member["relationship"]
        out.append({
            "resourceType": "FamilyMemberHistory", "id": f"fmh-{slug}-{i + 1}", "status": "completed",
            "patient": subject,
            "relationship": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v3-RoleCode", "code": rel_code, "display": rel_display}]},
            "sex": {"coding": [{"system": "http://hl7.org/fhir/administrative-gender", "code": member["sex"]}]},
            "condition": [{"code": {"coding": [{"system": story.SNOMED, "code": c, "display": d}], "text": d.replace(" (disorder)", "")},
                           "onsetAge": {"value": age, "unit": "yr", "system": UCUM, "code": "a"}} for c, d, age in member["conditions"]],
        })
    return out


# ── Per-patient build ───────────────────────────────────────────────────────────────────────────

def build_patient(p, ehr_key, persona, mrn, directory_index):
    ehr = EHRS[ehr_key]
    synthea_pid = p["id"]
    new_pid = persona["id"] if persona else synthea_pid
    female = (persona["gender"] if persona else p["patient"]["gender"]) == "female"

    # urn:uuid and conditional references → Type/id
    mapping = {}
    for e in p["entries"]:
        r = e["resource"]
        rid = new_pid if r["resourceType"] == "Patient" else r["id"]
        mapping[e["fullUrl"]] = f"{r['resourceType']}/{rid}"
    mapping.update(directory_index)

    resources = []
    dropped_condition_refs = set()
    for e in p["entries"]:
        r = copy.deepcopy(e["resource"])
        if not keep_resource(r):
            if r["resourceType"] == "Condition":
                dropped_condition_refs.add(e["fullUrl"])
            continue
        if persona and not persona_keeps(r, dropped_condition_refs):
            if r["resourceType"] == "Condition":
                dropped_condition_refs.add(e["fullUrl"])
            continue
        resources.append(strip(r))
    dropped_condition_refs = {mapping.get(x, x) for x in dropped_condition_refs}

    for r in resources:
        rewrite_reference_strings(r, mapping)
    patient = next(r for r in resources if r["resourceType"] == "Patient")
    patient["id"] = new_pid
    mr = {"use": "usual", "type": {"coding": [{"system": "http://terminology.hl7.org/CodeSystem/v2-0203", "code": "MR",
                                               "display": "Medical record number"}]},
          "system": ehr["mrn_system"], "value": mrn}
    patient["identifier"] = [mr] + [i for i in patient.get("identifier", []) if first_code(i.get("type"))[0] != "MR"]

    if persona:
        patient["name"] = [{"use": "official", "family": persona["family"], "given": persona["given"],
                            "text": f"{' '.join(persona['given'])} {persona['family']}"}]
        patient["birthDate"] = persona["birthDate"]
        patient["generalPractitioner"] = [PHYSICIAN_REF]
        patient["managingOrganization"] = CLINIC_REF
        anchors = persona_anchor_series(persona)
        first_anchor = persona["visits"][0]["date"]
        overlaid = []
        for r in resources:
            if r["resourceType"] == "Observation":
                code, _ = first_code(r.get("code"))
                if code == "72166-2":    # tobacco smoking status follows the storyline
                    scode, sdisplay = persona["smoking"]
                    r["valueCodeableConcept"] = {"coding": [{"system": story.SNOMED, "code": scode, "display": sdisplay}], "text": sdisplay}
                if not overlay_observation(r, anchors, first_anchor, persona.get("baseline", {})):
                    continue
            if r["resourceType"] == "Encounter":
                r["reasonCode"] = [c for c in r.get("reasonCode", [])
                                   if any(k.lower() in first_code(c)[1].lower() for k in story.PERSONA_KEEP_CONDITIONS)]
                if not r["reasonCode"]:
                    del r["reasonCode"]
            overlaid.append(r)
        resources = overlaid + curated_resources(persona, ehr_key)

    for r in resources:
        if r["resourceType"] == "Observation":
            round_quantities(r)
            if first_code((r.get("category") or [{}])[0])[0] == "laboratory":
                add_reference_range(r, female)

    # Drop references to anything not in the seed (old encounters, dropped conditions, etc.)
    alive = {f"{r['resourceType']}/{r['id']}" for r in resources} | set(directory_index.values()) | {
        "Practitioner/prac-elena-park", "Organization/org-longview-clinic", "Organization/org-quest-lab"}
    for r in resources:
        clean_references(r, alive)
    # Reports whose results were all dropped carry no information.
    resources = [r for r in resources if r["resourceType"] != "DiagnosticReport" or r.get("result")]
    # Anything left without its subject (e.g. a result re-valued away) is dropped too.
    resources = [r for r in resources if r["resourceType"] in ("Patient", "Medication")
                 or "subject" in r or "patient" in r]
    return resources


def referenced_directory(resources, directory):
    keys = set()

    def walk(node):
        if isinstance(node, dict):
            ref = node.get("reference")
            if isinstance(ref, str) and ref in directory:
                keys.add(ref)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)
    walk(resources)
    return keys


def slug_of(patient):
    name = patient["name"][0]
    given = name.get("given", [""])[0]
    return re.sub(r"[^a-z0-9]+", "-", f"{given} {name.get('family', '')}".lower()).strip("-")


def build_ehr(ehr_key, synthea_dir, out_dir):
    ehr = EHRS[ehr_key]
    index, directory = load_directory(synthea_dir)
    patients = load_patients(synthea_dir)
    personas = [p for p in story.PERSONAS if p["ehr"] == ehr_key]

    chosen = []   # (synthea patient, persona or None, MRN)
    for persona in personas:
        base = [p for p in patients if p["id"].startswith(persona["synthea_base"])]
        if len(base) != 1:
            sys.exit(f"{ehr_key}: Synthea base {persona['synthea_base']} for {persona['id']} not found. "
                     f"Was the population regenerated with a different version or seed? Pick a new base in storyline.py.")
        chosen.append((base[0], persona, persona["mrn"]))
    persona_ids = {c[0]["id"] for c in chosen}
    background = [p for p in patients if p["id"] not in persona_ids
                  and not unsuitable_background(p)][:BACKGROUND_PATIENTS]
    for i, p in enumerate(background):
        chosen.append((p, None, f"{ehr['mrn_prefix']}{1300 + i * 37:04d}"))

    os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, "*.json")):
        os.remove(old)

    patient_bundles, used_directory = [], set()
    for p, persona, mrn in chosen:
        resources = build_patient(p, ehr_key, persona, mrn, index)
        used_directory |= referenced_directory(resources, directory)
        patient_bundles.append((resources, persona))

    directory_resources = [CLINIC_ORG, LAB_ORG, PHYSICIAN] + [directory[k] for k in sorted(used_directory)]
    write(os.path.join(out_dir, "00-directory.json"), bundle(directory_resources))
    summary = []
    for i, (resources, persona) in enumerate(patient_bundles, 1):
        patient = next(r for r in resources if r["resourceType"] == "Patient")
        name = f"{i:02d}-{slug_of(patient)}.json"
        write(os.path.join(out_dir, name), bundle(resources))
        summary.append((name, len(resources), "persona" if persona else "synthea"))
    print(f"{ehr['display']}: {len(directory_resources)} directory entries")
    for name, count, kind in summary:
        print(f"  {name:36} {count:5} resources  ({kind})")


def write(path, data):
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--synthea", required=True, help="directory holding out-cerner/ and out-athena/")
    parser.add_argument("--out", required=True, help="seed directory to write cerner/ and athena/ into")
    args = parser.parse_args()
    for ehr_key in EHRS:
        build_ehr(ehr_key, os.path.join(args.synthea, f"out-{ehr_key}"), os.path.join(args.out, ehr_key))


if __name__ == "__main__":
    main()
