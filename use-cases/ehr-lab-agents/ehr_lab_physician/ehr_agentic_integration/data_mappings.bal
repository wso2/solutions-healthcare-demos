// Rule-based (deterministic) Summary agent and Composition building for patientSummary.
// This is the `ai.mode = rule-based` implementation of the "Summary agent" described in
// section 4 of the spec: it produces short templated narratives per section instead of
// calling an LLM, so the demo works offline. LLM mode is added in a later phase.

import ballerina/time;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

const string SECTION_SYSTEM = "urn:wso2:longevity:section";
const string LOINC_SYSTEM = "http://loinc.org";

# Builds a simple XHTML div wrapper around plain text, as required by FHIR Narrative.div.
isolated function toNarrativeDiv(string text) returns string =>
    string `<div xmlns="http://www.w3.org/1999/xhtml">${text}</div>`;

# Derives a display name for a patient from their HumanName entries.
isolated function buildPatientDisplayName(r4:HumanName[]? names) returns string {
    if names is () || names.length() == 0 {
        return "Unknown patient";
    }
    r4:HumanName firstName = names[0];
    string? text = firstName.text;
    if text is string {
        return text;
    }
    string[] nameParts = [...(firstName.given ?: [])];
    string? family = firstName.family;
    if family is string {
        nameParts.push(family);
    }
    return string:'join(" ", ...nameParts);
}

# Produces a short, deterministic clinical narrative for the patient overview section.
isolated function summariseOverview(international401:Patient patient, international401:Condition[] conditions,
        international401:Observation[] biomarkers) returns string {
    string ageText = "";
    string? birthDate = patient.birthDate;
    if birthDate is string && birthDate.length() >= 4 {
        int|error birthYear = int:fromString(birthDate.substring(0, 4));
        if birthYear is int {
            time:Civil nowCivil = time:utcToCivil(time:utcNow());
            ageText = string `${nowCivil.year - birthYear} y/o `;
        }
    }
    string genderText = patient.gender is string ? genderInitial(<string>patient.gender) + ". " : "";

    string conditionsText = conditions.length() > 0
        ? string `${conditions.length()} active/provisional condition(s) on record.`
        : "No active conditions on record.";

    string trendText = describeTrend(biomarkers);

    return string `${ageText}${genderText}${conditionsText} ${trendText}`.trim();
}

isolated function genderInitial(string gender) returns string {
    if gender == "male" {
        return "M";
    } else if gender == "female" {
        return "F";
    }
    return "";
}

# Describes a simple rising/falling trend for LDL-C if enough history is present; otherwise a neutral note.
isolated function describeTrend(international401:Observation[] biomarkers) returns string {
    international401:Observation[] ldl = from international401:Observation observation in biomarkers
        where hasLoincCode(observation.code, "13457-7") || hasLoincCode(observation.code, "2089-1")
        select observation;

    if ldl.length() >= 2 {
        international401:Observation[] sorted = ldl.clone();
        sorted = from international401:Observation observation in sorted
            order by observation.effectiveDateTime ascending
            select observation;
        international401:Observation first = sorted[0];
        international401:Observation last = sorted[sorted.length() - 1];
        decimal? firstValue = first.valueQuantity?.value;
        decimal? lastValue = last.valueQuantity?.value;
        if firstValue is decimal && lastValue is decimal {
            string unit = last.valueQuantity?.unit ?: "";
            if lastValue > firstValue {
                return string `LDL-C trending up (${firstValue} -> ${lastValue} ${unit}).`;
            } else if lastValue < firstValue {
                return string `LDL-C trending down (${firstValue} -> ${lastValue} ${unit}).`;
            }
        }
    }
    return "No significant biomarker trend detected.";
}

isolated function hasLoincCode(r4:CodeableConcept? concept, string code) returns boolean {
    if concept is () {
        return false;
    }
    r4:Coding[]? codings = concept.coding;
    if codings is () {
        return false;
    }
    foreach r4:Coding coding in codings {
        if coding.system == LOINC_SYSTEM && coding.code == code {
            return true;
        }
    }
    return false;
}

# Produces a short narrative describing recent encounters.
isolated function summariseEncounters(international401:Encounter[] encounters) returns string {
    if encounters.length() == 0 {
        return "No recent encounters on record.";
    }
    return string `${encounters.length()} encounter(s) in the lookback period.`;
}

# Produces a short narrative describing the patient's conditions.
isolated function summariseConditions(international401:Condition[] conditions) returns string {
    if conditions.length() == 0 {
        return "No conditions recorded.";
    }
    string[] displays = from international401:Condition condition in conditions
        let string? display = condition.code?.text ?: (condition.code?.coding is r4:Coding[] && (<r4:Coding[]>condition.code?.coding).length() > 0 ? (<r4:Coding[]>condition.code?.coding)[0].display : ())
        where display is string
        select <string>display;
    if displays.length() == 0 {
        return string `${conditions.length()} condition(s) recorded.`;
    }
    return string `Conditions: ${string:'join(", ", ...displays)}.`;
}

# Produces a short narrative summarising the most recent biomarker observations.
isolated function summariseBiomarkers(international401:Observation[] biomarkers) returns string {
    if biomarkers.length() == 0 {
        return "No recent laboratory biomarkers on record.";
    }
    return string `${biomarkers.length()} recent biomarker result(s) on record. ${describeTrend(biomarkers)}`.trim();
}

