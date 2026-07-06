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
    international401:QuestionnaireResponseItem[] items = [];
    foreach ChatMessage message in callback.messages {
        string? questionId = message.questionId ?: message.replyTo?.questionId;
        if message.role == "user" && questionId is string {
            items.push({
                linkId: questionId,
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

// create()'s default MINIMAL preference returns {resourceId, version}, not a full resource - fall back to "id" in case that ever changes.
isolated function extractFhirId(fhir:FHIRResponse response) returns string? {
    json|xml resourceValue = response.'resource;
    if resourceValue is xml {
        return ();
    }

    string|error resourceId = trap <string>(checkpanic resourceValue.resourceId);
    if resourceId is string {
        return resourceId;
    }

    string|error id = trap <string>(checkpanic resourceValue.id);
    return id is string ? id : ();
}
