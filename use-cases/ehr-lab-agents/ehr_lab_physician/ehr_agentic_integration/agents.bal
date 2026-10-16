import ballerina/ai;
import ballerina/log;
import ballerina/uuid;
import ballerinax/ai.openrouter;

// Lab-result polling agent: periodically asked (by the scheduled job in main.bal) to check
// whether a session's Quest lab order has produced a final result. The agent decides, from the
// DiagnosticReport status its tool returns, whether the session is ready for physician review,
// and if so resumes the session's durable workflow via the checkLabResultReady tool itself.
// Configured from this integration's own `ai.*` configurables (section 1 of the spec) rather
// than a platform-managed provider, so `ai.mode = llm` works with any OpenAI-compatible endpoint.
final ai:ModelProvider labPollingModel = check new openrouter:ModelProvider(aiApiKey, modelType = aiModel,
        serviceUrl = aiProvider);

final ai:Agent labResultPollingAgent = check new (
    systemPrompt = {
        role: string `Lab Result Polling Agent`,
        instructions: string `You monitor a single longevity-assessment session that is waiting on a lab result from Quest Diagnostics.
Use the checkLabResultReady tool with the given workflowId and placerOrderId to fetch the current DiagnosticReport status from Quest.
A result counts as ready for physician review only when the DiagnosticReport status is final, amended, or corrected.
If the result is ready, the tool will have already resumed the workflow - simply report that it is ready.
If the result is not ready yet (no report, or status is registered/preliminary/partial), report that the session should keep waiting.
Never guess a status - always call the tool to check.`
    },
    model = labPollingModel,
    tools = [checkLabResultReady]
);

# Agent tool: checks Quest for the DiagnosticReport belonging to a session's placer-order id and,
# if the result is final, resumes the session's waiting workflow instance.
# + workflowId - the longevity-assessment session id (e.g. `lw-7f3c2a`)
# + placerOrderId - the placer-order id stamped on the ServiceRequest sent to Quest
# + return - a short status description of what was found, or an error if the Quest call failed
@ai:AgentTool
isolated function checkLabResultReady(string workflowId, string placerOrderId) returns string|error {
    string requestId = uuid:createRandomUuid();
    LabPollOutcome outcome = check pollQuestForLabResult(placerOrderId, requestId);

    if !outcome.ready {
        string status = outcome.status ?: "no-report-yet";
        return string `Not ready: Quest status for ${placerOrderId} is '${status}'. Keep waiting.`;
    }

    string reportId = outcome.reportId ?: "unknown";
    string status = outcome.status ?: "final";
    LabResultEvent labResult = {placerOrderId: placerOrderId, reportId: reportId, status: status};

    error? resumeResult = resumeWithLabResult(workflowId, labResult);
    if resumeResult is error {
        log:printError("Failed to resume workflow after lab result ready", 'error = resumeResult,
                workflowId = workflowId);
        return error(string `Lab result is ready (status '${status}') but resuming workflow ${workflowId} failed: ${resumeResult.message()}`);
    }

    return string `Ready: DiagnosticReport ${reportId} is '${status}'. Session ${workflowId} moved to ready-for-review and the workflow was resumed.`;
}
