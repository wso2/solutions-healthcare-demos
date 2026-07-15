import care_loop/care_loop_common as common;
import ballerina/uuid;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4.international401;

isolated function toWhatsappQuestionnaire(json questionnaire) returns WhatsappQuestionnaire|error {
    string title = "Care Loop check-in";
    string|error titleValue = trap <string>(checkpanic questionnaire.title);
    if titleValue is string && titleValue.trim() != "" {
        title = titleValue;
    }

    json[] items = [];
    json[]|error itemList = trap <json[]>(checkpanic questionnaire.item);
    if itemList is json[] {
        items = itemList;
    }

    WhatsappQuestion[] questions = [];
    foreach json item in items {
        string|error text = trap <string>(checkpanic item.text);
        if text is error {
            continue;
        }
        questions.push({id: uuid:createType4AsString(), text});
    }

    return {title, questions};
}

isolated function buildQuestionnaireResponse(TranscriptCallback callback, GeneratedSession session) returns international401:QuestionnaireResponse {
    map<string> questionTextByLinkId = {};
    foreach ChatMessage message in callback.messages {
        string? questionId = message.questionId;
        if message.role == BOT && questionId is string {
            questionTextByLinkId[questionId] = message.text;
        }
    }

    international401:QuestionnaireResponseItem[] items = [];
    foreach ChatMessage message in callback.messages {
        string? questionId = message.questionId ?: message.replyTo?.questionId;
        if message.role == USER && questionId is string {
            string? questionText = questionTextByLinkId[questionId] ?: message.replyTo?.questionText;
            items.push({
                linkId: questionId,
                text: questionText,
                answer: [{valueString: message.text}]
            });
        }
    }

    international401:QuestionnaireResponse questionnaireResponse = {
        status: international401:CODE_STATUS_COMPLETED,
        subject: {reference: "Patient/" + session.patientId},
        item: items
    };

    string|error questionnaireId = trap <string>(checkpanic session.questionnaire.id);
    if questionnaireId is string {
        questionnaireResponse.questionnaire = "Questionnaire/" + questionnaireId;
    }

    return questionnaireResponse;
}

// Matches each user answer back to the bot question's linkId (directly, or via replyTo) to recover the question text.
isolated function buildEmergencyAnswers(TranscriptCallback callback) returns EmergencyAnswer[] {
    map<string> questionTextByLinkId = {};
    foreach ChatMessage message in callback.messages {
        string? questionId = message.questionId;
        if message.role == BOT && questionId is string {
            questionTextByLinkId[questionId] = message.text;
        }
    }

    EmergencyAnswer[] answers = [];
    foreach ChatMessage message in callback.messages {
        string? questionId = message.questionId ?: message.replyTo?.questionId;
        if message.role != USER || questionId is () {
            continue;
        }
        string question = questionTextByLinkId[questionId] ?: message.replyTo?.questionText ?: questionId;
        answers.push({question, answer: message.text});
    }
    return answers;
}

isolated function extractFhirId(fhir:FHIRResponse response) returns string? => common:extractFhirId(response);