# Produces a short narrative describing diagnostic reports.
isolated function summariseDiagnosticReports(international401:DiagnosticReport[] reports) returns string {
    if reports.length() == 0 {
        return "No diagnostic reports on record.";
    }
    return string `${reports.length()} diagnostic report(s) in the lookback period.`;
}

# Generates all section narratives for the patient summary (rule-based Summary agent).
isolated function generateRuleBasedSummary(international401:Patient patient, international401:Encounter[] encounters,
        international401:Condition[] conditions, international401:Observation[] biomarkers,
        international401:DiagnosticReport[] reports) returns SummaryNarratives => {
    overview: summariseOverview(patient, conditions, biomarkers),
    encounters: summariseEncounters(encounters),
    conditions: summariseConditions(conditions),
    biomarkers: summariseBiomarkers(biomarkers),
    diagnosticReports: summariseDiagnosticReports(reports)
};

# Builds the patient-summary `document` Bundle: a leading Composition (with optional AI narrative)
# followed by the source resources (Patient, Encounters, Conditions, Observations, DiagnosticReports).
isolated function buildPatientSummaryBundle(international401:Patient patient, international401:Encounter[] encounters,
        international401:Condition[] conditions, international401:Observation[] biomarkers,
        international401:DiagnosticReport[] reports, boolean includeNarrative) returns r4:Bundle|error {
    string nowString = time:utcToString(time:utcNow());
    string? patientId = patient.id;
    r4:Reference subjectRef = {reference: string `Patient/${patientId ?: ""}`};

    international401:CompositionSection overviewSection = {
        title: "Overview",
        code: {coding: [{system: SECTION_SYSTEM, code: "overview"}]}
    };
    international401:CompositionSection encountersSection = {
        title: "Recent encounters",
        code: {coding: [{system: SECTION_SYSTEM, code: "encounters"}]},
        entry: from international401:Encounter encounter in encounters
            select {reference: string `Encounter/${encounter.id ?: ""}`}
    };
    international401:CompositionSection conditionsSection = {
        title: "Conditions",
        code: {coding: [{system: LOINC_SYSTEM, code: "11450-4", display: "Problem list"}]},
        entry: from international401:Condition condition in conditions
            select {reference: string `Condition/${condition.id ?: ""}`}
    };
    international401:CompositionSection biomarkersSection = {
        title: "Biomarkers",
        code: {coding: [{system: SECTION_SYSTEM, code: "biomarkers"}]},
        entry: from international401:Observation observation in biomarkers
            select {reference: string `Observation/${observation.id ?: ""}`}
    };
    international401:CompositionSection diagnosticReportsSection = {
        title: "Diagnostic reports",
        code: {coding: [{system: LOINC_SYSTEM, code: "30954-2", display: "Relevant diagnostic tests"}]},
        entry: from international401:DiagnosticReport report in reports
            select {reference: string `DiagnosticReport/${report.id ?: ""}`}
    };

    if includeNarrative {
        SummaryNarratives narratives = generateRuleBasedSummary(patient, encounters, conditions, biomarkers, reports);
        overviewSection.text = {status: "generated", div: toNarrativeDiv(narratives.overview)};
        encountersSection.text = {status: "generated", div: toNarrativeDiv(narratives.encounters)};
        conditionsSection.text = {status: "generated", div: toNarrativeDiv(narratives.conditions)};
        biomarkersSection.text = {status: "generated", div: toNarrativeDiv(narratives.biomarkers)};
        diagnosticReportsSection.text = {status: "generated", div: toNarrativeDiv(narratives.diagnosticReports)};
    }

    r4:HumanName[]? names = patient.name;
    string patientDisplayName = buildPatientDisplayName(names);

    international401:Composition composition = {
        resourceType: "Composition",
        status: "preliminary",
        'type: {coding: [{system: LOINC_SYSTEM, code: "60591-5", display: "Patient summary Document"}]},
        subject: subjectRef,
        date: nowString,
        author: [{reference: "Device/longevity-ai-agent", display: "Longevity AI Agent"}],
        title: string `Longevity baseline summary - ${patientDisplayName}`,
        'section: [overviewSection, encountersSection, conditionsSection, biomarkersSection, diagnosticReportsSection]
    };

    r4:BundleEntry[] entries = [
        {fullUrl: string `urn:uuid:${check generateWorkflowId()}`, 'resource: composition}
    ];
    entries.push({fullUrl: string `${apiBaseUrl}/Patient/${patientId ?: ""}`, 'resource: patient});
    foreach international401:Encounter encounter in encounters {
        entries.push({fullUrl: string `${apiBaseUrl}/Encounter/${encounter.id ?: ""}`, 'resource: encounter});
    }
    foreach international401:Condition condition in conditions {
        entries.push({fullUrl: string `${apiBaseUrl}/Condition/${condition.id ?: ""}`, 'resource: condition});
    }
    foreach international401:Observation observation in biomarkers {
        entries.push({fullUrl: string `${apiBaseUrl}/Observation/${observation.id ?: ""}`, 'resource: observation});
    }
    foreach international401:DiagnosticReport report in reports {
        entries.push({fullUrl: string `${apiBaseUrl}/DiagnosticReport/${report.id ?: ""}`, 'resource: report});
    }

    return {
        resourceType: "Bundle",
        'type: "document",
        timestamp: nowString,
        entry: entries
    };
}
