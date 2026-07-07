import ballerina/test;
import ballerinax/health.fhir.r4.international401;

@test:Config {}
function testToWhatsappQuestionnaireConvertsFhirQuestionnaire() returns error? {
    json questionnaire = {
        resourceType: "Questionnaire",
        id: "q1",
        title: "Weekly check-in",
        item: [
            {linkId: "1", text: "How are you feeling?", 'type: "string"},
            {linkId: "2", text: "Any chest pain?", 'type: "boolean"}
        ]
    };

    WhatsappQuestionnaire converted = check toWhatsappQuestionnaire(questionnaire);
    test:assertEquals(converted.title, "Weekly check-in");
    test:assertEquals(converted.questions.length(), 2);
    test:assertEquals(converted.questions[0].text, "How are you feeling?");
    test:assertEquals(converted.questions[1].text, "Any chest pain?");
    test:assertTrue(converted.questions[0].id.trim() != "");
    test:assertNotEquals(converted.questions[0].id, converted.questions[1].id);
}

@test:Config {}
function testToWhatsappQuestionnaireDefaultsTitle() returns error? {
    json questionnaire = {
        resourceType: "Questionnaire",
        item: [
            {linkId: "1", text: "How are you feeling?", 'type: "string"}
        ]
    };

    WhatsappQuestionnaire converted = check toWhatsappQuestionnaire(questionnaire);
    test:assertEquals(converted.title, "Care Loop check-in");
}

@test:Config {}
function testBuildQuestionnaireResponseIncludesOnlyUserAnswers() returns error? {
    GeneratedSession session = {
        patientId: "patient-1",
        patientName: "Jane Doe",
        questionnaire: {resourceType: "Questionnaire", id: "q1", title: "Weekly check-in"}
    };

    TranscriptCallback callback = {
        sessionId: "session-1",
        title: "Weekly check-in",
        messages: [
            {role: "bot", text: "How are you feeling?", time: "2026-07-03T10:00:00Z", questionId: "1"},
            {role: "user", text: "Fine", time: "2026-07-03T10:01:00Z", questionId: "1"},
            {role: "bot", text: "Any chest pain?", time: "2026-07-03T10:02:00Z", questionId: "2"},
            {role: "user", text: "No", time: "2026-07-03T10:03:00Z", questionId: "2"}
        ]
    };

    international401:QuestionnaireResponse questionnaireResponse = buildQuestionnaireResponse(callback, session);
    test:assertEquals(questionnaireResponse.resourceType, "QuestionnaireResponse");
    test:assertEquals(questionnaireResponse.status, international401:CODE_STATUS_COMPLETED);
    test:assertEquals(questionnaireResponse.subject?.reference, "Patient/patient-1");
    test:assertEquals(questionnaireResponse.questionnaire, "Questionnaire/q1");

    international401:QuestionnaireResponseItem[] items = questionnaireResponse.item ?: [];
    test:assertEquals(items.length(), 2);
    test:assertEquals(items[0].linkId, "1");
    test:assertEquals((items[0].answer ?: [])[0].valueString, "Fine");
    test:assertEquals(items[1].linkId, "2");
    test:assertEquals((items[1].answer ?: [])[0].valueString, "No");
}

@test:Config {}
function testBuildQuestionnaireResponseOmitsQuestionnaireRefWithoutId() {
    GeneratedSession session = {
        patientId: "patient-1",
        patientName: "Jane Doe",
        questionnaire: {resourceType: "Questionnaire", title: "Weekly check-in"}
    };

    TranscriptCallback callback = {
        sessionId: "session-1",
        title: "Weekly check-in",
        messages: [
            {role: "user", text: "Fine", time: "2026-07-03T10:01:00Z", questionId: "1"}
        ]
    };

    international401:QuestionnaireResponse questionnaireResponse = buildQuestionnaireResponse(callback, session);
    test:assertTrue(questionnaireResponse.questionnaire is ());
}

@test:Config {}
function testExtractPatientIdFromVitalsBundle() returns error? {
    json bundle = {
        resourceType: "Bundle",
        'type: "transaction",
        entry: [
            {
                'resource: {
                    resourceType: "Observation",
                    subject: {reference: "Patient/patient-42"}
                },
                request: {method: "POST", url: "Observation"}
            }
        ]
    };

    string patientId = check extractPatientIdFromVitalsBundle(bundle);
    test:assertEquals(patientId, "patient-42");
}

@test:Config {}
function testExtractPatientIdFromVitalsBundleRejectsEmptyBundle() {
    json bundle = {resourceType: "Bundle", 'type: "transaction", entry: []};
    string|error result = extractPatientIdFromVitalsBundle(bundle);
    test:assertTrue(result is error);
}

@test:Config {}
function testBuildEmergencyAnswersMatchesQuestionIdToBotQuestionText() {
    TranscriptCallback callback = {
        sessionId: "session-1",
        title: "Emergency check-in",
        messages: [
            {role: "bot", text: "How are you feeling?", time: "2026-07-06T10:00:00Z", questionId: "1"},
            {role: "user", text: "Dizzy", time: "2026-07-06T10:01:00Z", questionId: "1"},
            {role: "bot", text: "Any chest pain?", time: "2026-07-06T10:02:00Z", questionId: "2"},
            {
                role: "user",
                text: "Yes, since this morning",
                time: "2026-07-06T10:03:00Z",
                replyTo: {questionId: "2", questionText: "Any chest pain?"}
            }
        ]
    };

    EmergencyAnswer[] answers = buildEmergencyAnswers(callback);
    test:assertEquals(answers.length(), 2);
    test:assertEquals(answers[0].question, "How are you feeling?");
    test:assertEquals(answers[0].answer, "Dizzy");
    test:assertEquals(answers[1].question, "Any chest pain?");
    test:assertEquals(answers[1].answer, "Yes, since this morning");
}

@test:Config {}
function testExtractPatientConvertsFhirPatientJson() returns error? {
    json patientJson = {
        resourceType: "Patient",
        id: "patient-7",
        name: [{given: ["Jane"], family: "Doe"}]
    };

    Patient patient = check extractPatient(patientJson, "fallback-id");
    test:assertEquals(patient.id, "patient-7");
    test:assertEquals(patient.name, "Jane Doe");
}
