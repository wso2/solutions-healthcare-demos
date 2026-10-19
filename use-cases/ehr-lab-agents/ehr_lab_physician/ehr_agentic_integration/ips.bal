import ballerina/uuid;

// The International Patient Summary as a FHIR document (Bundle type `document`, Composition first),
// built from the same EHR record as the on-screen summary. When the EHR implements `Patient/$summary`
// the integration reads its IPS instead; this is what it composes for EHRs that do not.

const string IPS_DOCUMENT_TYPE = "60591-5";
const string LIST_EMPTY_REASON = "http://terminology.hl7.org/CodeSystem/list-empty-reason";

# Builds the patient's IPS document.
#
# + system - the EHR the record came from
# + ehrRecord - the patient's record
# + return - the IPS as a FHIR document Bundle
isolated function buildIpsBundle(EhrSystemConfig system, EhrRecord ehrRecord) returns json {
    string base = system.fhirBaseUrl;
    string patientId = ehrRecord.patient.id ?: "";
    string patientRef = string `Patient/${patientId}`;

    json[] resources = [ehrRecord.patient.toJson()];
    json[] sections = [];

    json[] problems = from var c in ehrRecord.conditions select c.toJson();
    sections.push(ipsSection("Problem list", "11450-4", "Problem list - Reported", problems, true));
    resources.push(...problems);

    json[] allergies = from var a in ehrRecord.allergies select a.toJson();
    sections.push(ipsSection("Allergies and intolerances", "48765-2", "Allergies and adverse reactions Document", allergies, true));
    resources.push(...allergies);

    json[] medications = [];
    foreach var request in ehrRecord.medicationRequests {
        if request.status == "active" {
            medications.push(request.toJson());
        }
    }
    foreach var statement in ehrRecord.medicationStatements {
        if statement.status == "active" {
            medications.push(statement.toJson());
        }
    }
    sections.push(ipsSection("Medication summary", "10160-0", "History of Medication use Narrative", medications, true));
    resources.push(...medications);

    json[] immunizations = from var i in ehrRecord.immunizations select i.toJson();
    sections.push(ipsSection("Immunizations", "11369-6", "History of Immunization Narrative", immunizations, false));
    resources.push(...immunizations);

    json[] results = [];
    json[] vitals = [];
    json[] social = [];
    foreach var observation in ehrRecord.observations {
        if hasCategory(observation, "laboratory") {
            results.push(observation.toJson());
        } else if hasCategory(observation, "vital-signs") {
            vitals.push(observation.toJson());
        } else if hasCategory(observation, "social-history") {
            social.push(observation.toJson());
        }
    }
    sections.push(ipsSection("Results", "30954-2", "Relevant diagnostic tests/laboratory data Narrative", results, false));
    sections.push(ipsSection("Vital signs", "8716-3", "Vital signs", vitals, false));
    resources.push(...results);
    resources.push(...vitals);

    json[] procedures = from var p in ehrRecord.procedures select p.toJson();
    sections.push(ipsSection("History of procedures", "47519-4", "History of Procedures Document", procedures, false));
    resources.push(...procedures);

    sections.push(ipsSection("Social history", "29762-2", "Social history Narrative", social, false));
    resources.push(...social);

    string compositionId = uuid:createType4AsString();
    json composition = {
        resourceType: "Composition",
        id: compositionId,
        status: "final",
        'type: {coding: [{system: LOINC, code: IPS_DOCUMENT_TYPE, display: "Patient summary Document"}]},
        subject: {reference: patientRef, display: patientName(ehrRecord.patient.name)},
        date: nowIso(),
        author: [{display: string `EHR + Lab integration, from ${system.displayName}`}],
        title: string `International Patient Summary — ${patientName(ehrRecord.patient.name)}`,
        confidentiality: "N",
        custodian: {display: system.displayName},
        section: sections
    };

    json[] entries = [{fullUrl: string `urn:uuid:${compositionId}`, 'resource: composition}];
    foreach json r in resources {
        entries.push({fullUrl: string `${base}/${jsonText(r, "resourceType") ?: ""}/${jsonText(r, "id") ?: ""}`, 'resource: r});
    }
    return {
        resourceType: "Bundle",
        id: uuid:createType4AsString(),
        identifier: {system: "urn:ietf:rfc:3986", value: string `urn:uuid:${uuid:createType4AsString()}`},
        'type: "document",
        timestamp: nowIso(),
        entry: entries
    };
}

# One IPS section. A required section with no entries says so explicitly ("nil known"), as the IPS asks.
#
# + title - section title
# + code - its LOINC code
# + display - the LOINC display
# + resources - the resources in the section
# + required - whether the IPS requires the section
# + return - the Composition section
isolated function ipsSection(string title, string code, string display, json[] resources, boolean required) returns json {
    json[] entries = from json r in resources
        select {reference: string `${jsonText(r, "resourceType") ?: ""}/${jsonText(r, "id") ?: ""}`};
    map<json> section = {
        title,
        code: {coding: [{system: LOINC, code, display}]},
        text: {status: "generated", div: string `<div xmlns="http://www.w3.org/1999/xhtml">${title}: ${entries.length()} entries</div>`}
    };
    if entries.length() > 0 {
        section["entry"] = entries;
    } else if required {
        section["emptyReason"] = {coding: [{system: LIST_EMPTY_REASON, code: "nilknown", display: "Nil Known"}]};
    }
    return section;
}
