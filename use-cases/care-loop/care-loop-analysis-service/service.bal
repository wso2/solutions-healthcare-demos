import ballerina/http;

service / on new http:Listener(listenPort) {

    // Acks immediately so care-loop-collector-service's own POST /vitals call isn't held up by the cycle.
    resource function post vitals\-ready(VitalsReadyRequest request) returns http:Accepted {
        _ = start runVitalsReadyCycle(request.patientId);
        return http:ACCEPTED;
    }

    // Acks once the pending case is confirmed, then runs the slower agentic assessment in the background - see runEmergencyAnswersCycle.
    resource function post emergency\-answers(EmergencyAnswersRequest request) returns http:Accepted|http:NotFound {
        PendingCase? pendingCase = getPendingCase(request.patientId);
        if pendingCase is () {
            return <http:NotFound>{body: {message: "no pending case for patientId: " + request.patientId}};
        }
        resolvePendingCase(request.patientId);
        _ = start runEmergencyAnswersCycle(request, pendingCase);
        return http:ACCEPTED;
    }
}
