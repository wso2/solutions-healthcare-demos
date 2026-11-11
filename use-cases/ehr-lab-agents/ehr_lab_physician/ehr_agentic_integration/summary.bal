import ballerina/uuid;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// The patient summary is an International Patient Summary: a FHIR document (Bundle type `document`, the
// Composition first) built from the EHR record. It is deterministic — assembled with explicit rules, not by an
// LLM — so a physician sees exactly what the EHR holds, every flag can be traced to a rule, and the same record
// always produces the same document. Beyond the IPS sections it carries the clinic's own findings as FHIR:
//   - each rule-based flag is a DetectedIssue in the Alerts section;
//   - each missing longevity-baseline test is a proposed ServiceRequest in the Plan of care section;
//   - a Provenance records how the record was read (Patient/$summary or composed searches) and every query.
// The portal renders it, FHIR clients get it from `Patient/{id}/$summary`, and the agents read a digest of it
// (clinical_digest.bal).

const string SNOMED = "http://snomed.info/sct";
const string ICD10 = "http://hl7.org/fhir/sid/icd-10-cm";

const string LOINC_BP_PANEL = "85354-9";
const string LOINC_SYSTOLIC = "8480-6";
const string LOINC_DIASTOLIC = "8462-4";
const string LOINC_BMI = "39156-5";
const string LOINC_WEIGHT = "29463-7";
const string LOINC_HEIGHT = "8302-2";
const string LOINC_HEART_RATE = "8867-4";
const string LOINC_RESP_RATE = "9279-1";
const string LOINC_TEMPERATURE = "8310-5";
const string LOINC_SMOKING = "72166-2";
const string LOINC_AUDIT_C = "75626-2";

const string IPS_DOCUMENT_TYPE = "60591-5";
const string LIST_EMPTY_REASON = "http://terminology.hl7.org/CodeSystem/list-empty-reason";
# How the summary was read, on its Provenance: `summary-operation` or `composed-search`.
const string SUMMARY_SOURCE_SYSTEM = "urn:demo:longevity:summary-source";

# A change smaller than this (in percent) between first and last result reads as stable.
const decimal STABLE_CHANGE_PCT = 3;

# Medications that are NSAIDs, for the allergy cross-reactivity rule (matched on the medication name).
final readonly & string[] NSAIDS = ["ibuprofen", "naproxen", "diclofenac", "aspirin", "celecoxib", "meloxicam",
    "ketorolac", "indomethacin"];

# A medication of either kind the summary lists.
type Medication international401:MedicationRequest|international401:MedicationStatement;

# A resource an IPS section can hold.
type IpsResource international401:Patient|international401:Condition|international401:AllergyIntolerance
    |international401:MedicationRequest|international401:MedicationStatement|international401:Immunization
    |international401:Observation|international401:Procedure|international401:FamilyMemberHistory
    |international401:Encounter|international401:DetectedIssue|international401:ServiceRequest;

// ── The document ──

