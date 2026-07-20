import ballerina/time;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

// Lab/diagnostic LOINC codes prefilled from the patient's FHIR record.
const string LOINC_CHOLESTEROL = "2093-3";
const string LOINC_FASTING_GLUCOSE = "1558-6";
const string LOINC_RESTING_ECG = "8601-7";

// Kaggle stress-test / symptom features (Oldpeak, ST_Slope, ChestPainType, ExerciseAngina) have no clean standard LOINC in the Kaggle categorical form, so Care Loop uses a project-local code system for the seeded demo values. Swap these constants (and the seed data) for real codes when integrating a genuine stress-test / symptom source.
const string CODE_OLDPEAK = "st-depression-oldpeak";
const string CODE_ST_SLOPE = "st-slope-peak-exercise";
const string CODE_CHEST_PAIN = "chest-pain-type";
const string CODE_EXERCISE_ANGINA = "exercise-induced-angina";

const decimal FASTING_GLUCOSE_THRESHOLD = 120.0;
const int SECONDS_PER_DAY = 86400;

# One Observation reduced to the value shapes prefill cares about.
#
# + code - the first LOINC/local code on the Observation
# + quantity - valueQuantity.value, if present
# + text - valueString or valueCodeableConcept.text, if present
# + time - parsed effectiveDateTime, or now if unparseable
type ObservationValue record {|
    string code;
    float? quantity;
    string? text;
    time:Utc time;
|};

# Builds the feature set from the patient's FHIR record. age/sex/maxHr are already known from the
# vitals cycle; every clinical feature is looked up and left nil when absent. All lookups tolerate
# search errors and missing data by returning nil rather than failing the cycle.
#
# + patientId - the FHIR Patient id
# + age - age in years, already derived
# + sex - biological sex, already derived
# + maxHr - max heart rate over the recent window, already computed
# + now - the instant to measure "recent" against
# + return - the prefilled feature slots
isolated function prefillFeatures(string patientId, float age, "M"|"F" sex, float maxHr, time:Utc now) returns FeatureSlots {
    return {
        age,
        sex,
        maxHr,
        restingBp: latestSystolicBp(patientId, now),
        cholesterol: latestQuantity(patientId, LOINC_CHOLESTEROL),
        fastingBs: deriveFastingBs(patientId),
        restingEcg: deriveRestingEcg(patientId),
        oldpeak: latestQuantity(patientId, CODE_OLDPEAK),
        stSlope: deriveStSlope(patientId),
        chestPainType: deriveChestPainType(patientId),
        exerciseAngina: deriveExerciseAngina(patientId)
    };
}

# Maps the feature slots onto the heart-risk-service /predict request. The service is
# reject-incomplete: all nine model features must be non-nil or it returns 422, so the seeded FHIR
# record is expected to supply the full set. resting_bp/resting_ecg are unused by the model.
#
# + slots - the feature set to send
# + return - the /predict request body
isolated function toHeartRiskRequest(FeatureSlots slots) returns HeartRiskRequest {
    return {
        age: slots.age,
        sex: slots.sex,
        max_hr: slots.maxHr,
        chest_pain_type: slots.chestPainType,
        resting_bp: slots.restingBp,
        cholesterol: slots.cholesterol,
        fasting_bs: slots.fastingBs,
        resting_ecg: slots.restingEcg,
        exercise_angina: slots.exerciseAngina,
        oldpeak: slots.oldpeak,
        st_slope: slots.stSlope
    };
}

