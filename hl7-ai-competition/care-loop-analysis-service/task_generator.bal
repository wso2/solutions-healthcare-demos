import care_loop/care_loop_common as common;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

isolated function extractFhirId(fhir:FHIRResponse response) returns string? => common:extractFhirId(response);

isolated function priorityForProbability(float probability) returns international401:TaskPriority {
    if probability >= 0.85 {
        return international401:CODE_PRIORITY_STAT;
    }
    if probability >= 0.65 {
        return international401:CODE_PRIORITY_URGENT;
    }
    return international401:CODE_PRIORITY_ROUTINE;
}

isolated function riskAssessmentReference(string? riskAssessmentId, string display) returns r4:Reference? {
    if riskAssessmentId is () {
        return ();
    }
    return {reference: fhirServerUrl + "/RiskAssessment/" + riskAssessmentId, display};
}

isolated function observationReferences(string[] observationRefs) returns r4:Reference[] {
    return observationRefs.map(ref => <r4:Reference>{reference: ref, display: "Vitals used for escalation"});
}

isolated function questionnaireResponseReference(string? questionnaireResponseId) returns r4:Reference? {
    if questionnaireResponseId is () {
        return ();
    }
    return {reference: "QuestionnaireResponse/" + questionnaireResponseId, display: "Emergency questionnaire response"};
}

isolated function buildEscalationTask(string patientId, float mlProbability, AiRiskAssessmentResponse agentic,
        PatientDisplay display, string description, string? mlRiskAssessmentId, string? agenticRiskAssessmentId,
        string[] observationRefs, string? questionnaireResponseId) returns international401:Task {
    float worstProbability = mlProbability > agentic.probability ? mlProbability : agentic.probability;

    international401:Task task = {
        status: international401:CODE_STATUS_REQUESTED,
        intent: international401:CODE_INTENT_ORDER,
        priority: priorityForProbability(worstProbability),
        'for: {reference: "Patient/" + patientId, display: display.patientName},
        description
    };

    r4:Reference[] basedOn = [
        riskAssessmentReference(mlRiskAssessmentId, "ML RiskAssessment"),
        riskAssessmentReference(agenticRiskAssessmentId, "Agentic RiskAssessment"),
        questionnaireResponseReference(questionnaireResponseId)
    ].filter(ref => ref is r4:Reference).map(ref => <r4:Reference>ref);
    basedOn.push(...observationReferences(observationRefs));
    if basedOn.length() > 0 {
        task.basedOn = basedOn;
    }
    return task;
}

isolated function buildTimeoutEscalationTask(string patientId, float mlProbability, PatientDisplay display,
        string? riskAssessmentId, string[] observationRefs) returns international401:Task {
    int mlProbabilityPercent = <int>(mlProbability * 100);
    string description = string `Patient ${display.patientName} (${display.ageSexSummary}) flagged for review.
Questionnaire timed out with no patient response. Fail-safe escalation on ML probability ${mlProbabilityPercent}% (${mlProbability}) alone (no agentic probability available).`;

    international401:Task task = {
        status: international401:CODE_STATUS_REQUESTED,
        intent: international401:CODE_INTENT_ORDER,
        priority: priorityForProbability(mlProbability),
        'for: {reference: "Patient/" + patientId, display: display.patientName},
        description
    };
    r4:Reference[] basedOn = [
        riskAssessmentReference(riskAssessmentId, "ML RiskAssessment (questionnaire timeout)")
    ].filter(ref => ref is r4:Reference).map(ref => <r4:Reference>ref);
    basedOn.push(...observationReferences(observationRefs));
    if basedOn.length() > 0 {
        task.basedOn = basedOn;
    }
    return task;
}
