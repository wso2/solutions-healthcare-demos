import ballerina/ai;
import ballerina/http;

listener ai:Listener CallCenterAgentListener = new (listenOn = check http:getDefaultListener());

service /CallCenterAgent on CallCenterAgentListener {
    resource function post chat(@http:Payload ai:ChatReqMessage request) returns ai:ChatRespMessage|error {
        string stringResult = check _CallCenterAgentAgent.run(request.message, request.sessionId);
        return {message: stringResult};
    }
}
