import ballerina/test;
import ballerina/time;
import ballerinax/health.fhir.r4.international401;

@test:Config {}
function testParseObservationValuesExtractsQuantityAndText() {
    json bundle = {
        resourceType: "Bundle",
        'type: "searchset",
        entry: [
            {
                'resource: {
                    resourceType: "Observation",
                    status: "final",
                    code: {coding: [{code: "2093-3"}]},
                    effectiveDateTime: "2026-06-10T09:00:00Z",
                    valueQuantity: {value: 264}
                }
            },
            {
                'resource: {
                    resourceType: "Observation",
                    status: "final",
                    code: {coding: [{code: "8601-7"}]},
                    effectiveDateTime: "2026-05-20T10:00:00Z",
                    valueCodeableConcept: {text: "Left ventricular hypertrophy"}
                }
            }
        ]
    };
    ObservationValue[] values = parseObservationValues(bundle);
    test:assertEquals(values.length(), 2);
    test:assertEquals(values[0].code, "2093-3");
    test:assertEquals(values[0].quantity, 264.0);
    test:assertEquals(values[1].code, "8601-7");
    test:assertEquals(values[1].text, "Left ventricular hypertrophy");
}

@test:Config {}
function testLatestPicksMostRecentByEffectiveTime() returns error? {
    ObservationValue older = {code: "2093-3", quantity: 200.0, text: (), time: check timeOf("2026-05-01T09:00:00Z")};
    ObservationValue newer = {code: "2093-3", quantity: 264.0, text: (), time: check timeOf("2026-06-10T09:00:00Z")};
    ObservationValue? best = latest([older, newer]);
    test:assertTrue(best is ObservationValue);
    test:assertEquals((<ObservationValue>best).quantity, 264.0);
}

@test:Config {}
function testToHeartRiskRequestMapsAndKeepsMissingNil() {
    FeatureSlots slots = {age: 76, sex: "F", maxHr: 148, cholesterol: 264, chestPainType: "ATA"};
    HeartRiskRequest request = toHeartRiskRequest(slots);
    test:assertEquals(request.age, 76.0);
    test:assertEquals(request.max_hr, 148.0);
    test:assertEquals(request.sex, "F");
    test:assertEquals(request.cholesterol, 264.0);
    test:assertEquals(request.chest_pain_type, "ATA");
    test:assertTrue(request.resting_bp is ());
    test:assertTrue(request.st_slope is ());
    test:assertTrue(request.fasting_bs is ());
}

@test:Config {}
function testMentionsDiabetesByTextAndCoding() {
    international401:Condition byText = {subject: {reference: "Patient/p"}, code: {text: "Type 2 diabetes mellitus"}};
    test:assertTrue(mentionsDiabetes(byText));

    international401:Condition byCoding = {subject: {reference: "Patient/p"}, code: {coding: [{display: "Diabetes mellitus type 2"}]}};
    test:assertTrue(mentionsDiabetes(byCoding));

    international401:Condition other = {subject: {reference: "Patient/p"}, code: {text: "Essential hypertension"}};
    test:assertFalse(mentionsDiabetes(other));
}

@test:Config {}
function testClassifyEcgText() {
    test:assertEquals(classifyEcgText("Left ventricular hypertrophy"), "LVH");
    test:assertEquals(classifyEcgText("ST-T wave abnormality"), "ST");
    test:assertEquals(classifyEcgText("Normal sinus rhythm"), "Normal");
    test:assertTrue(classifyEcgText(()) is ());
    test:assertTrue(classifyEcgText("uninterpretable") is ());
}

@test:Config {}
function testClassifyStSlopeText() {
    test:assertEquals(classifyStSlopeText("Flat"), "Flat");
    test:assertEquals(classifyStSlopeText("upsloping"), "Up");
    test:assertEquals(classifyStSlopeText("Downsloping"), "Down");
    test:assertTrue(classifyStSlopeText(()) is ());
}

@test:Config {}
function testClassifyChestPainText() {
    test:assertEquals(classifyChestPainText("ASY"), "ASY");
    test:assertEquals(classifyChestPainText("ATA"), "ATA");
    test:assertEquals(classifyChestPainText("NAP"), "NAP");
    test:assertEquals(classifyChestPainText("TA"), "TA");
    test:assertEquals(classifyChestPainText("Asymptomatic"), "ASY");
    test:assertEquals(classifyChestPainText("Atypical angina"), "ATA");
    test:assertEquals(classifyChestPainText("Typical angina"), "TA");
    test:assertTrue(classifyChestPainText(()) is ());
    test:assertTrue(classifyChestPainText("uninterpretable") is ());
}

@test:Config {}
function testClassifyExerciseAnginaText() {
    test:assertEquals(classifyExerciseAnginaText("Y"), "Y");
    test:assertEquals(classifyExerciseAnginaText("N"), "N");
    test:assertEquals(classifyExerciseAnginaText("Yes"), "Y");
    test:assertEquals(classifyExerciseAnginaText("No"), "N");
    test:assertTrue(classifyExerciseAnginaText(()) is ());
    test:assertTrue(classifyExerciseAnginaText("maybe") is ());
}

isolated function timeOf(string value) returns time:Utc|error {
    return time:utcFromString(value);
}
