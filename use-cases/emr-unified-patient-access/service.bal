// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerina/http;
import ballerina/log;
import ballerina/time;
import ballerina/uuid;
import ballerinax/health.clients.fhir;

configurable int servicePort = 9095;

# Error payload returned by the API.
type ErrorBody record {|
    # Human readable error message
    string message;
|};

# UnifiedCare — cross-EMR patient access API.
# Every patient operation fans out to Epic and Cerner in parallel and combines
# whatever each EMR returns, using system-to-system SMART Backend Services auth.
service /unifiedcare on new http:Listener(servicePort, timeout = 300) {

    # Looks a patient id up in ALL connected EMRs and combines the results.
    #
    # + patientId - patient logical id (Epic or Cerner)
    # + return - combined lookup result, or 404 when no EMR has the patient
    resource function get patients/[string patientId]()
            returns UnifiedPatientResult|http:NotFound {
        UnifiedPatientResult unifiedResult = lookupPatientEverywhere(patientId = patientId);
        if unifiedResult.foundIn.length() == 0 {
            return <http:NotFound>{
                body: <ErrorBody>{
                    message: string `Patient '${patientId}' was not found in any connected EMR`
                }
            };
        }
        return unifiedResult;
    }

    # Searches patients by demographics across ALL connected EMRs and merges the matches.
    #
    # + family - family name to search
    # + given - given name to search
    # + birthdate - date of birth (YYYY-MM-DD)
    # + return - merged search results, or an error response
    resource function get patients(string? family, string? given, string? birthdate)
            returns UnifiedSearchResult|http:BadRequest {
        if family is () && given is () && birthdate is () {
            return <http:BadRequest>{
                body: <ErrorBody>{message: "Provide at least one of: family, given, birthdate"}
            };
        }
        log:printInfo("Fanning out patient search to Epic and Cerner",
                family = family, given = given, birthdate = birthdate);
        future<PatientSummary[]|error> epicFuture = start searchPatients(emr = EPIC,
                family = family, given = given, birthdate = birthdate);
        future<PatientSummary[]|error> cernerFuture = start searchPatients(emr = CERNER,
                family = family, given = given, birthdate = birthdate);

        string[] foundIn = [];
        PatientSummary[] combinedPatients = [];
        string[] warnings = [];
        PatientSummary[]|error epicMatches = wait epicFuture;
        if epicMatches is PatientSummary[] {
            if epicMatches.length() > 0 {
                foundIn.push(EPIC);
                combinedPatients.push(...epicMatches);
            }
        } else {
            warnings.push(string `epic: ${epicMatches.message()}`);
        }
        PatientSummary[]|error cernerMatches = wait cernerFuture;
        if cernerMatches is PatientSummary[] {
            if cernerMatches.length() > 0 {
                foundIn.push(CERNER);
                combinedPatients.push(...cernerMatches);
            }
        } else {
            warnings.push(string `cerner: ${cernerMatches.message()}`);
        }
        log:printInfo("Combined search results ready", totalMatches = combinedPatients.length(),
                foundIn = foundIn.toString());
        return {foundIn, patients: combinedPatients, warnings};
    }

    # Builds a cross-EMR Patient-360. Resolves the id in all EMRs, aggregates the
    # clinical summary wherever it resolves, then links the same person in the
    # other EMR by demographics and aggregates there too.
    #
    # + patientId - patient logical id (Epic or Cerner)
    # + return - combined clinical view, or an error response
    resource function get patients/[string patientId]/summary()
            returns UnifiedPatient360|http:NotFound|http:InternalServerError {
        UnifiedPatient360|error unified360 = buildUnifiedPatient360(patientId = patientId);
        if unified360 is error {
            if unified360.message().includes("not found in any connected EMR") {
                return <http:NotFound>{body: <ErrorBody>{message: unified360.message()}};
            }
            log:printError("Unified Patient-360 aggregation failed", 'error = unified360, patientId = patientId);
            return <http:InternalServerError>{body: <ErrorBody>{message: unified360.message()}};
        }
        return unified360;
    }

    # Initiates a cross-EMR referral: pulls the clinical record from the source
    # EMR and looks for the same patient in the target EMR by demographics.
    #
    # + referralRequest - referral instruction
    # + return - transition-of-care packet, or an error response
    resource function post referrals(ReferralRequest referralRequest)
            returns ReferralPacket|http:BadRequest|http:InternalServerError {
        if referralRequest.sourceEmr == referralRequest.targetEmr {
            return <http:BadRequest>{body: <ErrorBody>{message: "sourceEmr and targetEmr must differ"}};
        }
        ReferralPacket|error referralPacket = processReferral(referralRequest = referralRequest);
        if referralPacket is error {
            log:printError("Referral processing failed", 'error = referralPacket);
            return <http:InternalServerError>{body: <ErrorBody>{message: referralPacket.message()}};
        }
        return referralPacket;
    }
}

# Looks a patient id up in both EMRs in parallel and combines the outcomes.
#
# + patientId - patient logical id
# + return - combined lookup result (never fails; misses become warnings)
function lookupPatientEverywhere(string patientId) returns UnifiedPatientResult {
    log:printInfo("Fanning out patient lookup to Epic and Cerner", patientId = patientId);
    future<PatientSummary|error> epicFuture = start fetchPatientSummary(emr = EPIC, patientId = patientId);
    future<PatientSummary|error> cernerFuture = start fetchPatientSummary(emr = CERNER, patientId = patientId);

    string[] foundIn = [];
    PatientSummary[] records = [];
    string[] warnings = [];
    PatientSummary|error epicPatient = wait epicFuture;
    if epicPatient is PatientSummary {
        foundIn.push(EPIC);
        records.push(epicPatient);
    } else {
        warnings.push(string `epic: ${epicPatient.message()}`);
    }
    PatientSummary|error cernerPatient = wait cernerFuture;
    if cernerPatient is PatientSummary {
        foundIn.push(CERNER);
        records.push(cernerPatient);
    } else {
        warnings.push(string `cerner: ${cernerPatient.message()}`);
    }
    log:printInfo("Combined patient lookup ready", patientId = patientId, foundIn = foundIn.toString());
    return {queriedId: patientId, foundIn, records, warnings};
}

# Fetches a Patient resource from one EMR and maps it to a summary.
#
# + emr - source EMR
# + patientId - patient logical id
# + return - patient summary or an error
function fetchPatientSummary(EmrSystem emr, string patientId) returns PatientSummary|error {
    decimal startSeconds = time:monotonicNow();
    log:printInfo("EMR request: Patient read", emr = emr, patientId = patientId);
    fhir:FHIRResponse|fhir:FHIRError fhirResponse;
    if emr == EPIC {
        fhirResponse = epicClient->getPatientById(id = patientId);
    } else {
        fhirResponse = cernerClient->getPatientById(id = patientId);
    }
    decimal elapsedMs = (time:monotonicNow() - startSeconds) * 1000;
    if fhirResponse is fhir:FHIRError {
        log:printWarn("EMR response: Patient read failed", emr = emr, patientId = patientId,
                elapsedMs = elapsedMs, reason = fhirResponse.message());
        return fhirResponse;
    }
    json patientJson = check fhirResponse.'resource.ensureType();
    log:printInfo("EMR response: Patient read", emr = emr, httpStatus = fhirResponse.httpStatusCode,
            elapsedMs = elapsedMs, rawFhir = jsonSnippet(payload = patientJson));
    return toPatientSummary(patientJson = patientJson, sourceEmr = emr);
}

# Searches patients by demographics in one EMR.
#
# + emr - source EMR
# + family - family name
# + given - given name
# + birthdate - date of birth
# + return - matching patient summaries or an error
function searchPatients(EmrSystem emr, string? family, string? given, string? birthdate)
        returns PatientSummary[]|error {
    decimal startSeconds = time:monotonicNow();
    log:printInfo("EMR request: Patient search", emr = emr, family = family,
            given = given, birthdate = birthdate);
    fhir:FHIRResponse|fhir:FHIRError fhirResponse;
    if emr == EPIC {
        fhirResponse = epicClient->searchPatient(family = family, given = given, birthdate = birthdate);
    } else {
        fhirResponse = cernerClient->searchPatient(family = family, given = given, birthdate = birthdate);
    }
    decimal elapsedMs = (time:monotonicNow() - startSeconds) * 1000;
    if fhirResponse is fhir:FHIRError {
        log:printWarn("EMR response: Patient search failed", emr = emr,
                elapsedMs = elapsedMs, reason = fhirResponse.message());
        return fhirResponse;
    }
    json bundleJson = check fhirResponse.'resource.ensureType();
    PatientSummary[] patientSummaries = [];
    foreach json entryResource in check bundleToResources(bundleJson = bundleJson) {
        map<json> resourceMap = check entryResource.ensureType();
        if resourceMap["resourceType"] != "Patient" {
            continue;
        }
        PatientSummary|error patientSummary = toPatientSummary(patientJson = entryResource, sourceEmr = emr);
        if patientSummary is PatientSummary {
            patientSummaries.push(patientSummary);
        }
    }
    log:printInfo("EMR response: Patient search", emr = emr, httpStatus = fhirResponse.httpStatusCode,
            elapsedMs = elapsedMs, matches = patientSummaries.length());
    return patientSummaries;
}

# Builds the cross-EMR Patient-360 view: aggregates clinical data from every EMR
# where the id resolves, then demographically links the other EMR's record.
#
# + patientId - patient logical id
# + return - unified Patient-360 or an error
function buildUnifiedPatient360(string patientId) returns UnifiedPatient360|error {
    UnifiedPatientResult lookup = lookupPatientEverywhere(patientId = patientId);
    if lookup.foundIn.length() == 0 {
        return error(string `Patient '${patientId}' was not found in any connected EMR`);
    }
    string[] warnings = [];
    Patient360[] summaries = [];
    string? linkedVia = ();
    string primaryEmr = lookup.foundIn[0];

    foreach string foundEmr in lookup.foundIn {
        EmrSystem foundSystem = foundEmr == EPIC ? EPIC : CERNER;
        summaries.push(check buildPatient360(emr = foundSystem, patientId = patientId));
    }
    if lookup.foundIn.length() == 2 {
        linkedVia = "same patient id present in both EMRs";
    } else {
        // Link the same person in the other EMR by demographics and aggregate there too.
        EmrSystem otherEmr = primaryEmr == EPIC ? CERNER : EPIC;
        PatientSummary primaryPatient = summaries[0].patient;
        string? familyName = primaryPatient.family;
        string? birthDate = primaryPatient.birthDate;
        if familyName is string && birthDate is string {
            log:printInfo("Attempting cross-EMR demographic link", targetEmr = otherEmr,
                    family = familyName, birthdate = birthDate);
            PatientSummary[]|error linkCandidates = searchPatients(emr = otherEmr,
                    family = familyName, given = (), birthdate = birthDate);
            if linkCandidates is error {
                warnings.push(string `cross-EMR link search failed: ${linkCandidates.message()}`);
            } else if linkCandidates.length() > 0 {
                linkedVia = "family name + birthDate demographic match";
                log:printInfo("Cross-EMR link established", targetEmr = otherEmr,
                        linkedPatientId = linkCandidates[0].patientId, candidates = linkCandidates.length());
                Patient360|error linkedSummary = buildPatient360(emr = otherEmr,
                        patientId = linkCandidates[0].patientId);
                if linkedSummary is Patient360 {
                    summaries.push(linkedSummary);
                } else {
                    warnings.push(string `linked record aggregation failed: ${linkedSummary.message()}`);
                }
            } else {
                warnings.push(string `no matching patient found in ${otherEmr} by demographics`);
            }
        } else {
            warnings.push("insufficient demographics on the primary record to attempt a cross-EMR link");
        }
    }

    UnifiedPatient360 unified360 = {
        queriedId: patientId,
        primaryEmr,
        summaries,
        warnings
    };
    if linkedVia is string {
        unified360.linkedVia = linkedVia;
    }
    return unified360;
}

# Aggregates demographics, conditions, medications, allergies, vitals and labs
# for a patient from one EMR. Individual section failures (e.g. missing scopes)
# become warnings instead of failing the whole aggregation.
#
# + emr - source EMR
# + patientId - patient logical id
# + return - aggregated Patient-360 view or an error
function buildPatient360(EmrSystem emr, string patientId) returns Patient360|error {
    PatientSummary patientSummary = check fetchPatientSummary(emr = emr, patientId = patientId);
    string[] warnings = [];
    log:printInfo("Fanning out clinical section searches", emr = emr, patientId = patientId,
            sections = "conditions, medications, allergies, vitals, labResults");

    // Fan out all clinical section searches to the EMR in parallel.
    future<fhir:FHIRResponse|fhir:FHIRError> conditionFuture;
    future<fhir:FHIRResponse|fhir:FHIRError> medicationFuture;
    future<fhir:FHIRResponse|fhir:FHIRError> allergyFuture;
    future<fhir:FHIRResponse|fhir:FHIRError> vitalsFuture;
    future<fhir:FHIRResponse|fhir:FHIRError> labsFuture;
    if emr == EPIC {
        conditionFuture = start epicClient->searchCondition(patient = patientId);
        medicationFuture = start epicClient->searchMedicationRequest(patient = patientId);
        allergyFuture = start epicClient->searchAllergyIntolerance(patient = patientId);
        vitalsFuture = start epicClient->searchObservation(patient = patientId, category = "vital-signs");
        labsFuture = start epicClient->searchObservation(patient = patientId, category = "laboratory");
    } else {
        conditionFuture = start cernerClient->searchCondition(patient = patientId);
        medicationFuture = start cernerClient->searchMedicationRequest(patient = patientId);
        allergyFuture = start cernerClient->searchAllergyIntolerance(patient = patientId);
        vitalsFuture = start cernerClient->searchObservation(patient = patientId, category = "vital-signs");
        labsFuture = start cernerClient->searchObservation(patient = patientId, category = "laboratory");
    }

    ConditionSummary[] conditions = [];
    fhir:FHIRResponse|fhir:FHIRError conditionResponse = wait conditionFuture;
    json? conditionBundle = sectionBundle(emr = emr, sectionResponse = conditionResponse,
            sectionName = "conditions", warnings = warnings);
    if conditionBundle !is () {
        ConditionSummary[]|error mappedConditions = toConditionSummaries(bundleJson = conditionBundle);
        if mappedConditions is ConditionSummary[] {
            conditions = mappedConditions;
        } else {
            warnings.push(string `conditions: ${mappedConditions.message()}`);
        }
    }

    MedicationSummary[] medications = [];
    fhir:FHIRResponse|fhir:FHIRError medicationResponse = wait medicationFuture;
    json? medicationBundle = sectionBundle(emr = emr, sectionResponse = medicationResponse,
            sectionName = "medications", warnings = warnings);
    if medicationBundle !is () {
        MedicationSummary[]|error mappedMedications = toMedicationSummaries(bundleJson = medicationBundle);
        if mappedMedications is MedicationSummary[] {
            medications = mappedMedications;
        } else {
            warnings.push(string `medications: ${mappedMedications.message()}`);
        }
    }

    AllergySummary[] allergies = [];
    fhir:FHIRResponse|fhir:FHIRError allergyResponse = wait allergyFuture;
    json? allergyBundle = sectionBundle(emr = emr, sectionResponse = allergyResponse,
            sectionName = "allergies", warnings = warnings);
    if allergyBundle !is () {
        AllergySummary[]|error mappedAllergies = toAllergySummaries(bundleJson = allergyBundle);
        if mappedAllergies is AllergySummary[] {
            allergies = mappedAllergies;
        } else {
            warnings.push(string `allergies: ${mappedAllergies.message()}`);
        }
    }

    ObservationSummary[] vitals = [];
    fhir:FHIRResponse|fhir:FHIRError vitalsResponse = wait vitalsFuture;
    json? vitalsBundle = sectionBundle(emr = emr, sectionResponse = vitalsResponse,
            sectionName = "vitals", warnings = warnings);
    if vitalsBundle !is () {
        ObservationSummary[]|error mappedVitals = toObservationSummaries(bundleJson = vitalsBundle);
        if mappedVitals is ObservationSummary[] {
            vitals = mappedVitals;
        } else {
            warnings.push(string `vitals: ${mappedVitals.message()}`);
        }
    }

    ObservationSummary[] labResults = [];
    fhir:FHIRResponse|fhir:FHIRError labsResponse = wait labsFuture;
    json? labsBundle = sectionBundle(emr = emr, sectionResponse = labsResponse,
            sectionName = "labResults", warnings = warnings);
    if labsBundle !is () {
        ObservationSummary[]|error mappedLabs = toObservationSummaries(bundleJson = labsBundle);
        if mappedLabs is ObservationSummary[] {
            labResults = mappedLabs;
        } else {
            warnings.push(string `labResults: ${mappedLabs.message()}`);
        }
    }

    log:printInfo("Patient-360 aggregation complete", emr = emr, patientId = patientId,
            conditions = conditions.length(), medications = medications.length(),
            allergies = allergies.length(), vitals = vitals.length(),
            labResults = labResults.length(), warnings = warnings.length());
    return {
        patient: patientSummary,
        conditions,
        medications,
        allergies,
        vitals,
        labResults,
        warnings
    };
}

# Unwraps one clinical section's search response, converting failures into warnings.
#
# + emr - EMR the section was requested from (for logging)
# + sectionResponse - raw FHIR search response or connector error
# + sectionName - section label used in warnings
# + warnings - warning accumulator
# + return - the section's Bundle payload, or () when the section failed
function sectionBundle(EmrSystem emr, fhir:FHIRResponse|fhir:FHIRError sectionResponse,
        string sectionName, string[] warnings) returns json? {
    if sectionResponse is fhir:FHIRError {
        log:printWarn("EMR response: section search failed", emr = emr, section = sectionName,
                reason = sectionResponse.message());
        warnings.push(string `${sectionName}: ${sectionResponse.message()}`);
        return ();
    }
    json|error bundleJson = sectionResponse.'resource.ensureType();
    if bundleJson is error {
        warnings.push(string `${sectionName}: unexpected non-JSON response`);
        return ();
    }
    log:printInfo("EMR response: section search", emr = emr, section = sectionName,
            httpStatus = sectionResponse.httpStatusCode,
            resourceCount = countBundleEntries(bundleJson = bundleJson));
    return bundleJson;
}

# Executes a cross-EMR referral: source Patient-360 pull and target patient match.
#
# + referralRequest - referral instruction
# + return - assembled referral packet or an error
function processReferral(ReferralRequest referralRequest) returns ReferralPacket|error {
    string referralId = uuid:createType4AsString();
    log:printInfo("Processing referral", referralId = referralId,
            sourceEmr = referralRequest.sourceEmr, targetEmr = referralRequest.targetEmr,
            patientId = referralRequest.patientId);
    Patient360 clinicalSummary = check buildPatient360(emr = referralRequest.sourceEmr,
            patientId = referralRequest.patientId);
    PatientSummary sourcePatient = clinicalSummary.patient;
    string[] warnings = [];

    string? familyName = sourcePatient.family;
    string? givenName = sourcePatient.given;

    PatientMatch[] targetMatches = [];
    if familyName is string && sourcePatient.birthDate is string {
        PatientSummary[]|error candidates = searchPatients(emr = referralRequest.targetEmr,
                family = familyName, given = (), birthdate = sourcePatient.birthDate);
        if candidates is error {
            warnings.push(string `target match search failed: ${candidates.message()}`);
        } else {
            foreach PatientSummary candidate in candidates {
                targetMatches.push({patient: candidate, matchedOn: "family name + birthDate"});
            }
        }
    } else {
        warnings.push("insufficient demographics on source record to attempt a match");
        if givenName is () {
            log:printWarn("Source record has no structured given name", referralId = referralId);
        }
    }

    string matchOutcome = targetMatches.length() > 0 ? "MATCH_FOUND" : "NO_MATCH";
    log:printInfo("Referral packet assembled", referralId = referralId,
            matchOutcome = matchOutcome, targetMatches = targetMatches.length());
    return {
        referralId,
        reason: referralRequest.reason,
        sourceEmr: referralRequest.sourceEmr,
        targetEmr: referralRequest.targetEmr,
        clinicalSummary,
        targetMatches,
        matchOutcome,
        warnings
    };
}
