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
