import ballerina/lang.array;
import ballerina/log;
import ballerina/time;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Everything the integration reads from or writes to an EHR goes through this file. Each function
// names the EHR it talks to: the physician picks Cerner or Athena, and every write for an assessment
// goes back to the EHR the patient's record came from.

# The patient record as pulled from an EHR, before it is summarised.
#
# + patient - the Patient resource
# + conditions - the patient's Conditions
# + allergies - the patient's AllergyIntolerances
# + medicationRequests - the patient's prescriptions, current and past
# + medicationStatements - medications the patient reported (over the counter, from elsewhere)
# + immunizations - the patient's Immunizations
# + procedures - the patient's recent Procedures
# + familyHistory - the patient's FamilyMemberHistory entries
# + encounters - the patient's recent Encounters
# + observations - recent lab, vital-sign and social-history Observations
# + source - `summary-operation` or `composed-search`, depending on how the record was read
# + queries - the FHIR requests that produced the record, for the portal
type EhrRecord record {|
    international401:Patient patient;
    international401:Condition[] conditions;
    international401:AllergyIntolerance[] allergies;
    international401:MedicationRequest[] medicationRequests;
    international401:MedicationStatement[] medicationStatements;
    international401:Immunization[] immunizations;
    international401:Procedure[] procedures;
    international401:FamilyMemberHistory[] familyHistory;
    international401:Encounter[] encounters;
    international401:Observation[] observations;
    string 'source;
    string[] queries;
|};

// ── Capability detection ──

isolated map<boolean> summaryOperationSupport = {};

# Whether the EHR advertises `Patient/$summary` (the IPS operation) in its CapabilityStatement.
# Read once per EHR and cached; an unreachable EHR counts as "no" and is asked again next time.
#
# + ehr - the EHR id
# + return - true when the EHR supports `Patient/$summary`
isolated function ehrSupportsSummaryOperation(string ehr) returns boolean {
    lock {
        boolean? cached = summaryOperationSupport[ehr];
        if cached is boolean {
            return cached;
        }
    }
    fhir:FHIRConnector|error connector = ehrClient(ehr);
    if connector is error {
        return false;
    }
    fhir:FHIRResponse|fhir:FHIRError response = connector->getConformance();
    if response is fhir:FHIRError {
        log:printWarn("Could not read the EHR CapabilityStatement; using composed searches", response, ehr = ehr);
        return false;
    }
    boolean supported = capabilityHasOperation(<json>response.'resource, "summary");
    lock {
        summaryOperationSupport[ehr] = supported;
    }
    log:printInfo("EHR capability detected", ehr = ehr, summaryOperation = supported);
    return supported;
}

isolated function capabilityHasOperation(json capability, string operationName) returns boolean {
    json|error rest = capability.rest;
    if rest !is json[] {
        return false;
    }
    foreach json restEntry in rest {
        json[] operations = [];
        json|error systemOps = restEntry.operation;
        if systemOps is json[] {
            operations.push(...systemOps);
        }
        json|error resources = restEntry.'resource;
        if resources is json[] {
            foreach json resourceEntry in resources {
                json|error resourceOps = resourceEntry.operation;
                if resourceEntry.'type == "Patient" && resourceOps is json[] {
                    operations.push(...resourceOps);
                }
            }
        }
        foreach json operation in operations {
            json|error name = operation.name;
            if name is string && (name == operationName || name == "$" + operationName) {
                return true;
            }
        }
    }
    return false;
}

# Whether the EHR answers at all, for the portal's connection badges.
#
# + ehr - the EHR id
# + return - true when its FHIR endpoint answers a search
isolated function ehrReachable(string ehr) returns boolean {
    fhir:FHIRConnector|error connector = ehrClient(ehr);
    if connector is error {
        return false;
    }
    map<string[]> params = {"_count": ["1"]};
    fhir:FHIRResponse|fhir:FHIRError response = connector->search("Patient", searchParameters = params);
    return response is fhir:FHIRResponse;
}

// ── Reads ──

