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

import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;
import ballerinax/health.fhir.r4.parser;

# Extracts a display text from a FHIR CodeableConcept.
#
# + concept - the codeable concept, possibly absent
# + return - text, first coding display, or ()
isolated function conceptToText(r4:CodeableConcept? concept) returns string? {
    if concept is () {
        return ();
    }
    string? conceptText = concept.text;
    if conceptText is string {
        return conceptText;
    }
    r4:Coding[]? codings = concept.coding;
    if codings is r4:Coding[] {
        foreach r4:Coding coding in codings {
            string? codingDisplay = coding.display;
            if codingDisplay is string {
                return codingDisplay;
            }
        }
    }
    return ();
}

# Formats a FHIR Quantity as "value unit".
#
# + quantity - the quantity, possibly absent
# + return - formatted value or ()
isolated function quantityToText(r4:Quantity? quantity) returns string? {
    if quantity is () {
        return ();
    }
    decimal? quantityValue = quantity.value;
    if quantityValue is () {
        return ();
    }
    string? quantityUnit = quantity.unit;
    return quantityUnit is string ? string `${quantityValue} ${quantityUnit}` : quantityValue.toString();
}

# Counts the entries in a FHIR search-set Bundle (0 on malformed payloads).
#
# + bundleJson - raw Bundle payload
# + return - number of entry resources
isolated function countBundleEntries(json bundleJson) returns int {
    json[]|error entryResources = bundleToResources(bundleJson = bundleJson);
    return entryResources is json[] ? entryResources.length() : 0;
}

# Truncates a JSON payload to a short loggable snippet.
#
# + payload - the payload to snippet
# + return - first 300 characters of the serialized payload
isolated function jsonSnippet(json payload) returns string {
    string serialized = payload.toJsonString();
    return serialized.length() > 300 ? serialized.substring(0, 300) + "..." : serialized;
}

# Extracts the resources contained in a FHIR search-set Bundle.
#
# + bundleJson - raw Bundle payload returned by the EMR
# + return - list of entry resources as json, or a parse error
isolated function bundleToResources(json bundleJson) returns json[]|error {
    map<json> bundleMap = check bundleJson.ensureType();
    json entriesJson = bundleMap["entry"] ?: ();
    if entriesJson is () {
        return [];
    }
    json[] bundleEntries = check entriesJson.ensureType();
    json[] entryResources = [];
    foreach json bundleEntry in bundleEntries {
        map<json> entryMap = check bundleEntry.ensureType();
        json entryResource = entryMap["resource"] ?: ();
        if entryResource !is () {
            entryResources.push(entryResource);
        }
    }
    return entryResources;
}

# Extracts the full display name from a FHIR HumanName array.
#
# + patientNames - FHIR name array, possibly absent
# + return - display name string
isolated function extractFullName(r4:HumanName[]? patientNames) returns string {
    if patientNames is () || patientNames.length() == 0 {
        return "(unnamed)";
    }
    r4:HumanName primaryName = patientNames[0];
    string? nameText = primaryName.text;
    if nameText is string {
        return nameText;
    }
    string[] nameParts = [];
    string[]? givenNames = primaryName.given;
    if givenNames is string[] {
        nameParts.push(...givenNames);
    }
    string? familyName = primaryName.family;
    if familyName is string {
        nameParts.push(familyName);
    }
    return nameParts.length() > 0 ? string:'join(" ", ...nameParts) : "(unnamed)";
}

# Extracts the structured family name from a FHIR HumanName array.
#
# + patientNames - FHIR name array, possibly absent
# + return - family name or ()
isolated function extractFamily(r4:HumanName[]? patientNames) returns string? {
    if patientNames is () || patientNames.length() == 0 {
        return ();
    }
    return patientNames[0].family;
}

# Extracts the first given name from a FHIR HumanName array.
#
# + patientNames - FHIR name array, possibly absent
# + return - given name or ()
isolated function extractGiven(r4:HumanName[]? patientNames) returns string? {
    if patientNames is () || patientNames.length() == 0 {
        return ();
    }
    string[]? givenNames = patientNames[0].given;
    if givenNames is string[] && givenNames.length() > 0 {
        return givenNames[0];
    }
    return ();
}

# Extracts the MRN (or first identifier value) from a FHIR Identifier array.
#
# + patientIdentifiers - FHIR identifier array, possibly absent
# + return - MRN value or ()
isolated function extractMrn(r4:Identifier[]? patientIdentifiers) returns string? {
    if patientIdentifiers is () {
        return ();
    }
    foreach r4:Identifier patientIdentifier in patientIdentifiers {
        r4:Coding[]? typeCodings = patientIdentifier.'type?.coding;
        if typeCodings is r4:Coding[] {
            boolean isMrn = typeCodings.some(coding => coding.code == "MR");
            if isMrn {
                return patientIdentifier.value;
            }
        }
    }
    return patientIdentifiers.length() > 0 ? patientIdentifiers[0].value : ();
}