# Builds the patient summary: the IPS document, with the clinic's rule-based flags and care gaps.
#
# + system - the EHR the record came from
# + ehrRecord - the record
# + return - the IPS as a FHIR document Bundle
isolated function buildSummary(EhrSystemConfig system, EhrRecord ehrRecord) returns r4:Bundle {
    international401:Patient patient = ehrRecord.patient;
    string patientId = patient.id ?: "";
    string name = patientName(patient.name);
    r4:Reference subject = {reference: string `Patient/${patientId}`, display: name};

    international401:Observation[] labs = from international401:Observation o in ehrRecord.observations
        where hasCategory(o, "laboratory") select o;
    international401:Observation[] vitals = from international401:Observation o in ehrRecord.observations
        where hasCategory(o, "vital-signs") order by o.effectiveDateTime ?: "" descending select o;
    international401:Observation[] social = latestPerCode(from international401:Observation o in ehrRecord.observations
        where hasCategory(o, "social-history") select o);

    international401:Condition[] conditions = from international401:Condition c in ehrRecord.conditions
        let int rank = conditionStatus(c) == "active" ? 0 : 1
        order by rank ascending, c.onsetDateTime ?: "" descending
        select c;
    international401:AllergyIntolerance[] allergies = from international401:AllergyIntolerance a in ehrRecord.allergies
        let int rank = a.criticality == "high" ? 0 : 1
        order by rank ascending
        select a;
    Medication[] medications = from Medication m in [...ehrRecord.medicationRequests, ...ehrRecord.medicationStatements]
        let int rank = m.status == "active" ? 0 : 1
        order by rank ascending, medicationSince(m) ?: "" descending
        select m;
    international401:Immunization[] immunizations = from international401:Immunization i in ehrRecord.immunizations
        order by i.occurrenceDateTime ?: "" descending limit 25 select i;
    international401:Procedure[] procedures = latestProcedures(ehrRecord.procedures);
    international401:Encounter[] encounters = from international401:Encounter e in ehrRecord.encounters
        order by e.period?.'start ?: "" descending limit 8 select e;

    BiomarkerSeries[] biomarkers = biomarkerSeries(labs, system.displayName);
    international401:DetectedIssue[] flags = summaryFlags(subject, biomarkers, ehrRecord.familyHistory, vitals,
            allergies, medications, social, name);
    international401:ServiceRequest[] gaps = careGaps(subject, biomarkers);

    IpsResource[] medicationResources = medications;
    international401:CompositionSection[] sections = [
        ipsSection("Problem list", "11450-4", "Problem list - Reported", conditions, true),
        ipsSection("Allergies and intolerances", "48765-2", "Allergies and adverse reactions Document", allergies, true),
        ipsSection("Medication summary", "10160-0", "History of Medication use Narrative", medicationResources, true),
        ipsSection("Immunizations", "11369-6", "History of Immunization Narrative", immunizations, false),
        ipsSection("Results", "30954-2", "Relevant diagnostic tests/laboratory data Narrative", labs, false),
        ipsSection("Vital signs", "8716-3", "Vital signs", vitals, false),
        ipsSection("History of procedures", "47519-4", "History of Procedures Document", procedures, false),
        ipsSection("Social history", "29762-2", "Social history Narrative", social, false),
        ipsSection("Family history", "10157-6", "History of family member diseases Narrative", ehrRecord.familyHistory, false),
        ipsSection("Encounters", "46240-8", "History of Hospitalizations+Outpatient visits Narrative", encounters, false),
        ipsSection("Alerts", "104605-1", "Alert", flags, false),
        ipsSection("Plan of care", "18776-5", "Plan of care note", gaps, false)
    ];

    string compositionId = uuid:createType4AsString();
    string generatedAt = nowIso();
    international401:Composition composition = {
        id: compositionId,
        status: "final",
        'type: {coding: [{system: LOINC, code: IPS_DOCUMENT_TYPE, display: "Patient summary Document"}]},
        subject,
        date: generatedAt,
        author: [{display: string `EHR + Lab integration, from ${system.displayName}`}],
        title: string `International Patient Summary — ${name}`,
        confidentiality: "N",
        custodian: {display: system.displayName},
        section: sections
    };
    international401:Provenance provenance = {
        id: uuid:createType4AsString(),
        target: [{reference: string `Composition/${compositionId}`}],
        recorded: generatedAt,
        activity: {coding: [{system: SUMMARY_SOURCE_SYSTEM, code: ehrRecord.'source,
            display: ehrRecord.'source == "summary-operation" ? "Read with Patient/$summary" : "Composed from FHIR searches"}]},
        agent: [{who: {display: system.displayName}}],
        entity: from string fhirQuery in ehrRecord.queries select {role: "source", what: {display: fhirQuery}}
    };

    IpsResource[] resources = [patient, ...conditions, ...allergies, ...medicationResources, ...immunizations, ...labs,
        ...vitals, ...procedures, ...social, ...ehrRecord.familyHistory, ...encounters];
    r4:BundleEntry[] entries = [{fullUrl: string `urn:uuid:${compositionId}`, 'resource: composition}];
    foreach IpsResource r in resources {
        entries.push({fullUrl: string `${system.fhirBaseUrl}/${relativeReference(r)}`, 'resource: r});
    }
    foreach IpsResource r in [...flags, ...gaps] {
        entries.push({fullUrl: string `urn:uuid:${uuid:createType4AsString()}`, 'resource: r});
    }
    entries.push({fullUrl: string `urn:uuid:${provenance.id ?: ""}`, 'resource: provenance});
    return {
        id: uuid:createType4AsString(),
        identifier: {system: "urn:ietf:rfc:3986", value: string `urn:uuid:${uuid:createType4AsString()}`},
        'type: "document",
        timestamp: generatedAt,
        entry: entries
    };
}

# One IPS section. A required section with no entries says so explicitly ("nil known"), as the IPS asks.
#
# + title - section title
# + code - its LOINC code
# + display - the LOINC display
# + resources - the resources in the section, in display order
# + required - whether the IPS requires the section
# + return - the Composition section
isolated function ipsSection(string title, string code, string display, IpsResource[] resources, boolean required)
        returns international401:CompositionSection {
    r4:Reference[] entries = from IpsResource r in resources select {reference: relativeReference(r)};
    international401:CompositionSection section = {
        title,
        code: {coding: [{system: LOINC, code, display}]},
        text: {status: "generated", div: string `<div xmlns="http://www.w3.org/1999/xhtml">${title}: ${entries.length()} entries</div>`}
    };
    if entries.length() > 0 {
        section.entry = entries;
    } else if required {
        section.emptyReason = {coding: [{system: LIST_EMPTY_REASON, code: "nilknown", display: "Nil Known"}]};
    }
    return section;
}

# A resource's relative reference, e.g. `Condition/123`.
#
# + r - the resource
# + return - the reference
isolated function relativeReference(IpsResource r) returns string => string `${r.resourceType}/${r?.id ?: ""}`;

# Recent procedures, one per kind (the latest), so a yearly screening does not fill the list.
#
# + procedures - the patient's procedures
# + return - the latest of each kind, newest first, at most 15
isolated function latestProcedures(international401:Procedure[] procedures) returns international401:Procedure[] {
    map<international401:Procedure> latest = {};
    foreach international401:Procedure procedure in procedures {
        string display = stripSemanticTag(conceptText(procedure.code) ?: "Procedure");
        international401:Procedure? existing = latest[display];
        if existing is () || (procedureDate(existing) ?: "") < (procedureDate(procedure) ?: "") {
            latest[display] = procedure;
        }
    }
    return from international401:Procedure p in latest
        order by procedureDate(p) ?: "" descending
        limit 15
        select p;
}

# The newest Observation of each LOINC code.
#
# + observations - the Observations
# + return - one per code, newest first
isolated function latestPerCode(international401:Observation[] observations) returns international401:Observation[] {
    international401:Observation[] latest = [];
    string[] seen = [];
    foreach international401:Observation o in from international401:Observation o in observations
            order by o.effectiveDateTime ?: "" descending select o {
        string? code = codingCode(o.code, LOINC);
        if code is string && seen.indexOf(code) is () {
            seen.push(code);
            latest.push(o);
        }
    }
    return latest;
}

// ── Biomarkers (the rules' view of the lab history; the portal derives the same series from the Results section) ──

# A lab result in an analyte's history.
#
# + date - when the sample was taken
# + value - the result
# + interpretation - the lab's flag (H, L, N)
# + source - the system the result came from
type BiomarkerPoint record {|
    string date;
    decimal value;
    string? interpretation;
    string 'source;
|};

# One analyte's history, oldest first, with the deterministic trend read from it.
#
# + code - catalog LOINC code
# + name - display name
# + unit - unit of the latest result
# + points - every result, oldest first
# + latest - the most recent value
# + latestDate - date of the most recent value
# + previous - the value before the latest, or nil with a single result
# + changePct - change from the first to the latest value in percent, or nil with a single result
# + trend - direction of that change; `single` when there is only one result
# + status - the latest value against the lab's reference range
# + referenceLow - lower bound of the lab's reference range on the latest result
# + referenceHigh - upper bound of the lab's reference range on the latest result
type BiomarkerSeries record {|
    string code;
    string name;
    string unit;
    BiomarkerPoint[] points;
    decimal latest;
    string latestDate;
    decimal? previous;
    decimal? changePct;
    "rising"|"falling"|"stable"|"single" trend;
    "normal"|"high"|"low" status;
    decimal? referenceLow;
    decimal? referenceHigh;
|};

# One series per catalog analyte. Results filed under an equivalent LOINC code join the catalog
# analyte's series; analytes the clinic does not interpret are left to the explorer.
#
# + labs - the patient's lab Observations
# + ehrDisplayName - the EHR's name, as the source of results it did not get from the lab
# + return - the series, in catalog order
isolated function biomarkerSeries(international401:Observation[] labs, string ehrDisplayName) returns BiomarkerSeries[] {
    map<international401:Observation[]> byCode = {};
    foreach international401:Observation observation in labs {
        string? code = codingCode(observation.code, LOINC);
        if code is () || observation.valueQuantity?.value is () || observation.effectiveDateTime is () {
            continue;
        }
        Analyte? analyte = analyteByCode(code);
        if analyte is () {
            continue;
        }
        international401:Observation[] group = byCode[analyte.code] ?: [];
        group.push(observation);
        byCode[analyte.code] = group;
    }
    BiomarkerSeries[] series = from [string, international401:Observation[]] [code, group] in byCode.entries()
        let international401:Observation[] ordered = from international401:Observation o in group
            order by <string>o.effectiveDateTime ascending select o
        select seriesFrom(code, ordered, ehrDisplayName);
    return from BiomarkerSeries s in series
        let int rank = catalogRank(s.code)
        order by rank ascending
        select s;
}

isolated function seriesFrom(string code, international401:Observation[] ordered, string ehrDisplayName)
        returns BiomarkerSeries {
    Analyte? analyte = analyteByCode(code);
    international401:Observation last = ordered[ordered.length() - 1];
    BiomarkerPoint[] points = from international401:Observation o in ordered
        select {
            date: <string>dateOnly(o.effectiveDateTime),
            value: <decimal>o.valueQuantity?.value,
            interpretation: interpretationCode(o),
            'source: observationSource(o, ehrDisplayName)
        };
    decimal latest = points[points.length() - 1].value;
    decimal first = points[0].value;
    international401:ObservationReferenceRange[] ranges = last.referenceRange ?: [];
    decimal? low = ranges.length() > 0 ? ranges[0].low?.value : ();
    decimal? high = ranges.length() > 0 ? ranges[0].high?.value : ();
    decimal? changePct = points.length() > 1 && first != 0d ? ((latest - first) / first * 100).round(1) : ();
    return {
        code,
        name: analyte is Analyte ? analyte.name : conceptText(last.code) ?: code,
        unit: last.valueQuantity?.unit ?: (analyte is Analyte ? analyte.unit : ""),
        points,
        latest,
        latestDate: points[points.length() - 1].date,
        previous: points.length() > 1 ? points[points.length() - 2].value : (),
        changePct,
        trend: changePct is () ? "single" : changePct.abs() < STABLE_CHANGE_PCT ? "stable" : changePct > 0d ? "rising" : "falling",
        status: high is decimal && latest > high ? "high" : (low is decimal && latest < low ? "low" : "normal"),
        referenceLow: low,
        referenceHigh: high
    };
}

isolated function catalogRank(string code) returns int {
    foreach int i in 0 ..< ANALYTES.length() {
        if ANALYTES[i].code == code {
            return i;
        }
    }
    return ANALYTES.length();
}

// ── Flags (DetectedIssue) and care gaps (proposed ServiceRequest); each rule named so a physician sees why ──

isolated function summaryFlags(r4:Reference subject, BiomarkerSeries[] biomarkers,
        international401:FamilyMemberHistory[] familyHistory, international401:Observation[] vitalsNewestFirst,
        international401:AllergyIntolerance[] allergies, Medication[] medications,
        international401:Observation[] social, string patientDisplayName) returns international401:DetectedIssue[] {
    international401:DetectedIssue[] flags = [];
    // Rule: an active NSAID despite a recorded aspirin or NSAID allergy (cross-reactivity).
    foreach international401:AllergyIntolerance allergy in allergies {
        string substance = allergySubstance(allergy);
        string lower = substance.toLowerAscii();
        if !(lower.includes("aspirin") || lower.includes("nsaid") || mentionsAny(lower, NSAIDS)) {
            continue;
        }
        string[] reactions = allergyReactions(allergy);
        foreach Medication medication in medications {
            string display = medicationDisplay(medication);
            if medication.status == "active" && mentionsAny(display.toLowerAscii(), NSAIDS) {
                flags.push(flag(subject, "high", string `NSAID in use despite ${substance} allergy`,
                        string `${display} (${medicationSource(medication)}) while the chart records an allergy to `
                        + string `${substance}${reactions.length() > 0 ? " (" + string:'join(", ", ...reactions) + ")" : ""}. `
                        + "NSAIDs cross-react with aspirin allergy.", []));
            }
        }
    }

    foreach BiomarkerSeries s in biomarkers {
        Analyte? analyte = analyteByCode(s.code);
        if analyte is () {
            continue;
        }
        // Rule: a sustained adverse trend across three or more results, even inside the reference range.
        if s.points.length() >= 3 && isMonotonic(s.points, analyte.adverse) {
            string path = string:'join(" → ", ...from BiomarkerPoint p in s.points select formatDecimal(p.value));
            flags.push(flag(subject, s.status == "normal" ? "moderate" : "high",
                    string `${s.name} ${analyte.adverse == "up" ? "rising" : "falling"} on ${s.points.length()} consecutive results`,
                    string `${path} ${s.unit} (${signed(s.changePct ?: 0d)}% since ${s.points[0].date}). Longevity target ${analyte.longevityTarget}.`,
                    [s.code]));
        } else if s.status != "normal" {
            // Rule: latest result outside the lab's reference range.
            flags.push(flag(subject, "high", string `${s.name} ${s.status} (${formatDecimal(s.latest)} ${s.unit})`,
                    string `Outside the reference range on ${s.latestDate}.`, [s.code]));
        }
    }

    // Rule: HbA1c in the prediabetes range (ADA: 5.7–6.4 %).
    foreach BiomarkerSeries s in biomarkers {
        if s.code == "4548-4" && s.latest >= 5.7d && s.latest < 6.5d {
            flags.push(flag(subject, "high", "HbA1c in the prediabetes range",
                    string `${formatDecimal(s.latest)} % on ${s.latestDate} (ADA prediabetes range 5.7–6.4 %).`, [s.code]));
        }
    }

    // Rule: premature ASCVD in a first-degree relative (male < 55, female < 65).
    foreach international401:FamilyMemberHistory history in familyHistory {
        string relationship = conceptText(history.relationship) ?: "relative";
        foreach international401:FamilyMemberHistoryCondition condition in history.condition ?: [] {
            decimal? onsetAge = condition.onsetAge?.value;
            string conditionText = conceptText(condition.code) ?: "condition";
            string lower = conditionText.toLowerAscii();
            boolean cardiovascular = lower.includes("myocardial") || lower.includes("coronary") || lower.includes("stroke");
            boolean male = relationship == "father" || relationship == "brother";
            if cardiovascular && onsetAge is decimal && <int>onsetAge < (male ? 55 : 65) {
                flags.push(flag(subject, "high", "Premature cardiovascular disease in the family",
                        string `${relationship}: ${conditionText} at age ${<int>onsetAge}. Raises inherited risk; Lp(a) is worth measuring.`, []));
            }
        }
    }

    // Rule: blood pressure at or above 130/80 (ACC/AHA stage 1).
    foreach international401:Observation o in vitalsNewestFirst {
        if codingCode(o.code, LOINC) == LOINC_BP_PANEL {
            [decimal?, decimal?] [systolic, diastolic] = bloodPressure(o);
            if systolic is decimal && diastolic is decimal && (systolic >= 130d || diastolic >= 80d) {
                flags.push(flag(subject, "moderate", string `Blood pressure ${formatDecimal(systolic)}/${formatDecimal(diastolic)} mmHg`,
                        string `At or above the 130/80 mmHg stage-1 threshold on ${dateOnly(o.effectiveDateTime) ?: "the last visit"}.`, []));
            }
            break;
        }
    }

    // Rule: BMI above the healthy range.
    foreach international401:Observation o in vitalsNewestFirst {
        decimal? bmi = o.valueQuantity?.value;
        if codingCode(o.code, LOINC) == LOINC_BMI && bmi is decimal {
            if bmi >= 25d {
                flags.push(flag(subject, bmi >= 30d ? "high" : "moderate", string `BMI ${formatDecimal(bmi)}`,
                        bmi >= 30d ? "In the obesity range." : "In the overweight range.", []));
            }
            break;
        }
    }

    // Rule: current smoker.
    foreach international401:Observation o in social {
        string value = (socialValue(o) ?: "").toLowerAscii();
        if codingCode(o.code, LOINC) == LOINC_SMOKING
                && (value.includes("every day") || value.includes("current") || value.includes("smokes")) {
            flags.push(flag(subject, "high", "Current smoker",
                    string `${socialValue(o) ?: ""} (${dateOnly(o.effectiveDateTime) ?: "date unknown"}).`, []));
        }
    }

    if flags.length() == 0 {
        flags.push(flag(subject, "low", "No rule-based risk flags",
                string `No adverse trends or out-of-range results in the last ${summaryLookbackYears} years for ${patientDisplayName}.`, []));
    }
    foreach int i in 0 ..< flags.length() {
        flags[i].id = string `flag-${i + 1}`;
    }
    return flags;
}

# A rule-based flag as a DetectedIssue.
#
# + subject - the patient
# + severity - high (concern), moderate (watch) or low (info)
# + title - the finding
# + detail - the values behind it
# + codes - LOINC codes of the analytes it is about
# + return - the DetectedIssue
isolated function flag(r4:Reference subject, international401:DetectedIssueSeverity severity, string title,
        string detail, string[] codes) returns international401:DetectedIssue {
    international401:DetectedIssue issue = {
        status: "final",
        severity,
        code: {text: title},
        patient: subject,
        identifiedDateTime: nowIso(),
        detail
    };
    if codes.length() > 0 {
        issue.evidence = [{code: from string code in codes select {coding: [{system: LOINC, code}]}}];
    }
    return issue;
}

# Longevity-baseline tests the patient has never had, as proposed lab orders.
#
# + subject - the patient
# + biomarkers - the analytes on record
# + return - one proposed ServiceRequest per gap, in catalog order
isolated function careGaps(r4:Reference subject, BiomarkerSeries[] biomarkers) returns international401:ServiceRequest[] {
    string[] measured = from BiomarkerSeries s in biomarkers select s.code;
    international401:ServiceRequest[] gaps = [];
    foreach Analyte analyte in ANALYTES {
        if !analyte.baseline || measured.indexOf(analyte.code) is int {
            continue;
        }
        gaps.push({
            id: string `gap-${gaps.length() + 1}`,
            status: "draft",
            intent: "proposal",
            code: {text: string `No ${analyte.name} on record`},
            subject,
            orderDetail: from string testCode in testsCovering([analyte.code])
                let OrderableTest? test = orderableByCode(testCode)
                select {coding: [{system: LAB_TEST_CODE_SYSTEM, code: testCode, display: test is OrderableTest ? test.name : testCode}]},
            note: [{text: string `Part of the longevity baseline. Target ${analyte.longevityTarget}.`}]
        });
    }
    return gaps;
}

isolated function mentionsAny(string text, readonly & string[] words) returns boolean {
    foreach string word in words {
        if text.includes(word) {
            return true;
        }
    }
    return false;
}

isolated function isMonotonic(BiomarkerPoint[] points, "up"|"down" direction) returns boolean {
    foreach int i in 1 ..< points.length() {
        decimal delta = points[i].value - points[i - 1].value;
        if (direction == "up" && delta <= 0d) || (direction == "down" && delta >= 0d) {
            return false;
        }
    }
    return true;
}

// ── Readers over the resources (shared with clinical_digest.bal) ──

isolated function conditionStatus(international401:Condition condition) returns string? => codingCodeAny(condition.clinicalStatus);

isolated function allergySubstance(international401:AllergyIntolerance allergy) returns string =>
    stripSemanticTag(conceptText(allergy.code) ?: "Unknown substance");

isolated function allergyReactions(international401:AllergyIntolerance allergy) returns string[] {
    string[] reactions = [];
    foreach international401:AllergyIntoleranceReaction reaction in allergy.reaction ?: [] {
        foreach r4:CodeableConcept manifestation in reaction.manifestation {
            string? text = conceptText(manifestation);
            if text is string {
                reactions.push(stripSemanticTag(text));
            }
        }
    }
    return reactions;
}

isolated function medicationDisplay(Medication medication) returns string =>
    conceptText(medication.medicationCodeableConcept) ?: "Medication";

isolated function medicationSource(Medication medication) returns "prescribed"|"patient-reported" =>
    medication is international401:MedicationRequest ? "prescribed" : "patient-reported";

isolated function medicationSince(Medication medication) returns string? {
    if medication is international401:MedicationRequest {
        return dateOnly(medication.authoredOn);
    }
    if medication is international401:MedicationStatement {
        return dateOnly(medication.effectivePeriod?.'start ?: medication.effectiveDateTime);
    }
    return ();
}

isolated function procedureDate(international401:Procedure procedure) returns string? =>
    dateOnly(procedure.performedPeriod?.'start ?: procedure.performedDateTime);

isolated function socialValue(international401:Observation observation) returns string? {
    string? value = conceptText(observation.valueCodeableConcept);
    decimal? quantity = observation.valueQuantity?.value;
    if value is string {
        return stripSemanticTag(value);
    }
    return quantity is decimal ? formatDecimal(quantity) : ();
}

isolated function bloodPressure(international401:Observation observation) returns [decimal?, decimal?] {
    decimal? systolic = ();
    decimal? diastolic = ();
    foreach international401:ObservationComponent component in observation.component ?: [] {
        string? componentCode = codingCode(component.code, LOINC);
        if componentCode == LOINC_SYSTOLIC {
            systolic = component.valueQuantity?.value;
        } else if componentCode == LOINC_DIASTOLIC {
            diastolic = component.valueQuantity?.value;
        }
    }
    return [systolic, diastolic];
}

isolated function hasCategory(international401:Observation observation, string category) returns boolean {
    foreach r4:CodeableConcept concept in observation.category ?: [] {
        foreach r4:Coding coding in concept.coding ?: [] {
            if coding.code == category {
                return true;
            }
        }
    }
    return false;
}

isolated function codingCodeAny(r4:CodeableConcept? concept) returns string? {
    r4:Coding[] codings = concept?.coding ?: [];
    return codings.length() > 0 ? codings[0].code : ();
}

# "Hypertension (disorder)" → "Hypertension": SNOMED CT's semantic tags are noise to a reader.
#
# + text - a SNOMED CT display
# + return - the display without a trailing semantic tag
isolated function stripSemanticTag(string text) returns string {
    string trimmed = text.trim();
    if trimmed.endsWith(")") {
        int? open = trimmed.lastIndexOf(" (");
        if open is int {
            string tag = trimmed.substring(open + 2, trimmed.length() - 1);
            if ["disorder", "finding", "procedure", "substance", "situation", "regime/therapy", "observable entity",
                    "organism", "person", "event", "qualifier value"].indexOf(tag) is int {
                return trimmed.substring(0, open);
            }
        }
    }
    return trimmed;
}

isolated function signed(decimal value) returns string => value > 0d ? string `+${formatDecimal(value)}` : formatDecimal(value);

# 206.0 → "206", 5.90 → "5.9": values as a clinician would write them.
#
# + value - the value to format
# + return - the value without trailing zeros
isolated function formatDecimal(decimal value) returns string {
    if value == value.floor() {
        return (<int>value).toString();
    }
    string text = value.toString();
    while text.includes(".") && text.endsWith("0") {
        text = text.substring(0, text.length() - 1);
    }
    return text;
}