isolated function searchObservationValues(string patientId, string code) returns ObservationValue[] {
    map<string[]> params = {"patient": [patientId], "code": [code]};
    fhir:FHIRResponse|fhir:FHIRError response = fhirConnector->search("Observation", searchParameters = params);
    if response is fhir:FHIRError {
        return [];
    }
    return parseObservationValues(<json>response.'resource);
}

isolated function parseObservationValues(json bundle) returns ObservationValue[] {
    ObservationValue[] values = [];
    r4:Bundle|error typedBundle = bundle.cloneWithType(r4:Bundle);
    if typedBundle is error {
        return values;
    }
    foreach r4:BundleEntry entry in typedBundle.entry ?: [] {
        anydata|r4:FHIRWireFormat? entryResource = entry?.'resource;
        international401:Observation|error observation = entryResource.cloneWithType(international401:Observation);
        if observation is error {
            continue;
        }
        r4:Coding[] codings = observation.code.coding ?: [];
        string? code = codings.length() > 0 ? codings[0].code : ();
        if code is () {
            continue;
        }
        time:Utc observedAt = time:utcNow();
        string? effective = observation.effectiveDateTime;
        if effective is string {
            time:Utc|time:Error parsed = time:utcFromString(effective);
            if parsed is time:Utc {
                observedAt = parsed;
            }
        }
        decimal? decimalValue = observation.valueQuantity?.value;
        float? quantity = decimalValue is decimal ? <float>decimalValue : ();
        string? text = observation.valueString ?: observation.valueCodeableConcept?.text;
        values.push({code, quantity, text, time: observedAt});
    }
    return values;
}

isolated function latest(ObservationValue[] values) returns ObservationValue? {
    ObservationValue? best = ();
    foreach ObservationValue value in values {
        if best is () || time:utcDiffSeconds(value.time, best.time) > 0d {
            best = value;
        }
    }
    return best;
}

isolated function latestQuantity(string patientId, string code) returns float? {
    ObservationValue[] values = searchObservationValues(patientId, code).filter(v => v.quantity is float);
    ObservationValue? best = latest(values);
    return best is ObservationValue ? best.quantity : ();
}

isolated function latestSystolicBp(string patientId, time:Utc now) returns float? {
    final time:Utc windowStart = time:utcAddSeconds(now, <decimal>(-(bpRecentDays * SECONDS_PER_DAY)));
    ObservationValue[] recent = searchObservationValues(patientId, LOINC_BP_SYSTOLIC)
        .filter(v => v.quantity is float && time:utcDiffSeconds(v.time, windowStart) >= 0d);
    ObservationValue? best = latest(recent);
    return best is ObservationValue ? best.quantity : ();
}

isolated function deriveFastingBs(string patientId) returns int? {
    ObservationValue? glucose = latest(searchObservationValues(patientId, LOINC_FASTING_GLUCOSE).filter(v => v.quantity is float));
    if glucose is ObservationValue {
        float value = <float>glucose.quantity;
        return value > <float>FASTING_GLUCOSE_THRESHOLD ? 1 : 0;
    }
    return hasActiveDiabetes(patientId) ? 1 : ();
}

isolated function hasActiveDiabetes(string patientId) returns boolean {
    map<string[]> params = {"patient": [patientId]};
    fhir:FHIRResponse|fhir:FHIRError response = fhirConnector->search("Condition", searchParameters = params);
    if response is fhir:FHIRError {
        return false;
    }
    r4:Bundle|error typedBundle = (<json>response.'resource).cloneWithType(r4:Bundle);
    if typedBundle is error {
        return false;
    }
    foreach r4:BundleEntry entry in typedBundle.entry ?: [] {
        anydata|r4:FHIRWireFormat? entryResource = entry?.'resource;
        international401:Condition|error condition = entryResource.cloneWithType(international401:Condition);
        if condition is error {
            continue;
        }
        r4:Coding[] statusCodings = condition.clinicalStatus?.coding ?: [];
        boolean active = statusCodings.length() > 0 && statusCodings[0].code == "active";
        if !active {
            continue;
        }
        if mentionsDiabetes(condition) {
            return true;
        }
    }
    return false;
}

isolated function mentionsDiabetes(international401:Condition condition) returns boolean {
    string text = (condition.code?.text ?: "").toLowerAscii();
    if text.includes("diabetes") {
        return true;
    }
    foreach r4:Coding coding in condition.code?.coding ?: [] {
        if (coding.display ?: "").toLowerAscii().includes("diabetes") {
            return true;
        }
    }
    return false;
}

isolated function deriveRestingEcg(string patientId) returns "Normal"|"ST"|"LVH"? {
    ObservationValue? best = latest(searchObservationValues(patientId, LOINC_RESTING_ECG));
    return best is ObservationValue ? classifyEcgText(best.text) : ();
}

isolated function classifyEcgText(string? raw) returns "Normal"|"ST"|"LVH"? {
    string text = (raw ?: "").toLowerAscii();
    if text.includes("lvh") || text.includes("hypertroph") {
        return "LVH";
    }
    if text.includes("st") {
        return "ST";
    }
    if text.includes("normal") {
        return "Normal";
    }
    return ();
}

isolated function deriveStSlope(string patientId) returns "Up"|"Flat"|"Down"? {
    ObservationValue? best = latest(searchObservationValues(patientId, CODE_ST_SLOPE));
    return best is ObservationValue ? classifyStSlopeText(best.text) : ();
}

isolated function classifyStSlopeText(string? raw) returns "Up"|"Flat"|"Down"? {
    string text = (raw ?: "").trim().toLowerAscii();
    if text.startsWith("up") {
        return "Up";
    }
    if text.startsWith("flat") {
        return "Flat";
    }
    if text.startsWith("down") {
        return "Down";
    }
    return ();
}

isolated function deriveChestPainType(string patientId) returns "TA"|"ATA"|"NAP"|"ASY"? {
    ObservationValue? best = latest(searchObservationValues(patientId, CODE_CHEST_PAIN));
    return best is ObservationValue ? classifyChestPainText(best.text) : ();
}

// Accepts the Kaggle codes (ASY/ATA/NAP/TA) or descriptive text. ASY and ATA are checked before the TA keyword so "atypical" is not mistaken for "typical angina".
isolated function classifyChestPainText(string? raw) returns "TA"|"ATA"|"NAP"|"ASY"? {
    string text = (raw ?: "").trim().toUpperAscii();
    if text.startsWith("ASY") || text.includes("ASYMPTOMATIC") {
        return "ASY";
    }
    if text.startsWith("ATA") || text.includes("ATYPICAL") {
        return "ATA";
    }
    if text.startsWith("NAP") || text.includes("NON-ANGINAL") || text.includes("NONANGINAL") {
        return "NAP";
    }
    if text.startsWith("TA") || text.includes("TYPICAL") {
        return "TA";
    }
    return ();
}

isolated function deriveExerciseAngina(string patientId) returns "Y"|"N"? {
    ObservationValue? best = latest(searchObservationValues(patientId, CODE_EXERCISE_ANGINA));
    return best is ObservationValue ? classifyExerciseAnginaText(best.text) : ();
}

isolated function classifyExerciseAnginaText(string? raw) returns "Y"|"N"? {
    string text = (raw ?: "").trim().toUpperAscii();
    if text.startsWith("Y") || text.includes("YES") || text.includes("PRESENT") {
        return "Y";
    }
    if text.startsWith("N") || text.includes("NO") || text.includes("ABSENT") {
        return "N";
    }
    return ();
}