# Extracts the first phone number from a FHIR ContactPoint array.
#
# + contactPoints - FHIR telecom array, possibly absent
# + return - phone number or ()
isolated function extractPhone(r4:ContactPoint[]? contactPoints) returns string? {
    if contactPoints is () {
        return ();
    }
    foreach r4:ContactPoint contactPoint in contactPoints {
        if contactPoint.system == "phone" {
            return contactPoint.value;
        }
    }
    return ();
}

# Formats the first address from a FHIR Address array as a single line.
#
# + patientAddresses - FHIR address array, possibly absent
# + return - formatted address or ()
isolated function extractAddress(r4:Address[]? patientAddresses) returns string? {
    if patientAddresses is () || patientAddresses.length() == 0 {
        return ();
    }
    r4:Address primaryAddress = patientAddresses[0];
    string[] addressParts = [];
    string[]? streetLines = primaryAddress.line;
    if streetLines is string[] {
        addressParts.push(...streetLines);
    }
    string? cityName = primaryAddress.city;
    if cityName is string {
        addressParts.push(cityName);
    }
    string? stateName = primaryAddress.state;
    if stateName is string {
        addressParts.push(stateName);
    }
    string? postalCode = primaryAddress.postalCode;
    if postalCode is string {
        addressParts.push(postalCode);
    }
    return addressParts.length() > 0 ? string:'join(", ", ...addressParts) : ();
}

# Maps a parsed FHIR Patient resource to the simplified PatientSummary.
#
# + fhirPatient - parsed FHIR Patient
# + sourceEmr - EMR the record came from
# + return - patient summary
isolated function mapPatientToSummary(international401:Patient fhirPatient, string sourceEmr) returns PatientSummary => {
    patientId: fhirPatient.id ?: "",
    sourceEmr: sourceEmr,
    fullName: extractFullName(fhirPatient.name),
    family: extractFamily(fhirPatient.name),
    given: extractGiven(fhirPatient.name),
    gender: fhirPatient.gender,
    birthDate: fhirPatient.birthDate,
    mrn: extractMrn(fhirPatient.identifier),
    phone: extractPhone(fhirPatient.telecom),
    address: extractAddress(fhirPatient.address)
};

# Maps a FHIR Patient resource to the simplified PatientSummary.
#
# + patientJson - raw Patient payload
# + sourceEmr - EMR the record came from
# + return - patient summary or a parse error
isolated function toPatientSummary(json patientJson, string sourceEmr) returns PatientSummary|error {
    international401:Patient fhirPatient = check parser:parse(payload = patientJson,
            targetFHIRModelType = international401:Patient).ensureType();
    return mapPatientToSummary(fhirPatient = fhirPatient, sourceEmr = sourceEmr);
}

# Maps a parsed FHIR Condition resource to a ConditionSummary.
#
# + fhirCondition - parsed FHIR Condition
# + return - condition summary
isolated function mapConditionToSummary(international401:Condition fhirCondition) returns ConditionSummary => {
    condition: conceptToText(fhirCondition.code) ?: "(uncoded condition)",
    clinicalStatus: conceptToText(fhirCondition.clinicalStatus),
    recordedDate: fhirCondition.recordedDate
};

# Maps a Bundle of Condition resources to condition summaries.
#
# + bundleJson - raw search-set Bundle
# + return - condition summaries or a parse error
isolated function toConditionSummaries(json bundleJson) returns ConditionSummary[]|error {
    ConditionSummary[] conditionSummaries = [];
    foreach json entryResource in check bundleToResources(bundleJson) {
        international401:Condition|error fhirCondition = parser:parse(payload = entryResource,
                targetFHIRModelType = international401:Condition).ensureType();
        if fhirCondition is error {
            continue;
        }
        conditionSummaries.push(mapConditionToSummary(fhirCondition = fhirCondition));
    }
    return conditionSummaries;
}

# Extracts the first dosage instruction text from a FHIR Dosage array.
#
# + dosageInstructions - FHIR dosage array, possibly absent
# + return - dosage text or ()
isolated function extractDosageText(r4:Dosage[]? dosageInstructions) returns string? {
    if dosageInstructions is r4:Dosage[] && dosageInstructions.length() > 0 {
        return dosageInstructions[0].text;
    }
    return ();
}

