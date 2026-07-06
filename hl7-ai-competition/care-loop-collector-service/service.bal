import ballerina/http;
import ballerina/log;
import ballerinax/health.clients.fhir;
import ballerinax/health.fhir.r4.international401;

service / on new http:Listener(listenPort) {

    resource function post generate() returns GenerateResponse|http:InternalServerError {
        log:printInfo("generate: fetching patients from FHIR server");
        fhir:FHIRResponse|fhir:FHIRError bundleResponse = fhirConnector->search("Patient");
        if bundleResponse is fhir:FHIRError {
            return <http:InternalServerError>{body: {message: "failed to fetch patients: " + bundleResponse.message()}};
        }

        Patient[] patients = extractPatients(<json>bundleResponse.'resource);

        // `start` fires every strand immediately, so all patients are already running concurrently before any `wait` below runs - the loop just collects results back in order, it doesn't serialize the work.
        future<GenerateResult>[] pending = [];
        foreach var patient in patients {
            future<GenerateResult> f = start processPatient(patient);
            pending.push(f);
        }

        GenerateResult[] results = [];
        foreach int i in 0 ..< pending.length() {
            GenerateResult|error result = wait pending[i];
            if result is error {
                // Unreachable in practice - processPatient has no unhandled throw points - kept as a defensive fallback.
                var patient = patients[i];
                log:printError("processPatient strand failed", patientId = patient.id, 'error = result);
                results.push({patientId: patient.id, patientName: patient.name, 'error: "internal error: " + result.message()});
            } else {
                results.push(result);
            }
        }

        return {results};
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

        string? fhirId = extractFhirId(saveResult);
        return <http:Created>{body: {saved: true, fhirId}};
    }
}
