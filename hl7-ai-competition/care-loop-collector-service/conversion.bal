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

// Builds a FHIR Questionnaire from the questions actually asked in a live session, so the paired
// QuestionnaireResponse links to a persisted resource instead of dangling linkIds.
isolated function buildLiveQuestionnaire(GeneratedSession session) returns json {
    json[] items = [];
    foreach AskedQuestion question in session.asked {
        items.push({linkId: question.id, text: question.text, 'type: "string"});
    }
    return {
        resourceType: "Questionnaire",
        status: "active",
        title: "Care team check-in",
        subjectType: ["Patient"],
        item: items
    };
}

// Builds the QuestionnaireResponse for a live session against the same linkIds as buildLiveQuestionnaire.
isolated function buildLiveQuestionnaireResponse(GeneratedSession session, string? questionnaireId) returns json {
    json[] items = [];
    foreach AskedQuestion question in session.asked {
        string? answer = question.answer;
        if answer is string {
            items.push({linkId: question.id, answer: [{valueString: answer}]});
        }
    }
    map<json> questionnaireResponse = {
        resourceType: "QuestionnaireResponse",
        status: "completed",
        subject: {reference: "Patient/" + session.patientId},
        item: items
    };
    if questionnaireId is string {
        questionnaireResponse["questionnaire"] = "Questionnaire/" + questionnaireId;
    }
    return questionnaireResponse;
}

// Flattens a live session's answered questions into question/answer pairs for analysis-service.
isolated function collectLiveAnswers(GeneratedSession session) returns EmergencyAnswer[] {
    EmergencyAnswer[] answers = [];
    foreach AskedQuestion question in session.asked {
        string? answer = question.answer;
        if answer is string {
            answers.push({question: question.text, answer});
        }
    }
    return answers;
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
