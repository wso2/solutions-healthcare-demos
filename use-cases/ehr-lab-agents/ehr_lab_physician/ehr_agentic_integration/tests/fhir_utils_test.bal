import ballerina/test;
import ballerinax/health.fhir.r4.international401;

@test:Config
function typedResourcesBuildsTheRequestedArrayType() returns error? {
    json patient = {resourceType: "Patient", id: "p1", name: [{family: "Reyes", given: ["Daniel"]}]};
    anydata[] typed = check typedResources([patient], PatientList);
    test:assertTrue(typed is international401:Patient[], "expected a Patient[]");
    test:assertEquals(typed.length(), 1);
}

@test:Config
function typedResourcesOfNothingIsAnEmptyTypedArray() returns error? {
    anydata[] typed = check typedResources([], PatientList);
    test:assertTrue(typed is international401:Patient[], "expected an empty Patient[]");
}

@test:Config
function typedResourcesSkipsResourcesThatDoNotFit() returns error? {
    json good = {resourceType: "Observation", status: "final", code: {text: "x"}};
    json bad = {resourceType: "Observation", code: {text: "missing status"}};
    anydata[] typed = check typedResources([good, bad], ObservationList);
    test:assertTrue(typed is international401:Observation[]);
    test:assertEquals(typed.length(), 1);
}
