import care_loop/care_loop_common as common;
import ballerina/http;
import ballerina/lang.runtime;
import ballerina/lang.'string as strings;
import ballerina/log;
import ballerina/time;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4.international401;

isolated function runVitalsReadyCycle(string patientId) {
    fhir:FHIRResponse|fhir:FHIRError patientResponse = fhirConnector->getById("Patient", patientId);
    if patientResponse is fhir:FHIRError {
        log:printError("vitals-ready: failed to fetch patient", patientId = patientId, 'error = patientResponse);
        return;
    }
    international401:Patient|error patient = (<json>patientResponse.'resource).cloneWithType(international401:Patient);
    if patient is error {
        log:printError("vitals-ready: failed to parse patient", patientId = patientId, 'error = patient);
        return;
    }

    string? birthDate = patient.birthDate;
    if birthDate is () {
        log:printWarn("vitals-ready: skipping, patient has no birthDate", patientId = patientId);
        return;
    }
    int|error age = deriveAge(birthDate, time:utcNow());
    if age is error {
        log:printWarn("vitals-ready: skipping, unparseable birthDate", patientId = patientId, birthDate = birthDate);
        return;
    }

    "M"|"F"? sex = deriveSex(patient.gender);
    if sex is () {
        log:printWarn("vitals-ready: skipping, patient has no usable gender", patientId = patientId, gender = patient.gender);
        return;
    }

    time:Utc now = time:utcNow();
    time:Utc windowStart = time:utcAddSeconds(now, -3600);

    map<string[]> observationSearchParams = {
        "patient": [patientId],
        "code": [strings:'join(",", ...VITALS_LOINC_CODES)]
    };
    fhir:FHIRResponse|fhir:FHIRError observationsResponse = fhirConnector->search("Observation", searchParameters = observationSearchParams);
    if observationsResponse is fhir:FHIRError {
        log:printError("vitals-ready: failed to search observations", patientId = patientId, 'error = observationsResponse);
        return;
    }

    VitalReading[] readings = withinWindow(extractVitalReadings(<json>observationsResponse.'resource), windowStart, now);
    VitalReading? maxHr = maxHeartRate(readings);
    if maxHr is () {
        log:printWarn("vitals-ready: skipping, no heart-rate observations in the last hour", patientId = patientId);
        return;
    }

    HeartRiskRequest heartRiskRequest = {age: <float>age, max_hr: maxHr.value, sex};
    HeartRiskResponse|http:ClientError heartRiskResponse = heartRiskClient->post("/predict", heartRiskRequest, targetType = HeartRiskResponse);
    if heartRiskResponse is http:ClientError {
        log:printError("vitals-ready: heart-risk-service call failed", patientId = patientId, 'error = heartRiskResponse);
        return;
    }
    future<()> _ = start notifyDashboard(patientId, common:ML_RISK_SCORING_COMPLETE, "probability " + heartRiskResponse.probability.toString(), {
        model: heartRiskResponse.selected_model,
        probability: heartRiskResponse.probability.toString(),
        band: heartRiskResponse.probability >= mlEscalationThreshold ? ELEVATED : NORMAL
    });

    string[] observationRefs = readings.map(r => "Observation/" + r.id);

    if heartRiskResponse.probability < mlEscalationThreshold {
        international401:RiskAssessment riskAssessment = buildMlRiskAssessment(patientId, observationRefs, heartRiskResponse);
        fhir:FHIRResponse|fhir:FHIRError saveResult = fhirConnector->create(riskAssessment.toJson());
        if saveResult is fhir:FHIRError {
            log:printError("vitals-ready: failed to save RiskAssessment", patientId = patientId, 'error = saveResult);
        }
        return;
    }

    log:printWarn("vitals-ready: ML probability crossed escalation threshold, starting emergency questionnaire",
            patientId = patientId, probability = heartRiskResponse.probability);
    future<()> _ = start notifyDashboard(patientId, common:ESCALATION_TRIGGERED,
            "ML probability " + heartRiskResponse.probability.toString() + " crossed threshold " + mlEscalationThreshold.toString(),
            {probability: heartRiskResponse.probability.toString(), threshold: mlEscalationThreshold.toString()});
    PatientDisplay display = patientDisplay(patient, patientId, age, sex);
    putPendingCase(patientId, {heartRisk: heartRiskResponse, observationRefs, display});

    http:Response|http:ClientError generateResult = collectorClient->post(
            "/patients/" + patientId + "/generate",
            {emergencyContext: {mlProbability: heartRiskResponse.probability}});
    if generateResult is http:ClientError {
        log:printError("vitals-ready: failed to start emergency questionnaire", patientId = patientId, 'error = generateResult);
    }

    _ = start runTimeoutWatcher(patientId, heartRiskResponse.probability);
}

isolated function runTimeoutWatcher(string patientId, float mlProbability) {
    runtime:sleep(<decimal>questionnaireTimeoutHours * 3600);
    PendingCase? pendingCase = getPendingCase(patientId);
    if pendingCase is () {
        return;
    }
    log:printWarn("emergency questionnaire timed out with no patient response, fail-safe escalating on ML probability alone",
            patientId = patientId, mlProbability = mlProbability);
    resolvePendingCase(patientId);

    HeartRiskResponse timeoutHeartRisk = {probability: mlProbability, prediction: 1, threshold: mlEscalationThreshold, selected_model: "unavailable - questionnaire timed out"};
    international401:RiskAssessment riskAssessment = buildMlRiskAssessment(patientId, pendingCase.observationRefs, timeoutHeartRisk);
    fhir:FHIRResponse|fhir:FHIRError raSaveResult = fhirConnector->create(riskAssessment.toJson());
    string? riskAssessmentId = raSaveResult is fhir:FHIRResponse ? extractFhirId(raSaveResult) : ();
    if raSaveResult is fhir:FHIRError {
        log:printError("timeout escalation: failed to save RiskAssessment", patientId = patientId, 'error = raSaveResult);
    }

    international401:Task task = buildTimeoutEscalationTask(patientId, mlProbability, pendingCase.display, riskAssessmentId, pendingCase.observationRefs);
    fhir:FHIRResponse|fhir:FHIRError saveResult = ehrFhirConnector->create(task.toJson());
    if saveResult is fhir:FHIRError {
        log:printError("timeout escalation: failed to save Task to ehr-fhir-server", patientId = patientId, 'error = saveResult);
        return;
    }
    future<()> _ = start notifyDashboard(patientId, common:FHIR_TASK_CREATED_FOR_FRONT_DESK, extractFhirId(saveResult), {
        taskId: extractFhirId(saveResult) ?: "",
        status: task.status,
        priority: task.priority ?: ""
    });
}

# Runs in the background: /risk-assessment's multi-tool-call round-trips were blowing past whatsapp-simulator's request timeout when run synchronously.
isolated function runEmergencyAnswersCycle(EmergencyAnswersRequest request, PendingCase pendingCase) {
    AiRiskAssessmentRequest aiRequest = {
        patientId: request.patientId,
        mlProbability: pendingCase.heartRisk.probability,
        answers: request.answers
    };
    AiRiskAssessmentResponse|http:ClientError aiResponse = aiClient->post("/risk-assessment", aiRequest, targetType = AiRiskAssessmentResponse);
    if aiResponse is http:ClientError {
        log:printError("emergency-answers: risk-assessment call failed", patientId = request.patientId, 'error = aiResponse);
        return;
    }

    international401:RiskAssessment mlRiskAssessment = buildMlRiskAssessment(
            request.patientId, pendingCase.observationRefs, pendingCase.heartRisk);
    fhir:FHIRResponse|fhir:FHIRError mlSaveResult = fhirConnector->create(mlRiskAssessment.toJson());
    string? mlRiskAssessmentId = mlSaveResult is fhir:FHIRResponse ? extractFhirId(mlSaveResult) : ();
    if mlSaveResult is fhir:FHIRError {
        log:printError("emergency-answers: failed to save ML RiskAssessment", patientId = request.patientId, 'error = mlSaveResult);
    }

    international401:RiskAssessment agenticRiskAssessment = buildAgenticRiskAssessment(request.patientId, aiResponse);
    fhir:FHIRResponse|fhir:FHIRError agenticSaveResult = fhirConnector->create(agenticRiskAssessment.toJson());
    string? agenticRiskAssessmentId = agenticSaveResult is fhir:FHIRResponse ? extractFhirId(agenticSaveResult) : ();
    if agenticSaveResult is fhir:FHIRError {
        log:printError("emergency-answers: failed to save agentic RiskAssessment", patientId = request.patientId, 'error = agenticSaveResult);
    }
    // escalated mirrors the guard below, computed server-side so the dashboard never re-derives threshold math.
    boolean escalated = pendingCase.heartRisk.probability >= mlEscalationThreshold && aiResponse.probability >= agenticEscalationThreshold;
    future<()> _ = start notifyDashboard(request.patientId, common:AGENTIC_RISK_ASSESSMENT_COMPLETE,
            aiResponse.risk + " risk, probability " + aiResponse.probability.toString(), {
        risk: aiResponse.risk,
        probability: aiResponse.probability.toString(),
        riskAssessmentId: agenticRiskAssessmentId ?: "",
        escalated: escalated.toString()
    });

    if !escalated {
        return;
    }

    TaskDescriptionRequest descriptionRequest = {
        patientId: request.patientId,
        mlProbability: pendingCase.heartRisk.probability,
        answers: request.answers,
        display: pendingCase.display,
        agentic: aiResponse
    };
    TaskDescriptionResponse|http:ClientError descriptionResponse =
        aiClient->post("/task-description", descriptionRequest, targetType = TaskDescriptionResponse);
    if descriptionResponse is http:ClientError {
        log:printError("emergency-answers: task-description call failed", patientId = request.patientId, 'error = descriptionResponse);
        return;
    }

    international401:Task task = buildEscalationTask(
            request.patientId, pendingCase.heartRisk.probability, aiResponse, pendingCase.display,
            descriptionResponse.description, mlRiskAssessmentId, agenticRiskAssessmentId,
            pendingCase.observationRefs, request.questionnaireResponseId);
    fhir:FHIRResponse|fhir:FHIRError taskSaveResult = ehrFhirConnector->create(task.toJson());
    if taskSaveResult is fhir:FHIRError {
        log:printError("emergency-answers: failed to save Task to ehr-fhir-server", patientId = request.patientId, 'error = taskSaveResult);
        return;
    }
    future<()> _ = start notifyDashboard(request.patientId, common:FHIR_TASK_CREATED_FOR_FRONT_DESK, extractFhirId(taskSaveResult), {
        taskId: extractFhirId(taskSaveResult) ?: "",
        status: task.status,
        priority: task.priority ?: ""
    });
}
