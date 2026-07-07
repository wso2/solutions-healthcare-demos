import ballerina/http;
import ballerina/log;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4.international401;

service / on new http:Listener(listenPort) {

    resource function post vitals(@http:Payload json bundle) returns http:Ok|http:BadGateway {
        string|error patientId = extractPatientIdFromVitalsBundle(bundle);
        if patientId is error {
            return <http:BadGateway>{body: {message: "malformed vitals bundle: " + patientId.message()}};
        }

        fhir:FHIRResponse|fhir:FHIRError saveResult = fhirConnector->'transaction(bundle);
        if saveResult is fhir:FHIRError {
            return <http:BadGateway>{body: {message: "failed to save vitals bundle: " + saveResult.message()}};
        }

        // Best-effort: a failed analysis-service nudge just means it picks this up on its next cycle instead.
        http:Response|http:ClientError notifyResult = analysisClient->post("/vitals-ready", {patientId});
        if notifyResult is http:ClientError {
            log:printWarn("failed to notify analysis-service of new vitals", patientId = patientId, 'error = notifyResult);
        }

        return http:OK;
    }

    resource function post patients/[string patientId]/generate(@http:Payload GenerateRequestBody? body)
            returns GenerateResult|http:NotFound|http:InternalServerError {
        fhir:FHIRResponse|fhir:FHIRError patientResponse = fhirConnector->getById("Patient", patientId);
        if patientResponse is fhir:FHIRServerError && patientResponse.detail().httpStatusCode == http:STATUS_NOT_FOUND {
            return <http:NotFound>{body: {message: "no such patient: " + patientId}};
        }
        if patientResponse is fhir:FHIRError {
            return <http:InternalServerError>{body: {message: "failed to fetch patient: " + patientResponse.message()}};
        }

        Patient|error patient = extractPatient(<json>patientResponse.'resource, patientId);
        if patient is error {
            return <http:InternalServerError>{body: {message: "failed to parse patient: " + patient.message()}};
        }

        GenerateResult result = processPatient(patient, body?.emergencyContext);
        return result;
    }

    resource function post transcripts(TranscriptCallback callback) returns http:Created|http:NotFound|http:BadGateway {
        GeneratedSession? session = ();
        lock {
            if generatedSessions.hasKey(callback.sessionId) {
                session = generatedSessions.get(callback.sessionId).clone();
            }
        }
        if session is () {
            return <http:NotFound>{body: {message: "unknown sessionId: " + callback.sessionId}};
        }

        international401:QuestionnaireResponse questionnaireResponse = buildQuestionnaireResponse(callback, session);
        fhir:FHIRResponse|fhir:FHIRError saveResult = fhirConnector->create(questionnaireResponse.toJson());
        if saveResult is fhir:FHIRError {
            return <http:BadGateway>{body: {message: "failed to save QuestionnaireResponse: " + saveResult.message()}};
        }

        if session.emergency {
            EmergencyAnswersNotification notification = {
                patientId: session.patientId,
                answers: buildEmergencyAnswers(callback)
            };
            http:Response|http:ClientError notifyResult = analysisClient->post("/emergency-answers", notification);
            if notifyResult is http:ClientError {
                log:printWarn("failed to notify analysis-service of emergency answers",
                        patientId = session.patientId, 'error = notifyResult);
            }
        }

        string? fhirId = extractFhirId(saveResult);
        return <http:Created>{body: {saved: true, fhirId}};
    }
}