# Searches an EHR's patients by free text: an MRN when it looks like one, otherwise a name. A blank
# query lists the clinic's patients.
#
# + ehr - the EHR id
# + query - an MRN (e.g. `MRN-100234`, `ATH-41377`) or part of a name
# + birthDate - optional birth date filter
# + return - the matching patients, or an error if the EHR search fails
isolated function searchEhrPatients(string ehr, string query, string? birthDate) returns PatientCard[]|error {
    EhrSystemConfig system = check ehrSystem(ehr);
    map<string[]> params = {"_count": ["50"]};
    string trimmed = query.trim();
    if re `^[A-Za-z]{2,5}-[0-9]+$`.isFullMatch(trimmed) {
        params["identifier"] = [string `${system.mrnSystem}|${trimmed.toUpperAscii()}`];
    } else if trimmed.length() > 0 {
        // `name:contains` rather than `name`: matches any part of any name, and wso2/fhir-server
        // returns nothing for a plain `name` search.
        params["name:contains"] = [trimmed];
    }
    if birthDate is string && birthDate.length() > 0 {
        params["birthdate"] = [birthDate];
    }
    json[] found = check searchResources(check ehrClient(ehr), "Patient", params);
    international401:Patient[] patients = <international401:Patient[]>check typedResources(found, PatientList);
    PatientCard[] cards = from international401:Patient patient in patients
        select patientCard(system, patient);
    return from PatientCard card in cards
        order by card.name ascending
        select card;
}

