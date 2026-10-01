// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

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
