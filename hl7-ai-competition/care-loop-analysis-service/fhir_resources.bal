import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

isolated function buildMlRiskAssessment(string patientId, string[] observationRefs, HeartRiskResponse heartRisk) returns international401:RiskAssessment {
    r4:Reference[] basis = observationRefs.map(ref => <r4:Reference>{reference: ref});
    return {
        status: international401:CODE_STATUS_FINAL,
        subject: {reference: "Patient/" + patientId},
        basis,
        method: {text: "care-loop-heart-risk-service (" + heartRisk.selected_model + ")"},
        prediction: [{probabilityDecimal: <decimal>heartRisk.probability}]
    };
}

# + patientId - the FHIR Patient id this assessment is for
# + agentic - care-loop-ai-service's own probability/risk assessment
# + return - the agentic-only RiskAssessment, unsaved
isolated function buildAgenticRiskAssessment(string patientId, AiRiskAssessmentResponse agentic) returns international401:RiskAssessment {
    r4:Reference[] basis = agentic.referencedResources.map(ref => <r4:Reference>{reference: ref});
    return {
        status: international401:CODE_STATUS_FINAL,
        subject: {reference: "Patient/" + patientId},
        basis,
        method: {text: "care-loop-ai-service agentic assessment"},
        note: [{text: agentic.reasoning}],
        prediction: [{probabilityDecimal: <decimal>agentic.probability, rationale: "risk=" + agentic.risk}]
    };
}
