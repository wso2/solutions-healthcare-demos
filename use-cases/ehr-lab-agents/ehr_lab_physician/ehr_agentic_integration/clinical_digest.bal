import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// FHIR in, compact JSON out. The patient summary, the lab order and the lab results travel through the
// workflow (and the read model) as FHIR JSON; this file parses them back into their FHIR R4 records with the
// library's parser, and condenses those records into the short JSON the agents' prompts and the published
// Longevity Record carry. The condensed shapes are prompt and publication formats, not an API: every API that
// returns clinical data returns the FHIR resources themselves.

# The patient summary (the IPS document) read back into FHIR records.
#
# + patient - the Patient
# + ehrName - the EHR it was read from (the Provenance agent)
# + source - how it was read: `summary-operation` or `composed-search` (the Provenance activity)
# + conditions - the Problem list section, in display order
# + allergies - the Allergies section
# + medications - the Medication summary section (prescribed and patient-reported)
# + labs - the Results section
# + vitals - the Vital signs section, newest first
# + social - the Social history section
# + familyHistory - the Family history section
# + flags - the Alerts section: the rule-based flags
# + careGaps - the Plan of care section: proposed baseline tests
# + biomarkers - the lab history per catalog analyte, as the rules read it
type IpsContents record {|
    international401:Patient patient;
    string ehrName;
    string 'source;
    international401:Condition[] conditions;
    international401:AllergyIntolerance[] allergies;
    Medication[] medications;
    international401:Observation[] labs;
    international401:Observation[] vitals;
    international401:Observation[] social;
    international401:FamilyMemberHistory[] familyHistory;
    international401:DetectedIssue[] flags;
    international401:ServiceRequest[] careGaps;
    BiomarkerSeries[] biomarkers;
|};

