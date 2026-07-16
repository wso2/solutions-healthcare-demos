import ballerina/http;

isolated map<GeneratedSession> generatedSessions = {};

# Runs one patient's questionnaire generation + whatsapp session creation end to end; isolated so `start` can run it concurrently.
#
# + patient - the patient to generate a questionnaire and chat session for
# + emergencyContext - present when this generation was triggered by an ML escalation, so the resulting
#   session can be flagged for /transcripts to notify analysis-service once it's answered
# + return - the outcome of this patient's generation attempt
isolated function processPatient(Patient patient, EmergencyContext? emergencyContext = ()) returns GenerateResult {
    // Emergency (ML-escalated) cases get the turn-by-turn adaptive check-in; everything else keeps the scripted one-shot questionnaire below.
    if emergencyContext is EmergencyContext {
        return startLiveConversation(patient, emergencyContext);
    }

    GenerateResult result = {patientId: patient.id, patientName: patient.name};

    AiQuestionnaireRequest aiRequest = {patientId: patient.id};
    AiQuestionnaireResponse|http:ClientError aiResponse = aiClient->post("/questionnaires", aiRequest);
    if aiResponse is http:ClientError {
        result.'error = "questionnaire generation failed: " + aiResponse.message();
        return result;
    }

    WhatsappQuestionnaire|error whatsappQuestionnaire = toWhatsappQuestionnaire(aiResponse.questionnaire);
    if whatsappQuestionnaire is error {
        result.'error = "failed to convert questionnaire: " + whatsappQuestionnaire.message();
        return result;
    }

    CreateSessionRequest sessionRequest = {
        questionnaire: whatsappQuestionnaire,
        callbackUrl: collectorPublicUrl + "/transcripts",
        patientId: patient.id,
        patientName: patient.name
    };
    anydata|http:ClientError sessionResult = postWithRetry(whatsappClient, "/api/sessions", sessionRequest, CreateSessionResponse);
    if sessionResult is http:ClientError {
        result.'error = "failed to create whatsapp session: " + sessionResult.message();
        return result;
    }
    CreateSessionResponse sessionResponse = <CreateSessionResponse>sessionResult;

    lock {
        // Reached only for non-emergency (scripted) sessions; emergency cases returned above.
        generatedSessions[sessionResponse.id] = {
            patientId: patient.id,
            patientName: patient.name,
            questionnaire: aiResponse.questionnaire.clone()
        };
    }

    result.sessionId = sessionResponse.id;
    result.path = sessionResponse.path;
    return result;
}
