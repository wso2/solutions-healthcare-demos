import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// The patient summary is deterministic: it is assembled from FHIR data with explicit rules, not by an
// LLM. A physician sees exactly what the EHR holds, every flag can be traced to a rule, and the same
// record always produces the same summary. Its sections follow the International Patient Summary.

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

# A change smaller than this (in percent) between first and last result reads as stable.
const decimal STABLE_CHANGE_PCT = 3;

# Medications that are NSAIDs, for the allergy cross-reactivity rule (matched on the medication name).
final readonly & string[] NSAIDS = ["ibuprofen", "naproxen", "diclofenac", "aspirin", "celecoxib", "meloxicam",
    "ketorolac", "indomethacin"];

# Builds the patient summary from the EHR record.
#
# + system - the EHR the record came from
# + ehrRecord - the record
# + return - the summary
isolated function buildSummary(EhrSystemConfig system, EhrRecord ehrRecord) returns PatientSummary {
    international401:Observation[] labs = from international401:Observation observation in ehrRecord.observations
        where hasCategory(observation, "laboratory")
        select observation;
    international401:Observation[] vitalObservations = from international401:Observation observation in ehrRecord.observations
        where hasCategory(observation, "vital-signs")
        select observation;
    international401:Observation[] social = from international401:Observation observation in ehrRecord.observations
        where hasCategory(observation, "social-history")
        select observation;

    PatientCard card = patientCard(system, ehrRecord.patient);
    BiomarkerSeries[] biomarkers = biomarkerSeries(labs, system.displayName);
    FamilyHistoryItem[] familyHistory = familyHistoryItems(ehrRecord.familyHistory);
    VitalSigns vitals = latestVitals(vitalObservations);
    AllergyItem[] allergies = allergyItems(ehrRecord.allergies);
    MedicationItem[] medications = medicationItems(ehrRecord.medicationRequests, ehrRecord.medicationStatements);
    SocialHistoryItem[] socialHistory = socialHistoryItems(social);

    return {
        patient: card,
        'source: ehrRecord.'source,
        fhirQueries: ehrRecord.queries,
        conditions: conditionItems(ehrRecord.conditions),
        allergies,
        medications,
        immunizations: immunizationItems(ehrRecord.immunizations),
        procedures: procedureItems(ehrRecord.procedures),
        socialHistory,
        familyHistory,
        encounters: encounterItems(ehrRecord.encounters),
        vitals,
        vitalTrends: vitalTrends(vitalObservations),
        biomarkers,
        flags: summaryFlags(biomarkers, familyHistory, vitals, card, allergies, medications, socialHistory),
        careGaps: careGaps(biomarkers),
        generatedAt: nowIso()
    };
}

// ── Biomarkers ──

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

    BiomarkerSeries[] series = [];
    foreach [string, international401:Observation[]] [code, group] in byCode.entries() {
        international401:Observation[] ordered = from international401:Observation observation in group
            order by <string>observation.effectiveDateTime ascending
            select observation;
        series.push(seriesFrom(code, ordered, ehrDisplayName));
    }
    // Analytes in catalog order, so the summary reads the same way every time.
    return from BiomarkerSeries s in series
        let int rank = catalogRank(s.code)
        order by rank ascending
        select s;
}

