import ballerina/test;
import ballerinax/health.fhir.r4 as r4;
import ballerinax/health.fhir.r4.international401;

// Parsing and serialising with the FHIR library (fhir_utils.bal).

@test:Config
function parsesAResourceIntoItsInternational401Record() returns error? {
    json patient = {resourceType: "Patient", id: "p1", name: [{family: "Reyes", given: ["Daniel"]}], gender: "male"};
    international401:Patient parsed = check (check parseFhir(patient)).ensureType();
    test:assertEquals(parsed.id, "p1");
    test:assertEquals(parsed.gender, "male");
}

@test:Config
function parsesALabObservationAgainstTheBaseProfile() returns error? {
    // Left to itself the parser would pick a vital-sign profile for Observation, or fail on a vendor profile.
    json observation = {resourceType: "Observation", id: "o1", status: "final", code: {text: "LDL-C"},
        meta: {profile: ["http://example.org/StructureDefinition/vendor-lab"]}, valueQuantity: {value: 149, unit: "mg/dL"}};
    anydata parsed = check parseFhir(observation);
    test:assertTrue(parsed is international401:Observation);
}

@test:Config
function refusesAnInvalidResource() {
    test:assertTrue(parseFhir({resourceType: "Patient", gender: "bogus"}) is error);
    test:assertTrue(parseFhir({id: "no-type"}) is error);
}

@test:Config
function parseResourcesSkipsResourcesThatDoNotParse() {
    json good = {resourceType: "Observation", status: "final", code: {text: "x"}};
    json bad = {resourceType: "Observation", code: {text: "missing status"}};
    anydata[] parsed = parseResources([good, bad]);
    test:assertEquals(parsed.length(), 1);
    test:assertTrue(parsed[0] is international401:Observation);
}

@test:Config
function serialisesResourcesAndBundlesWithTheLibrary() returns error? {
    international401:Observation observation = {status: "final", code: {text: "LDL-C"}, valueQuantity: {value: 149}};
    json resourceJson = check fhirJson(observation);
    test:assertEquals(resourceJson.resourceType, "Observation");
    r4:Bundle bundle = {'type: "collection", entry: [{'resource: observation}]};
    json bundleJson = check fhirJson(bundle);
    test:assertEquals(bundleJson.resourceType, "Bundle");
    // And back again.
    r4:Bundle parsed = check (check parseFhir(bundleJson)).ensureType();
    test:assertEquals((parsed.entry ?: []).length(), 1);
}
