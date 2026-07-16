import care_loop/care_loop_common as common;
import ballerina/http;
import ballerina/lang.runtime;
import ballerina/lang.'string as strings;
import ballerina/log;
import ballerina/time;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4.international401;

isolated function runVitalsReadyCycle(string patientId) {
    // An emergency questionnaire is already in flight for this patient: skip so the demo's short
    // vitals cadence doesn't re-escalate every cycle and spawn duplicate chat sessions.
    if getPendingCase(patientId) is PendingCase {
        log:printInfo("vitals-ready: skipping, an emergency questionnaire is already pending", patientId = patientId);
        return;
    }

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

    // Prefill everything the record already knows before scoring, so even the escalation gate uses
    // the full feature set and the follow-up chat only has to ask for the genuine gaps.
    FeatureSlots slots = prefillFeatures(patientId, <float>age, sex, maxHr.value, now);
    HeartRiskRequest heartRiskRequest = toHeartRiskRequest(slots);
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
    putPendingCase(patientId, {heartRisk: heartRiskResponse, observationRefs, display, slots});

    http:Response|http:ClientError generateResult = collectorClient->post(
            "/patients/" + patientId + "/generate",
            {emergencyContext: {mlProbability: heartRiskResponse.probability, slots}});
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
    resolvePendingCase(patientId);

    // Try to salvage whatever the patient answered before the timeout: the collector hands over the
    // partial slots + answers and finalizes its live session so the two paths can't double up.
    ClaimResponse|http:ClientError claim = collectorClient->post(
            "/patients/" + patientId + "/conversation/claim", {}, targetType = ClaimResponse);
    if claim is ClaimResponse && claim.found {
        log:printWarn("emergency questionnaire timed out; running enriched assessment on partial answers",
                patientId = patientId);
        EmergencyAnswersRequest partialRequest = {
            patientId,
            answers: claim.answers,
            slots: claim.slots ?: pendingCase.slots
        };
        runEmergencyAnswersCycle(partialRequest, pendingCase, timedOut = true);
        return;
    }

    log:printWarn("emergency questionnaire timed out with no answers, fail-safe escalating on ML probability alone",
            patientId = patientId, mlProbability = mlProbability);
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

# Runs in the background: /risk-assessment's multi-tool-call round-trips were blowing past
# whatsapp-simulator's request timeout when run synchronously. Re-scores /predict with the
# chat-enriched feature set first, so reassuring answers can lower the probability (and abnormal
# ones raise it) before the escalation decision.
# + request - Emergency answers request containing patient answers and slots
# + pendingCase - The current pending emergency questionnaire state, including prior vitals readings, display details, and feature slots.
# + timedOut - Whether the patient answered on time or not
isolated function runEmergencyAnswersCycle(EmergencyAnswersRequest request, PendingCase pendingCase, boolean timedOut = false) {
    FeatureSlots slots = request.slots ?: pendingCase.slots;
    HeartRiskResponse effectiveRisk = pendingCase.heartRisk;
    HeartRiskResponse|http:ClientError enriched = heartRiskClient->post("/predict", toHeartRiskRequest(slots), targetType = HeartRiskResponse);
    if enriched is HeartRiskResponse {
        effectiveRisk = enriched;
    } else {
        log:printWarn("emergency-answers: enriched /predict failed, using initial probability",
                patientId = request.patientId, 'error = enriched);
    }

    AiRiskAssessmentRequest aiRequest = {
        patientId: request.patientId,
        mlProbability: effectiveRisk.probability,
        answers: request.answers,
        slots
    };
    AiRiskAssessmentResponse|http:ClientError aiResponse = aiClient->post("/risk-assessment", aiRequest, targetType = AiRiskAssessmentResponse);
    if aiResponse is http:ClientError {
        // One retry: the agentic loop is nondeterministic and a single malformed answer or
        // exceeded iteration cap otherwise kills the whole run with no Task and no dashboard trace.
        log:printWarn("emergency-answers: risk-assessment call failed, retrying once",
                patientId = request.patientId, 'error = aiResponse);
        aiResponse = aiClient->post("/risk-assessment", aiRequest, targetType = AiRiskAssessmentResponse);
    }
    if aiResponse is http:ClientError {
        log:printError("emergency-answers: risk-assessment call failed", patientId = request.patientId, 'error = aiResponse);
        return;
    }

    string mlContext = timedOut ? "post-questionnaire features (questionnaire timed out; partial answers used)" : "post-questionnaire features";
    international401:RiskAssessment mlRiskAssessment = buildMlRiskAssessment(
            request.patientId, pendingCase.observationRefs, effectiveRisk, mlContext);
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
    // escalated mirrors the guard below, computed server-side so the dashboard never re-derives threshold
    // math. Uses effectiveRisk (the chat-enriched re-score), not the original pendingCase.heartRisk, so a
    // reassuring answer that lowers the probability below threshold is reflected here too.
    boolean escalated = effectiveRisk.probability >= mlEscalationThreshold && aiResponse.probability >= agenticEscalationThreshold;
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
        mlProbability: effectiveRisk.probability,
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
            request.patientId, effectiveRisk.probability, aiResponse, pendingCase.display,
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