isolated function seriesFrom(string code, international401:Observation[] ordered, string ehrDisplayName)
        returns BiomarkerSeries {
    Analyte? analyte = analyteByCode(code);
    international401:Observation last = ordered[ordered.length() - 1];
    BiomarkerPoint[] points = from international401:Observation observation in ordered
        select {
            date: <string>dateOnly(observation.effectiveDateTime),
            value: <decimal>observation.valueQuantity?.value,
            interpretation: interpretationCode(observation),
            'source: observationSource(observation, ehrDisplayName)
        };
    decimal latest = points[points.length() - 1].value;
    decimal? previous = points.length() > 1 ? points[points.length() - 2].value : ();
    decimal first = points[0].value;
    decimal? changePct = points.length() > 1 && first != 0d ? roundTo((latest - first) / first * 100, 1) : ();

    string trend = "single";
    if changePct is decimal {
        trend = changePct.abs() < STABLE_CHANGE_PCT ? "stable" : (changePct > 0d ? "rising" : "falling");
    }
    international401:ObservationReferenceRange[] ranges = last.referenceRange ?: [];
    decimal? low = ranges.length() > 0 ? ranges[0].low?.value : ();
    decimal? high = ranges.length() > 0 ? ranges[0].high?.value : ();
    string status = high is decimal && latest > high ? "high" : (low is decimal && latest < low ? "low" : "normal");

    return {
        code,
        name: analyte is Analyte ? analyte.name : conceptText(last.code) ?: code,
        unit: last.valueQuantity?.unit ?: (analyte is Analyte ? analyte.unit : ""),
        points,
        latest,
        latestDate: points[points.length() - 1].date,
        previous,
        changePct,
        trend: <"rising"|"falling"|"stable"|"single">trend,
        status: <"normal"|"high"|"low">status,
        referenceLow: low,
        referenceHigh: high,
        longevityTarget: analyte is Analyte ? analyte.longevityTarget : ()
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

// ── Flags and gaps (each rule named so a physician can see why it fired) ──

isolated function summaryFlags(BiomarkerSeries[] biomarkers, FamilyHistoryItem[] familyHistory, VitalSigns vitals,
        PatientCard patient, AllergyItem[] allergies, MedicationItem[] medications,
        SocialHistoryItem[] socialHistory) returns SummaryFlag[] {
    SummaryFlag[] flags = [];

    // Rule: an active NSAID despite a recorded aspirin or NSAID allergy (cross-reactivity).
    foreach AllergyItem allergy in allergies {
        string substance = allergy.substance.toLowerAscii();
        if !(substance.includes("aspirin") || substance.includes("nsaid") || mentionsAny(substance, NSAIDS)) {
            continue;
        }
        foreach MedicationItem medication in medications {
            string name = medication.display.toLowerAscii();
            if medication.status == "active" && mentionsAny(name, NSAIDS) {
                flags.push({
                    severity: "concern",
                    title: string `NSAID in use despite ${allergy.substance} allergy`,
                    detail: string `${medication.display} (${medication.'source}) while the chart records an allergy to `
                        + string `${allergy.substance}${allergy.reactions.length() > 0 ? " (" + string:'join(", ", ...allergy.reactions) + ")" : ""}. `
                        + "NSAIDs cross-react with aspirin allergy."
                });
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
            flags.push({
                severity: s.status == "normal" ? "watch" : "concern",
                title: string `${s.name} ${analyte.adverse == "up" ? "rising" : "falling"} on ${s.points.length()} consecutive results`,
                detail: string `${path} ${s.unit} (${signed(s.changePct ?: 0d)}% since ${s.points[0].date}). Longevity target ${analyte.longevityTarget}.`,
                codes: [s.code]
            });
        } else if s.status != "normal" {
            // Rule: latest result outside the lab's reference range.
            flags.push({
                severity: "concern",
                title: string `${s.name} ${s.status} (${formatDecimal(s.latest)} ${s.unit})`,
                detail: string `Outside the reference range on ${s.latestDate}.`,
                codes: [s.code]
            });
        }
    }

    // Rule: HbA1c in the prediabetes range (ADA: 5.7–6.4 %).
    foreach BiomarkerSeries s in biomarkers {
        if s.code == "4548-4" && s.latest >= 5.7d && s.latest < 6.5d {
            flags.push({severity: "concern", title: "HbA1c in the prediabetes range",
                detail: string `${formatDecimal(s.latest)} % on ${s.latestDate} (ADA prediabetes range 5.7–6.4 %).`, codes: [s.code]});
        }
    }

    // Rule: premature ASCVD in a first-degree relative (male < 55, female < 65).
    foreach FamilyHistoryItem item in familyHistory {
        int? onset = item.onsetAge;
        string condition = item.condition.toLowerAscii();
        boolean cardiovascular = condition.includes("myocardial") || condition.includes("coronary") || condition.includes("stroke");
        boolean male = item.relationship == "father" || item.relationship == "brother";
        if cardiovascular && onset is int && onset < (male ? 55 : 65) {
            flags.push({severity: "concern", title: "Premature cardiovascular disease in the family",
                detail: string `${item.relationship}: ${item.condition} at age ${onset}. Raises inherited risk; Lp(a) is worth measuring.`});
        }
    }

    // Rule: blood pressure at or above 130/80 (ACC/AHA stage 1).
    decimal? systolic = vitals.systolic;
    decimal? diastolic = vitals.diastolic;
    if systolic is decimal && diastolic is decimal && (systolic >= 130d || diastolic >= 80d) {
        flags.push({severity: "watch", title: string `Blood pressure ${formatDecimal(systolic)}/${formatDecimal(diastolic)} mmHg`,
            detail: string `At or above the 130/80 mmHg stage-1 threshold on ${vitals.bloodPressureDate ?: "the last visit"}.`});
    }

    // Rule: BMI above the healthy range.
    decimal? bmi = vitals.bmi;
    if bmi is decimal && bmi >= 25d {
        flags.push({severity: bmi >= 30d ? "concern" : "watch", title: string `BMI ${formatDecimal(bmi)}`,
            detail: bmi >= 30d ? "In the obesity range." : "In the overweight range."});
    }

    // Rule: current smoker.
    foreach SocialHistoryItem item in socialHistory {
        string value = item.value.toLowerAscii();
        if item.label == "Smoking status" && (value.includes("every day") || value.includes("current") || value.includes("smokes")) {
            flags.push({severity: "concern", title: "Current smoker", detail: string `${item.value} (${item.date ?: "date unknown"}).`});
        }
    }

    if flags.length() == 0 {
        flags.push({severity: "info", title: "No rule-based risk flags",
            detail: string `No adverse trends or out-of-range results in the last ${summaryLookbackYears} years for ${patient.name}.`});
    }
    return flags;
}

isolated function careGaps(BiomarkerSeries[] biomarkers) returns CareGap[] {
    string[] measured = from BiomarkerSeries s in biomarkers select s.code;
    CareGap[] gaps = [];
    foreach Analyte analyte in ANALYTES {
        if analyte.baseline && measured.indexOf(analyte.code) is () {
            gaps.push({
                title: string `No ${analyte.name} on record`,
                detail: string `Part of the longevity baseline. Target ${analyte.longevityTarget}.`,
                suggestedTests: testsCovering([analyte.code])
            });
        }
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

// ── IPS sections ──

isolated function conditionItems(international401:Condition[] conditions) returns ConditionItem[] {
    ConditionItem[] items = from international401:Condition condition in conditions
        select {
            display: stripSemanticTag(conceptText(condition.code) ?: "Unspecified condition"),
            code: codingCode(condition.code, ICD10) ?: codingCode(condition.code, SNOMED),
            onset: dateOnly(condition.onsetDateTime),
            abatement: dateOnly(condition.abatementDateTime),
            status: codingCodeAny(condition.clinicalStatus)
        };
    // Active problems first, then the rest, newest first.
    return from ConditionItem item in items
        let int rank = item.status == "active" ? 0 : 1
        order by rank ascending, item.onset ?: "" descending
        select item;
}

isolated function allergyItems(international401:AllergyIntolerance[] allergies) returns AllergyItem[] {
    AllergyItem[] items = [];
    foreach international401:AllergyIntolerance allergy in allergies {
        string[] reactions = [];
        string? severity = ();
        foreach international401:AllergyIntoleranceReaction reaction in allergy.reaction ?: [] {
            foreach r4:CodeableConcept manifestation in reaction.manifestation {
                string? text = conceptText(manifestation);
                if text is string {
                    reactions.push(stripSemanticTag(text));
                }
            }
            string? reactionSeverity = reaction.severity;
            if reactionSeverity == "severe" || (reactionSeverity == "moderate" && severity != "severe") || severity is () {
                severity = reactionSeverity ?: severity;
            }
        }
        string[] categories = from var category in allergy.category ?: [] select category.toString();
        string? criticality = allergy.criticality;
        items.push({
            substance: stripSemanticTag(conceptText(allergy.code) ?: "Unknown substance"),
            category: categories.length() > 0 ? categories[0] : (),
            criticality: criticality,
            reactions,
            severity,
            recorded: dateOnly(allergy.recordedDate)
        });
    }
    // High-criticality allergies first.
    return from AllergyItem item in items
        let int rank = item.criticality == "high" ? 0 : 1
        order by rank ascending
        select item;
}

isolated function medicationItems(international401:MedicationRequest[] requests,
        international401:MedicationStatement[] statements) returns MedicationItem[] {
    MedicationItem[] items = from international401:MedicationRequest medication in requests
        let r4:Dosage[] dosage = medication.dosageInstruction ?: []
        select {
            display: conceptText(medication.medicationCodeableConcept) ?: "Medication",
            status: medication.status,
            since: dateOnly(medication.authoredOn),
            until: dateOnly(medication.dispenseRequest?.validityPeriod?.end),
            dosage: dosage.length() > 0 ? dosage[0].text : (),
            'source: "prescribed"
        };
    foreach international401:MedicationStatement statement in statements {
        r4:Dosage[] dosage = statement.dosage ?: [];
        items.push({
            display: conceptText(statement.medicationCodeableConcept) ?: "Medication",
            status: statement.status,
            since: dateOnly(statement.effectivePeriod?.'start ?: statement.effectiveDateTime),
            until: dateOnly(statement.effectivePeriod?.end),
            dosage: dosage.length() > 0 ? dosage[0].text : (),
            'source: "patient-reported"
        });
    }
    // Current medications first, then history, newest first.
    return from MedicationItem item in items
        let int rank = item.status == "active" ? 0 : 1
        order by rank ascending, item.since ?: "" descending
        select item;
}

isolated function immunizationItems(international401:Immunization[] immunizations) returns ImmunizationItem[] {
    ImmunizationItem[] items = from international401:Immunization immunization in immunizations
        order by immunization.occurrenceDateTime ?: "" descending
        select {
            vaccine: conceptText(immunization.vaccineCode) ?: "Vaccine",
            date: dateOnly(immunization.occurrenceDateTime),
            status: immunization.status
        };
    return items.length() > 25 ? items.slice(0, 25) : items;
}

# Recent procedures, one row per kind (the latest), so a yearly screening does not fill the list.
#
# + procedures - the patient's procedures
# + return - the latest of each kind, newest first, at most 15
isolated function procedureItems(international401:Procedure[] procedures) returns ProcedureItem[] {
    map<ProcedureItem> latest = {};
    foreach international401:Procedure procedure in procedures {
        string display = stripSemanticTag(conceptText(procedure.code) ?: "Procedure");
        string? date = dateOnly(procedure.performedPeriod?.'start ?: procedure.performedDateTime);
        ProcedureItem? existing = latest[display];
        if existing is () || (existing.date ?: "") < (date ?: "") {
            latest[display] = {display, date, status: procedure.status};
        }
    }
    ProcedureItem[] items = from ProcedureItem item in latest
        order by item.date ?: "" descending
        select item;
    return items.length() > 15 ? items.slice(0, 15) : items;
}

isolated function socialHistoryItems(international401:Observation[] observations) returns SocialHistoryItem[] {
    SocialHistoryItem[] items = [];
    string[] seen = [];
    international401:Observation[] newestFirst = from international401:Observation observation in observations
        order by observation.effectiveDateTime ?: "" descending
        select observation;
    foreach international401:Observation observation in newestFirst {
        string? code = codingCode(observation.code, LOINC);
        if code is () || seen.indexOf(code) is int {
            continue;
        }
        string? value = conceptText(observation.valueCodeableConcept);
        decimal? quantity = observation.valueQuantity?.value;
        if value is () && quantity is decimal {
            value = formatDecimal(quantity);
        }
        if value is () {
            continue;
        }
        seen.push(code);
        string label = code == LOINC_SMOKING ? "Smoking status" : code == LOINC_AUDIT_C ? "Alcohol use (AUDIT-C score)"
            : conceptText(observation.code) ?: "Social history";
        items.push({label, value: stripSemanticTag(value), date: dateOnly(observation.effectiveDateTime)});
    }
    return items;
}

isolated function familyHistoryItems(international401:FamilyMemberHistory[] histories) returns FamilyHistoryItem[] {
    FamilyHistoryItem[] items = [];
    foreach international401:FamilyMemberHistory history in histories {
        string relationship = conceptText(history.relationship) ?: "relative";
        foreach international401:FamilyMemberHistoryCondition condition in history.condition ?: [] {
            decimal? onsetAge = condition.onsetAge?.value;
            items.push({
                relationship,
                condition: conceptText(condition.code) ?: "condition",
                onsetAge: onsetAge is decimal ? <int>onsetAge : ()
            });
        }
    }
    return items;
}

isolated function encounterItems(international401:Encounter[] encounters) returns EncounterItem[] {
    EncounterItem[] items = from international401:Encounter encounter in encounters
        let r4:CodeableConcept[] types = encounter.'type ?: []
        let r4:CodeableConcept[] reasons = encounter.reasonCode ?: []
        order by encounter.period?.'start ?: "" descending
        select {
            id: encounter.id ?: "",
            date: dateOnly(encounter.period?.'start),
            'type: types.length() > 0 ? stripSemanticTag(conceptText(types[0]) ?: "Visit") : "Visit",
            reason: reasons.length() > 0 ? conceptText(reasons[0]) : (),
            status: encounter.status,
            provider: encounter.serviceProvider?.display
        };
    return items.length() > 8 ? items.slice(0, 8) : items;
}

isolated function latestVitals(international401:Observation[] vitals) returns VitalSigns {
    international401:Observation[] newestFirst = from international401:Observation observation in vitals
        order by observation.effectiveDateTime ?: "" descending
        select observation;
    VitalSigns result = {};
    foreach international401:Observation observation in newestFirst {
        string? code = codingCode(observation.code, LOINC);
        decimal? value = observation.valueQuantity?.value;
        if code == LOINC_BP_PANEL && result.systolic is () {
            [decimal?, decimal?] [systolic, diastolic] = bloodPressure(observation);
            result.systolic = systolic;
            result.diastolic = diastolic;
            result.bloodPressureDate = dateOnly(observation.effectiveDateTime);
        } else if code == LOINC_BMI && result.bmi is () {
            result.bmi = value;
        } else if code == LOINC_WEIGHT && result.weightKg is () {
            result.weightKg = value;
        } else if code == LOINC_HEIGHT && result.heightCm is () {
            result.heightCm = value;
        } else if code == LOINC_HEART_RATE && result.heartRate is () {
            result.heartRate = value;
        } else if code == LOINC_RESP_RATE && result.respiratoryRate is () {
            result.respiratoryRate = value;
        } else if code == LOINC_TEMPERATURE && result.temperature is () {
            result.temperature = value;
        }
    }
    return result;
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

# Blood pressure, weight, BMI and heart rate over the lookback window, for the summary's charts.
#
# + vitals - the patient's vital-sign Observations
# + return - one trend per vital sign that has readings
isolated function vitalTrends(international401:Observation[] vitals) returns VitalTrend[] {
    [string, string, string][] tracked = [
        [LOINC_BP_PANEL, "Blood pressure", "mmHg"],
        [LOINC_WEIGHT, "Weight", "kg"],
        [LOINC_BMI, "BMI", "kg/m2"],
        [LOINC_HEART_RATE, "Heart rate", "/min"]
    ];
    VitalTrend[] trends = [];
    foreach [string, string, string] [code, name, unit] in tracked {
        VitalPoint[] points = [];
        foreach international401:Observation observation in vitals {
            string? date = dateOnly(observation.effectiveDateTime);
            if codingCode(observation.code, LOINC) != code || date is () {
                continue;
            }
            if code == LOINC_BP_PANEL {
                [decimal?, decimal?] [systolic, diastolic] = bloodPressure(observation);
                if systolic is decimal {
                    points.push({date, value: systolic, value2: diastolic});
                }
            } else {
                decimal? value = observation.valueQuantity?.value;
                if value is decimal {
                    points.push({date, value});
                }
            }
        }
        if points.length() > 0 {
            trends.push({code, name, unit, points: from VitalPoint p in points order by p.date ascending select p});
        }
    }
    return trends;
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

isolated function roundTo(decimal value, int places) returns decimal => value.round(places);

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
