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

import ballerinax/health.fhir.r4;
import ballerinax/health.fhir.r4.international401;

isolated function buildMlRiskAssessment(string patientId, string[] observationRefs, HeartRiskResponse heartRisk, string context = "") returns international401:RiskAssessment {
    r4:Reference[] basis = observationRefs.map(ref => <r4:Reference>{reference: ref});
    string methodText = "care-loop-heart-risk-service (" + heartRisk.selected_model + ")";
    if context != "" {
        methodText += " - " + context;
    }
    return {
        status: international401:CODE_STATUS_FINAL,
        subject: {reference: "Patient/" + patientId},
        basis,
        method: {text: methodText},
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
        prediction: [{probabilityDecimal: <decimal>agentic.probability, qualitativeRisk: {coding: [{system: "http://terminology.hl7.org/CodeSystem/risk-probability", code: agentic.risk}]}}]
    };
}
