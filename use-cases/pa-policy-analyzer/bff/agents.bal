import ballerina/log;
import ballerina/http;
import ballerina/uuid;

// Starts an evaluation: creates the DB row, and runs the agent.
// Returns the evaluation ID immediately; the agent runs asynchronously.
function startEvaluation(string patientId, string patientName, string policyId,
        string cptCode, string cptDescription, string payer) returns string|error {
    
    string evalId = uuid:createType4AsString();
    string sessionId = evalId;

    _ = check dbClient->execute(`
        INSERT INTO evaluations (id, patient_id, patient_name, policy_id, cpt_code, cpt_description, payer, status)
        VALUES (${evalId}, ${patientId}, ${patientName}, ${policyId}, ${cptCode}, ${cptDescription}, ${payer}, 'in_progress')
    `);

    // Run agent asynchronously
    http:Client agentClient = check new (agentServiceUrl);

    http:Response|error chatResp = agentClient->/chat.post({
        sessionId: sessionId,
        message: string `
                Evaluate patient "${patientName}" for prior authorization of CPT ${cptCode} under ${payer} policy.
                Fetch the policy clauses, then evaluate each clause using the patient clinical data provided below. For groups with OR logic,
                if one child is satisfied you can skip the remaining children. Finally, finalize with an overall determination.
        `
    });

    if chatResp is error {
        log:printError("Failed to trigger agent: " + chatResp.message());
        return chatResp;
    }

    if chatResp.statusCode >= 400 {
        json|error errBody = chatResp.getJsonPayload();
        string errMsg = errBody is json ? errBody.toJsonString() : chatResp.statusCode.toString();
        log:printError("Agent returned error: " + errMsg);
        return error("Agent error (" + chatResp.statusCode.toString() + "): " + errMsg);
    }

    return evalId;
}