# Maps a parsed FHIR MedicationRequest resource to a MedicationSummary.
#
# + medicationRequest - parsed FHIR MedicationRequest
# + return - medication summary
isolated function mapMedicationToSummary(international401:MedicationRequest medicationRequest) returns MedicationSummary => {
    medication: conceptToText(medicationRequest.medicationCodeableConcept) ?: "(uncoded medication)",
    status: medicationRequest.status,
    authoredOn: medicationRequest.authoredOn,
    dosageInstruction: extractDosageText(medicationRequest.dosageInstruction)
};

# Maps a Bundle of MedicationRequest resources to medication summaries.
#
# + bundleJson - raw search-set Bundle
# + return - medication summaries or a parse error
isolated function toMedicationSummaries(json bundleJson) returns MedicationSummary[]|error {
    MedicationSummary[] medicationSummaries = [];
    foreach json entryResource in check bundleToResources(bundleJson) {
        international401:MedicationRequest|error medicationRequest = parser:parse(payload = entryResource,
                targetFHIRModelType = international401:MedicationRequest).ensureType();
        if medicationRequest is error {
            continue;
        }
        medicationSummaries.push(mapMedicationToSummary(medicationRequest = medicationRequest));
    }
    return medicationSummaries;
}

# Maps a parsed FHIR AllergyIntolerance resource to an AllergySummary.
#
# + allergyIntolerance - parsed FHIR AllergyIntolerance
# + return - allergy summary
isolated function mapAllergyToSummary(international401:AllergyIntolerance allergyIntolerance) returns AllergySummary => {
    substance: conceptToText(allergyIntolerance.code) ?: "(uncoded allergen)",
    clinicalStatus: conceptToText(allergyIntolerance.clinicalStatus),
    criticality: allergyIntolerance.criticality
};

# Maps a Bundle of AllergyIntolerance resources to allergy summaries.
#
# + bundleJson - raw search-set Bundle
# + return - allergy summaries or a parse error
isolated function toAllergySummaries(json bundleJson) returns AllergySummary[]|error {
    AllergySummary[] allergySummaries = [];
    foreach json entryResource in check bundleToResources(bundleJson) {
        international401:AllergyIntolerance|error allergyIntolerance = parser:parse(payload = entryResource,
                targetFHIRModelType = international401:AllergyIntolerance).ensureType();
        if allergyIntolerance is error {
            continue;
        }
        allergySummaries.push(mapAllergyToSummary(allergyIntolerance = allergyIntolerance));
    }
    return allergySummaries;
}

# Extracts the observation value from a FHIR Observation.
# Handles simple quantity, string, and multi-component (e.g. blood pressure) values.
#
# + fhirObservation - parsed FHIR Observation
# + return - formatted value string or ()
isolated function extractObservationValue(international401:Observation fhirObservation) returns string? {
    string? quantityValue = quantityToText(fhirObservation.valueQuantity);
    if quantityValue is string {
        return quantityValue;
    }
    string? stringValue = fhirObservation.valueString;
    if stringValue is string {
        return stringValue;
    }
    // Multi-component observation (e.g. blood pressure panel)
    international401:ObservationComponent[]? observationComponents = fhirObservation.component;
    if observationComponents is () {
        return ();
    }
    string[] componentTexts = [];
    foreach international401:ObservationComponent observationComponent in observationComponents {
        string? componentValue = quantityToText(observationComponent.valueQuantity);
        if componentValue is string {
            string componentName = conceptToText(observationComponent.code) ?: "component";
            componentTexts.push(string `${componentName}: ${componentValue}`);
        }
    }
    return componentTexts.length() > 0 ? string:'join(" | ", ...componentTexts) : ();
}

# Maps a parsed FHIR Observation resource to an ObservationSummary.
# Handles simple quantity values, string values and multi-component
# observations such as blood pressure panels.
#
# + fhirObservation - parsed FHIR Observation
# + return - observation summary
isolated function mapObservationToSummary(international401:Observation fhirObservation) returns ObservationSummary => {
    name: conceptToText(fhirObservation.code) ?: "(uncoded observation)",
    value: extractObservationValue(fhirObservation),
    effectiveDate: fhirObservation.effectiveDateTime
};

# Maps a Bundle of Observation resources to observation summaries.
# Handles simple quantity values, string values and multi-component
# observations such as blood pressure panels.
#
# + bundleJson - raw search-set Bundle
# + return - observation summaries or a parse error
isolated function toObservationSummaries(json bundleJson) returns ObservationSummary[]|error {
    ObservationSummary[] observationSummaries = [];
    foreach json entryResource in check bundleToResources(bundleJson) {
        international401:Observation|error fhirObservation = parser:parse(payload = entryResource,
                targetFHIRModelType = international401:Observation).ensureType();
        if fhirObservation is error {
            continue;
        }
        observationSummaries.push(mapObservationToSummary(fhirObservation = fhirObservation));
    }
    return observationSummaries;
}