# Reads the patient summary back from FHIR JSON.
#
# + ips - the IPS document Bundle, as FHIR JSON
# + return - its contents as FHIR records, or an error if it is not a summary this integration built
isolated function ipsContents(json ips) returns IpsContents|error {
    r4:Bundle bundle = check (check parseFhir(ips)).ensureType();
    anydata[] parsed = parseResources(from r4:BundleEntry entry in bundle.entry ?: []
        select (<anydata>entry?.'resource).toJson());
    international401:Patient? patient = ();
    string ehrName = "EHR";
    string 'source = "composed-search";
    foreach anydata r in parsed {
        if r is international401:Patient {
            patient = r;
        } else if r is international401:Provenance {
            if r.agent.length() > 0 {
                ehrName = r.agent[0].who.display ?: ehrName;
            }
            'source = codingCode(r.activity, SUMMARY_SOURCE_SYSTEM) ?: 'source;
        }
    }
    if patient is () {
        return error("The patient summary has no Patient");
    }
    international401:Observation[] observations = from anydata r in parsed where r is international401:Observation select r;
    international401:Observation[] labs = from international401:Observation o in observations
        where hasCategory(o, "laboratory") select o;
    return {
        patient,
        ehrName,
        'source,
        conditions: from anydata r in parsed where r is international401:Condition select r,
        allergies: from anydata r in parsed where r is international401:AllergyIntolerance select r,
        medications: from anydata r in parsed where r is Medication select r,
        labs,
        vitals: from international401:Observation o in observations where hasCategory(o, "vital-signs") select o,
        social: from international401:Observation o in observations where hasCategory(o, "social-history") select o,
        familyHistory: from anydata r in parsed where r is international401:FamilyMemberHistory select r,
        flags: from anydata r in parsed where r is international401:DetectedIssue select r,
        careGaps: from anydata r in parsed where r is international401:ServiceRequest select r,
        biomarkers: biomarkerSeries(labs, ehrName)
    };
}

# The patient named in a summary, read without parsing the whole document (for the workflow's task titles).
#
# + ips - the IPS document Bundle, as FHIR JSON
# + return - the Composition subject's display name, or "the patient"
isolated function summaryPatientName(json ips) returns string {
    json[] entries = jsonArray(ips, "entry");
    return entries.length() > 0 ? jsonText(entries[0], "resource", "subject", "display") ?: "the patient" : "the patient";
}

# The lab results as filed in the EHR, read back from FHIR JSON.
#
# + results - the `collection` Bundle collectLabResults returns: the DiagnosticReport, then its Observations
# + return - the report and its Observations, or an error if the Bundle has no DiagnosticReport
isolated function labResultsContents(json results) returns [international401:DiagnosticReport, international401:Observation[]]|error {
    r4:Bundle bundle = check (check parseFhir(results)).ensureType();
    anydata[] parsed = parseResources(from r4:BundleEntry entry in bundle.entry ?: []
        select (<anydata>entry?.'resource).toJson());
    foreach anydata r in parsed {
        if r is international401:DiagnosticReport {
            return [r, from anydata o in parsed where o is international401:Observation select o];
        }
    }
    return error("The lab results have no DiagnosticReport");
}

# The lab order as placed in both systems, read back from FHIR JSON.
#
# + labOrder - the `collection` Bundle placeLabOrder returns: the EHR's ServiceRequest, then the lab's
# + return - the EHR's order of record and the lab's copy, or an error if the Bundle does not hold both
isolated function labOrderContents(json labOrder) returns [international401:ServiceRequest, international401:ServiceRequest]|error {
    r4:Bundle bundle = check (check parseFhir(labOrder)).ensureType();
    international401:ServiceRequest[] orders = from anydata r in parseResources(from r4:BundleEntry entry in bundle.entry ?: []
            select (<anydata>entry?.'resource).toJson())
        where r is international401:ServiceRequest
        select r;
    if orders.length() != 2 {
        return error(string `Expected the EHR's and the lab's ServiceRequest, found ${orders.length()}`);
    }
    return [orders[0], orders[1]];
}

# The catalog codes of the tests on an order.
#
# + serviceRequest - the order
# + return - the codes from `orderDetail` in the lab's test code system
isolated function orderedTestCodes(international401:ServiceRequest serviceRequest) returns string[] =>
    from r4:CodeableConcept detail in serviceRequest.orderDetail ?: []
    let string? code = codingCode(detail, LAB_TEST_CODE_SYSTEM)
    where code is string
    select code;

// ── Condensed JSON for prompts and the Longevity Record ──

# The patient, condensed.
#
# + ehr - the EHR id
# + ehrName - the EHR's display name
# + patient - the Patient
# + mrnSystem - the EHR's MRN identifier system
# + return - id, name, gender, birth date, age, MRN, city and phone
isolated function patientDigest(string ehr, string ehrName, international401:Patient patient, string mrnSystem)
        returns map<json> {
    r4:Address[] addresses = patient.address ?: [];
    string? phone = ();
    foreach r4:ContactPoint contact in patient.telecom ?: [] {
        if contact.system == "phone" {
            phone = contact.value;
            break;
        }
    }
    return {
        ehr: ehr,
        ehrName: ehrName,
        id: patient.id ?: "",
        name: patientName(patient.name),
        gender: patient.gender,
        birthDate: patient.birthDate,
        age: ageFrom(patient.birthDate),
        mrn: identifierValue(patient.identifier, mrnSystem),
        city: addresses.length() > 0 ? addresses[0].city : (),
        phone: phone
    };
}

isolated function conditionDigest(international401:Condition condition) returns map<json> => {
    display: stripSemanticTag(conceptText(condition.code) ?: "Unspecified condition"),
    code: codingCode(condition.code, ICD10) ?: codingCode(condition.code, SNOMED),
    onset: dateOnly(condition.onsetDateTime),
    abatement: dateOnly(condition.abatementDateTime),
    status: conditionStatus(condition)
};

isolated function allergyDigest(international401:AllergyIntolerance allergy) returns map<json> {
    international401:AllergyIntoleranceReactionSeverity? severity = ();
    foreach international401:AllergyIntoleranceReaction reaction in allergy.reaction ?: [] {
        international401:AllergyIntoleranceReactionSeverity? reactionSeverity = reaction.severity;
        if reactionSeverity == "severe" || (reactionSeverity == "moderate" && severity != "severe") || severity is () {
            severity = reactionSeverity ?: severity;
        }
    }
    international401:AllergyIntoleranceCategory[] categories = allergy.category ?: [];
    return {
        substance: allergySubstance(allergy),
        category: categories.length() > 0 ? categories[0] : (),
        criticality: allergy.criticality,
        reactions: allergyReactions(allergy),
        severity: severity,
        recorded: dateOnly(allergy.recordedDate)
    };
}

isolated function medicationDigest(Medication medication) returns map<json> {
    r4:Dosage[] dosage = [];
    string? until = ();
    if medication is international401:MedicationRequest {
        dosage = medication.dosageInstruction ?: [];
        until = dateOnly(medication.dispenseRequest?.validityPeriod?.end);
    } else if medication is international401:MedicationStatement {
        dosage = medication.dosage ?: [];
        until = dateOnly(medication.effectivePeriod?.end);
    }
    return {
        display: medicationDisplay(medication),
        status: medication.status,
        since: medicationSince(medication),
        until: until,
        dosage: dosage.length() > 0 ? dosage[0].text : (),
        'source: medicationSource(medication)
    };
}

isolated function familyHistoryDigest(international401:FamilyMemberHistory[] histories) returns json[] {
    json[] items = [];
    foreach international401:FamilyMemberHistory history in histories {
        string relationship = conceptText(history.relationship) ?: "relative";
        foreach international401:FamilyMemberHistoryCondition condition in history.condition ?: [] {
            decimal? onsetAge = condition.onsetAge?.value;
            items.push({relationship: relationship, condition: conceptText(condition.code) ?: "condition",
                onsetAge: onsetAge is decimal ? <int>onsetAge : ()});
        }
    }
    return items;
}

isolated function socialHistoryDigest(international401:Observation observation) returns map<json> {
    string? code = codingCode(observation.code, LOINC);
    return {
        label: code == LOINC_SMOKING ? "Smoking status" : code == LOINC_AUDIT_C ? "Alcohol use (AUDIT-C score)"
            : conceptText(observation.code) ?: "Social history",
        value: socialValue(observation),
        date: dateOnly(observation.effectiveDateTime)
    };
}

# The latest vital signs.
#
# + vitals - vital-sign Observations
# + return - the latest blood pressure (and its date), heart rate, respiratory rate, temperature, BMI, weight and height
isolated function latestVitalsDigest(international401:Observation[] vitals) returns map<json> {
    map<json> result = {};
    foreach international401:Observation o in from international401:Observation o in vitals
            order by o.effectiveDateTime ?: "" descending select o {
        string? code = codingCode(o.code, LOINC);
        decimal? value = o.valueQuantity?.value;
        if code == LOINC_BP_PANEL && !result.hasKey("systolic") {
            [decimal?, decimal?] [systolic, diastolic] = bloodPressure(o);
            result["systolic"] = systolic;
            result["diastolic"] = diastolic;
            result["bloodPressureDate"] = dateOnly(o.effectiveDateTime);
        }
        foreach [string, string] [loinc, key] in [[LOINC_BMI, "bmi"], [LOINC_WEIGHT, "weightKg"], [LOINC_HEIGHT, "heightCm"],
                [LOINC_HEART_RATE, "heartRate"], [LOINC_RESP_RATE, "respiratoryRate"], [LOINC_TEMPERATURE, "temperature"]] {
            if code == loinc && !result.hasKey(key) {
                result[key] = value;
            }
        }
    }
    return result;
}

isolated function flagDigest(international401:DetectedIssue issue) returns map<json> => {
    severity: issue.severity == "high" ? "concern" : issue.severity == "moderate" ? "watch" : "info",
    title: issue.code?.text ?: "",
    detail: issue.detail ?: ""
};

isolated function careGapDigest(international401:ServiceRequest gap) returns map<json> {
    r4:Annotation[] notes = gap.note ?: [];
    string[] suggestedTests = [];
    foreach r4:CodeableConcept detail in gap.orderDetail ?: [] {
        string? code = codingCode(detail, LAB_TEST_CODE_SYSTEM);
        if code is string {
            suggestedTests.push(code);
        }
    }
    return {
        title: gap.code?.text ?: "",
        detail: notes.length() > 0 ? notes[0].text : "",
        suggestedTests: suggestedTests
    };
}

isolated function biomarkerDigest(BiomarkerSeries series) returns map<json> {
    Analyte? analyte = analyteByCode(series.code);
    map<json> digest = <map<json>>series.toJson();
    digest["longevityTarget"] = analyte is Analyte ? analyte.longevityTarget : ();
    return digest;
}

# Lab results, one per Observation that has a LOINC code and a numeric value.
#
# + observations - the lab Observations
# + return - code, name, value, unit, interpretation, reference range and date of each
isolated function labResultsDigest(international401:Observation[] observations) returns map<json>[] {
    map<json>[] values = [];
    foreach international401:Observation observation in observations {
        decimal? value = observation.valueQuantity?.value;
        string? code = codingCode(observation.code, LOINC);
        if value is () || code is () {
            continue;
        }
        Analyte? analyte = analyteByCode(code);
        international401:ObservationReferenceRange[] ranges = observation.referenceRange ?: [];
        values.push({
            code: code,
            name: analyte is Analyte ? analyte.name : conceptText(observation.code) ?: code,
            value: value,
            unit: observation.valueQuantity?.unit ?: (analyte is Analyte ? analyte.unit : ""),
            interpretation: interpretationCode(observation),
            referenceLow: ranges.length() > 0 ? ranges[0].low?.value : (),
            referenceHigh: ranges.length() > 0 ? ranges[0].high?.value : (),
            effectiveDate: dateOnly(observation.effectiveDateTime) ?: ""
        });
    }
    return values;
}

# The whole summary condensed, as the Results Analysis agent reads it.
#
# + ehr - the EHR id
# + summary - the summary's contents
# + return - patient, problems, allergies, medications, family and social history, vitals, biomarker series,
# flags and care gaps
isolated function summaryDigest(string ehr, IpsContents summary) returns map<json> => {
    patient: patientDigest(ehr, summary.ehrName, summary.patient, mrnSystemOf(ehr)),
    conditions: from international401:Condition c in summary.conditions select conditionDigest(c),
    allergies: from international401:AllergyIntolerance a in summary.allergies select allergyDigest(a),
    medications: from Medication m in summary.medications select medicationDigest(m),
    socialHistory: from international401:Observation o in summary.social select socialHistoryDigest(o),
    familyHistory: familyHistoryDigest(summary.familyHistory),
    vitals: latestVitalsDigest(summary.vitals),
    biomarkers: from BiomarkerSeries s in summary.biomarkers select biomarkerDigest(s),
    flags: from international401:DetectedIssue f in summary.flags select flagDigest(f),
    careGaps: from international401:ServiceRequest g in summary.careGaps select careGapDigest(g)
};

# The EHR's MRN identifier system.
#
# + ehr - the EHR id
# + return - its MRN system, or an empty string for an unknown EHR
isolated function mrnSystemOf(string ehr) returns string {
    EhrSystemConfig|error system = ehrSystem(ehr);
    return system is EhrSystemConfig ? system.mrnSystem : "";
}