# Reads one patient from an EHR.
#
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + return - the Patient, or an error if it cannot be read
isolated function readEhrPatient(string ehr, string patientId) returns international401:Patient|error {
    fhir:FHIRResponse response = check (check ehrClient(ehr))->getById("Patient", patientId);
    return (<json>response.'resource).cloneWithType();
}

# A patient as the portal lists them.
#
# + system - the EHR the patient came from
# + patient - the Patient resource
# + return - the patient's card
isolated function patientCard(EhrSystemConfig system, international401:Patient patient) returns PatientCard {
    r4:Address[] addresses = patient.address ?: [];
    string? phone = ();
    foreach r4:ContactPoint contact in patient.telecom ?: [] {
        if contact.system == "phone" {
            phone = contact.value;
            break;
        }
    }
    return {
        ehr: system.id,
        ehrName: system.displayName,
        id: patient.id ?: "",
        name: patientName(patient.name),
        gender: patient.gender,
        birthDate: patient.birthDate,
        age: ageFrom(patient.birthDate),
        mrn: identifierValue(patient.identifier, system.mrnSystem),
        city: addresses.length() > 0 ? addresses[0].city : (),
        phone
    };
}

# Pulls the patient's record from the EHR: `Patient/$summary` when the EHR supports it, otherwise
# the same picture assembled from standard searches run in parallel.
#
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + return - the patient's record, or an error if the EHR cannot be read
isolated function fetchEhrRecord(string ehr, string patientId) returns EhrRecord|error {
    fhir:FHIRConnector connector = check ehrClient(ehr);
    international401:Patient patient = check readEhrPatient(ehr, patientId);
    if ehrSupportsSummaryOperation(ehr) {
        fhir:FHIRResponse response = check connector->callOperation("Patient", "summary", fhir:GET, id = patientId);
        json bundle = <json>response.'resource;
        return {
            patient,
            conditions: <international401:Condition[]>check typedResources(resourcesOfType(bundle, "Condition"), ConditionList),
            allergies: <international401:AllergyIntolerance[]>check typedResources(resourcesOfType(bundle, "AllergyIntolerance"), AllergyIntoleranceList),
            medicationRequests: <international401:MedicationRequest[]>check typedResources(resourcesOfType(bundle, "MedicationRequest"), MedicationRequestList),
            medicationStatements: <international401:MedicationStatement[]>check typedResources(resourcesOfType(bundle, "MedicationStatement"), MedicationStatementList),
            immunizations: <international401:Immunization[]>check typedResources(resourcesOfType(bundle, "Immunization"), ImmunizationList),
            procedures: <international401:Procedure[]>check typedResources(resourcesOfType(bundle, "Procedure"), ProcedureList),
            familyHistory: <international401:FamilyMemberHistory[]>check typedResources(resourcesOfType(bundle, "FamilyMemberHistory"), FamilyMemberHistoryList),
            encounters: <international401:Encounter[]>check typedResources(resourcesOfType(bundle, "Encounter"), EncounterList),
            observations: <international401:Observation[]>check typedResources(resourcesOfType(bundle, "Observation"), ObservationList),
            'source: "summary-operation",
            queries: [string `GET Patient/${patientId}`, string `GET Patient/${patientId}/$summary`]
        };
    }

    string since = string `ge${time:utcToCivil(time:utcNow()).year - summaryLookbackYears}-01-01`;
    string subject = string `Patient/${patientId}`;
    future<json[]|error> conditions = start searchResources(connector, "Condition", {"patient": [subject]});
    future<json[]|error> allergies = start searchResources(connector, "AllergyIntolerance", {"patient": [subject]});
    future<json[]|error> requests = start searchResources(connector, "MedicationRequest", {"patient": [subject]});
    future<json[]|error> statements = start searchResources(connector, "MedicationStatement", {"patient": [subject]});
    future<json[]|error> immunizations = start searchResources(connector, "Immunization", {"patient": [subject]});
    future<json[]|error> procedures = start searchResources(connector, "Procedure",
            {"patient": [subject], "date": [since]});
    future<json[]|error> familyHistory = start searchResources(connector, "FamilyMemberHistory", {"patient": [subject]});
    future<json[]|error> encounters = start searchResources(connector, "Encounter",
            {"patient": [subject], "date": [since], "_sort": ["-date"]});
    future<json[]|error> labs = start searchResources(connector, "Observation",
            {"patient": [subject], "category": ["laboratory"], "date": [since]});
    future<json[]|error> vitals = start searchResources(connector, "Observation",
            {"patient": [subject], "category": ["vital-signs"], "date": [since]});
    future<json[]|error> social = start searchResources(connector, "Observation",
            {"patient": [subject], "category": ["social-history"]});

    // Wait for every search before failing on any, so no strand is left running.
    json[]|error conditionsResult = wait conditions;
    json[]|error allergiesResult = wait allergies;
    json[]|error requestsResult = wait requests;
    json[]|error statementsResult = wait statements;
    json[]|error immunizationsResult = wait immunizations;
    json[]|error proceduresResult = wait procedures;
    json[]|error familyResult = wait familyHistory;
    json[]|error encountersResult = wait encounters;
    json[]|error labsResult = wait labs;
    json[]|error vitalsResult = wait vitals;
    json[]|error socialResult = wait social;

    json[] observations = [...check labsResult, ...check vitalsResult, ...check socialResult];
    return {
        patient,
        conditions: <international401:Condition[]>check typedResources(check conditionsResult, ConditionList),
        allergies: <international401:AllergyIntolerance[]>check typedResources(check allergiesResult, AllergyIntoleranceList),
        medicationRequests: <international401:MedicationRequest[]>check typedResources(check requestsResult, MedicationRequestList),
        medicationStatements: <international401:MedicationStatement[]>check typedResources(check statementsResult, MedicationStatementList),
        immunizations: <international401:Immunization[]>check typedResources(check immunizationsResult, ImmunizationList),
        procedures: <international401:Procedure[]>check typedResources(check proceduresResult, ProcedureList),
        familyHistory: <international401:FamilyMemberHistory[]>check typedResources(check familyResult, FamilyMemberHistoryList),
        encounters: <international401:Encounter[]>check typedResources(check encountersResult, EncounterList),
        observations: <international401:Observation[]>check typedResources(observations, ObservationList),
        'source: "composed-search",
        queries: [
            string `GET Patient/${patientId}`,
            string `GET Condition?patient=${subject}`,
            string `GET AllergyIntolerance?patient=${subject}`,
            string `GET MedicationRequest?patient=${subject}`,
            string `GET MedicationStatement?patient=${subject}`,
            string `GET Immunization?patient=${subject}`,
            string `GET Procedure?patient=${subject}&date=${since}`,
            string `GET FamilyMemberHistory?patient=${subject}`,
            string `GET Encounter?patient=${subject}&date=${since}`,
            string `GET Observation?patient=${subject}&category=laboratory&date=${since}`,
            string `GET Observation?patient=${subject}&category=vital-signs&date=${since}`,
            string `GET Observation?patient=${subject}&category=social-history`
        ]
    };
}

# One analyte's results for a patient, oldest first, including results the EHR filed under an
# equivalent LOINC code. Used by the agents' history tool.
#
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + loincCode - LOINC code of the analyte
# + return - the results that have a value and a date, or an error if the EHR search fails
isolated function ehrObservationHistory(string ehr, string patientId, string loincCode) returns BiomarkerPoint[]|error {
    string[] codes = [loincCode];
    foreach [string, string] [alias, catalogCode] in ANALYTE_ALIASES.entries() {
        if catalogCode == loincCode {
            codes.push(alias);
        }
    }
    string codeParam = string:'join(",", ...from string code in codes select string `${LOINC}|${code}`);
    json[] found = check searchResources(check ehrClient(ehr), "Observation",
            {"patient": [string `Patient/${patientId}`], "code": [codeParam], "_sort": ["date"]});
    international401:Observation[] observations =
        <international401:Observation[]>check typedResources(found, ObservationList);
    string sourceName = ehrName(ehr);
    BiomarkerPoint[] points = from international401:Observation observation in observations
        let decimal? value = observation.valueQuantity?.value
        where value is decimal && observation.effectiveDateTime is string
        order by <string>observation.effectiveDateTime ascending
        select {
            date: <string>dateOnly(observation.effectiveDateTime),
            value: <decimal>value,
            interpretation: interpretationCode(observation),
            'source: observationSource(observation, sourceName)
        };
    return points;
}

isolated function interpretationCode(international401:Observation observation) returns string? {
    r4:CodeableConcept[] interpretations = observation.interpretation ?: [];
    if interpretations.length() == 0 {
        return ();
    }
    r4:Coding[] codings = interpretations[0].coding ?: [];
    return codings.length() > 0 ? codings[0].code : ();
}

isolated function observationSource(international401:Observation observation, string ehrDisplayName) returns string {
    foreach r4:Identifier identifier in observation.identifier ?: [] {
        if identifier.system == LAB_RESULT_ID_SYSTEM {
            return labDisplayName;
        }
    }
    return ehrDisplayName;
}

# The physician's display name, read from the EHR.
#
# + ehr - the EHR id
# + practitionerId - the Practitioner id
# + return - the name, or an error if the Practitioner cannot be read
isolated function practitionerDisplay(string ehr, string practitionerId) returns string|error {
    fhir:FHIRResponse response = check (check ehrClient(ehr))->getById("Practitioner", practitionerId);
    international401:Practitioner practitioner = check (<json>response.'resource).cloneWithType();
    return patientName(practitioner.name);
}

// ── Writes ──

# Identifier system of results the integration filed from the lab.
const string LAB_RESULT_ID_SYSTEM = "urn:demo:lab:result-id";
# Identifier system the integration stamps on what it writes for an assessment.
const string ASSESSMENT_ID_SYSTEM = "urn:demo:longevity:assessment";

# Opens an in-progress ambulatory Encounter for the assessment visit. Identified by the assessment id,
# so a retry reuses the Encounter it already opened.
#
# + assessmentId - the assessment id, stored as the Encounter's identifier
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + practitionerId - the physician, recorded as the participant
# + return - the Encounter id, or an error if the EHR search or create fails
isolated function createEhrEncounter(string assessmentId, string ehr, string patientId, string practitionerId)
        returns string|error {
    EhrSystemConfig system = check ehrSystem(ehr);
    fhir:FHIRConnector connector = check ehrClient(ehr);
    json encounter = {
        resourceType: "Encounter",
        identifier: [{system: ASSESSMENT_ID_SYSTEM, value: assessmentId}],
        status: "in-progress",
        'class: {system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "AMB", display: "ambulatory"},
        'type: [{coding: [{system: "http://snomed.info/sct", code: "185349003", display: "Encounter for check up (procedure)"}],
            text: "Preventive health assessment"}],
        subject: {reference: string `Patient/${patientId}`},
        participant: [{individual: {reference: string `Practitioner/${practitionerId}`}}],
        period: {'start: nowIso()},
        reasonCode: [{text: "Preventive health risk assessment"}],
        serviceProvider: {reference: string `Organization/${system.organizationId}`}
    };
    // Not `createOnce`: wso2/fhir-server does not index Encounter.identifier, so a conditional create
    // would never match. The patient's open encounters are few; match the identifier here instead.
    json[] open = check searchResources(connector, "Encounter",
            {"patient": [string `Patient/${patientId}`], "status": ["in-progress"]});
    foreach json existing in open {
        if hasIdentifier(existing, ASSESSMENT_ID_SYSTEM, assessmentId) {
            return (check existing.id).toString();
        }
    }
    fhir:FHIRResponse response = check connector->create(encounter, returnPreference = fhir:REPRESENTATION);
    return createdId(response);
}

isolated function hasIdentifier(json resourceJson, string system, string value) returns boolean {
    json|error identifiers = resourceJson.identifier;
    if identifiers is json[] {
        foreach json identifier in identifiers {
            if identifier is map<json> && identifier["system"] == system && identifier["value"] == value {
                return true;
            }
        }
    }
    return false;
}

# Records the lab order in the EHR (the order of record), linked to the visit's Encounter.
#
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + encounterId - the visit's Encounter id
# + practitionerId - the ordering physician
# + placerOrderId - the clinic's order id, which makes the create idempotent
# + testCodes - catalog codes of the approved tests
# + note - order note; omitted when blank
# + return - the EHR ServiceRequest id, or an error if the EHR rejects it
isolated function createEhrServiceRequest(string ehr, string patientId, string encounterId, string practitionerId,
        string placerOrderId, string[] testCodes, string note) returns string|error {
    json serviceRequest = labServiceRequest(string `Patient/${patientId}`, placerOrderId, testCodes,
            {reference: string `Practitioner/${practitionerId}`}, note);
    map<json> withEncounter = <map<json>>serviceRequest.clone();
    withEncounter["encounter"] = {reference: string `Encounter/${encounterId}`};
    return createOnce(check ehrClient(ehr), withEncounter, PLACER_ORDER_SYSTEM, placerOrderId);
}

# Tells the patient what to do, as a FHIR Communication in their chart: the record that they were
# notified, which a patient portal or messaging service would deliver.
#
# + assessmentId - the assessment id, which makes the create idempotent
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + encounterId - the visit's Encounter id
# + ehrServiceRequestId - the order the message is about
# + practitionerId - the physician sending it
# + message - the message text
# + return - the Communication id, or an error if the EHR rejects it
isolated function createEhrCommunication(string assessmentId, string ehr, string patientId, string encounterId,
        string ehrServiceRequestId, string practitionerId, string message) returns string|error {
    json communication = {
        resourceType: "Communication",
        identifier: [{system: ASSESSMENT_ID_SYSTEM, value: assessmentId + "-lab-visit"}],
        status: "completed",
        category: [{coding: [{system: "http://terminology.hl7.org/CodeSystem/communication-category",
            code: "instruction", display: "Instruction"}]}],
        priority: "routine",
        subject: {reference: string `Patient/${patientId}`},
        encounter: {reference: string `Encounter/${encounterId}`},
        basedOn: [{reference: string `ServiceRequest/${ehrServiceRequestId}`}],
        sent: nowIso(),
        recipient: [{reference: string `Patient/${patientId}`}],
        sender: {reference: string `Practitioner/${practitionerId}`},
        payload: [{contentString: message}]
    };
    return createOnce(check ehrClient(ehr), communication, ASSESSMENT_ID_SYSTEM, assessmentId + "-lab-visit");
}

# Files the lab's results into the EHR as one transaction — Observations plus a DiagnosticReport
# based on the EHR's own order — so the chart holds the results, not just the lab.
#
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + encounterId - the visit's Encounter id
# + ehrServiceRequestId - the EHR's order of record, which the results are based on
# + labReport - the lab's DiagnosticReport as json
# + labObservations - the lab's Observations as json
# + return - the EHR DiagnosticReport id, or an error if the transaction fails
isolated function fileLabResultsInEhr(string ehr, string patientId, string encounterId, string ehrServiceRequestId,
        json labReport, json[] labObservations) returns string|error {
    json[] entries = [];
    json[] resultRefs = [];
    foreach int i in 0 ..< labObservations.length() {
        map<json> observation = <map<json>>labObservations[i].clone();
        string labId = observation["id"].toString();
        _ = observation.removeIfHasKey("id");
        _ = observation.removeIfHasKey("meta");
        observation["subject"] = {reference: string `Patient/${patientId}`};
        observation["encounter"] = {reference: string `Encounter/${encounterId}`};
        // The lab's Observation points at the lab's own order; in the EHR it must point at the EHR's.
        observation["basedOn"] = [{reference: string `ServiceRequest/${ehrServiceRequestId}`}];
        observation["identifier"] = [{system: LAB_RESULT_ID_SYSTEM, value: labId}];
        _ = observation.removeIfHasKey("specimen");
        string fullUrl = string `urn:uuid:obs-${i}-${labId}`;
        entries.push({fullUrl, 'resource: observation, request: {method: "POST", url: "Observation",
            ifNoneExist: string `identifier=${LAB_RESULT_ID_SYSTEM}|${labId}`}});
        resultRefs.push({reference: fullUrl});
    }
    map<json> report = <map<json>>labReport.clone();
    string labReportId = report["id"].toString();
    _ = report.removeIfHasKey("id");
    _ = report.removeIfHasKey("meta");
    _ = report.removeIfHasKey("specimen");
    report["subject"] = {reference: string `Patient/${patientId}`};
    report["encounter"] = {reference: string `Encounter/${encounterId}`};
    report["basedOn"] = [{reference: string `ServiceRequest/${ehrServiceRequestId}`}];
    report["identifier"] = [{system: LAB_RESULT_ID_SYSTEM, value: labReportId}];
    report["result"] = resultRefs;
    entries.push({fullUrl: "urn:uuid:report", 'resource: report, request: {method: "POST", url: "DiagnosticReport",
        ifNoneExist: string `identifier=${LAB_RESULT_ID_SYSTEM}|${labReportId}`}});

    fhir:FHIRResponse response = check (check ehrClient(ehr))->'transaction(
            {resourceType: "Bundle", 'type: "transaction", entry: entries});
    string[] ids = check transactionIds(<json>response.'resource);
    return ids[ids.length() - 1];
}

# Writes the Care Plan agent's chart note to the EHR as a preliminary DocumentReference on the visit.
# It stays preliminary until the physician reviews and releases it.
#
# + assessmentId - the assessment id, which makes the create idempotent
# + ehr - the EHR id
# + patientId - the patient's id in that EHR
# + encounterId - the visit's Encounter id
# + practitionerId - the physician, recorded as the author
# + noteMarkdown - the note as Markdown
# + return - the DocumentReference id, or an error if the EHR rejects it
isolated function createEhrDraftNote(string assessmentId, string ehr, string patientId, string encounterId,
        string practitionerId, string noteMarkdown) returns string|error {
    json documentReference = {
        resourceType: "DocumentReference",
        identifier: [{system: ASSESSMENT_ID_SYSTEM, value: assessmentId}],
        status: "current",
        docStatus: "preliminary",
        'type: {coding: [{system: LOINC, code: "11506-3", display: "Progress note"}], text: "Preventive health assessment note"},
        category: [{coding: [{system: "http://hl7.org/fhir/us/core/CodeSystem/us-core-documentreference-category",
            code: "clinical-note", display: "Clinical Note"}]}],
        subject: {reference: string `Patient/${patientId}`},
        date: nowIso(),
        author: [{reference: string `Practitioner/${practitionerId}`}],
        description: "Preventive health assessment — draft for physician review",
        content: [{attachment: {contentType: "text/markdown", title: "Preventive health assessment — plan",
            data: array:toBase64(noteMarkdown.toBytes())}}],
        context: {encounter: [{reference: string `Encounter/${encounterId}`}]}
    };
    return createOnce(check ehrClient(ehr), documentReference, ASSESSMENT_ID_SYSTEM, assessmentId);
}

# Marks the chart note final once the physician has reviewed it, adding their comment.
#
# + ehr - the EHR id
# + noteId - the DocumentReference id
# + noteMarkdown - the note as Markdown
# + physicianName - who released it
# + comment - the physician's comment; omitted when blank
# + return - an error if the note cannot be read or updated
isolated function finalizeEhrNote(string ehr, string noteId, string noteMarkdown, string physicianName,
        string comment) returns error? {
    fhir:FHIRConnector connector = check ehrClient(ehr);
    fhir:FHIRResponse current = check connector->getById("DocumentReference", noteId);
    map<json> note = <map<json>>(<json>current.'resource).clone();
    string signed = noteMarkdown + string `${"\n\n"}---${"\n"}Reviewed and released by ${physicianName} on ${nowIso().substring(0, 10)}.`;
    if comment.trim().length() > 0 {
        signed += string `${"\n\n"}Physician comment: ${comment}`;
    }
    note["docStatus"] = "final";
    note["description"] = "Preventive health assessment";
    note["content"] = [{attachment: {contentType: "text/markdown", title: "Preventive health assessment — plan",
        data: array:toBase64(signed.toBytes())}}];
    // REPRESENTATION, not the default MINIMAL: with MINIMAL the connector requires a Location header,
    // which wso2/fhir-server does not send on update (ETag only).
    _ = check connector->update(note, returnPreference = fhir:REPRESENTATION);
}

# Closes the visit's Encounter.
#
# + ehr - the EHR id
# + encounterId - the visit's Encounter id
# + return - an error if the Encounter cannot be read or updated
isolated function finishEhrEncounter(string ehr, string encounterId) returns error? {
    fhir:FHIRConnector connector = check ehrClient(ehr);
    fhir:FHIRResponse current = check connector->getById("Encounter", encounterId);
    map<json> encounter = <map<json>>(<json>current.'resource).clone();
    if encounter["status"] == "finished" {
        return;
    }
    encounter["status"] = "finished";
    json period = encounter["period"];
    map<json> updatedPeriod = period is map<json> ? period.clone() : {};
    updatedPeriod["end"] = nowIso();
    encounter["period"] = updatedPeriod;
    _ = check connector->update(encounter, returnPreference = fhir:REPRESENTATION);
}

# A lab ServiceRequest for the given subject. Shared by the EHR's order of record and the copy
# placed with the lab, so both carry the same placer-order identifier and test codes.
#
# + subjectReference - the patient reference in the target system, such as `Patient/123`
# + placerOrderId - the clinic's order id
# + testCodes - catalog codes of the tests to order
# + requester - the ordering physician, as a FHIR Reference
# + note - order note; omitted when blank
# + return - the ServiceRequest as json
isolated function labServiceRequest(string subjectReference, string placerOrderId, string[] testCodes,
        json requester, string note) returns json {
    json[] orderDetail = from string code in testCodes
        let OrderableTest? test = orderableByCode(code)
        select {coding: [{system: LAB_TEST_CODE_SYSTEM, code: code, display: test is OrderableTest ? test.name : code}]};
    map<json> serviceRequest = {
        resourceType: "ServiceRequest",
        identifier: [{system: PLACER_ORDER_SYSTEM, value: placerOrderId}],
        status: "active",
        intent: "order",
        category: [{coding: [{system: "http://snomed.info/sct", code: "108252007", display: "Laboratory procedure"}]}],
        code: {text: "Biomarker panel"},
        orderDetail: orderDetail,
        subject: {reference: subjectReference},
        authoredOn: nowIso(),
        requester: requester,
        performer: [{reference: string `Organization/${labOrganizationId}`, display: labDisplayName}]
    };
    if note.trim().length() > 0 {
        serviceRequest["note"] = [{text: note}];
    }
    return serviceRequest;
}
