import ballerina/log;
import ballerina/sql;

function runAgentAsync(string sessionId, string message, string patientName, string cptCode, string payer, string evalId) {
    string clinicalSummary;
    string|error summaryResult = getPatientClinicalSummary(sessionId);
    if summaryResult is error {
        log:printError("Failed to pre-fetch clinical summary for " + evalId + ": " + summaryResult.message());
        clinicalSummary = "Error fetching clinical data: " + summaryResult.message();
    } else {
        clinicalSummary = summaryResult;
    }

    string prompt = string `${message}

Session ID for tool calls: ${sessionId}

${clinicalSummary}`;

    string|error result = gapEvalAgent.run(prompt, sessionId);

    if result is error {
        log:printError("Evaluation agent failed for " + evalId + ": " + result.message());
        sql:ExecutionResult|sql:Error dbResult = dbClient->execute(`
            UPDATE evaluations
            SET    status = 'denied',
                   overall_reasoning = ${"Agent error: " + result.message()},
                   updated_at = CURRENT_TIMESTAMP
            WHERE  id = ${evalId}
        `);
        if dbResult is sql:Error {
            log:printError("Failed to update evaluation status: " + dbResult.message());
        }
        clearEvalContext(sessionId);
    } else {
        log:printInfo("Evaluation agent completed for " + evalId);
    }
}
