import ballerina/log;
import ballerina/task;

// Scheduled job that periodically asks the lab-result polling agent to check every session
// currently in `awaiting-lab-results`. Each tick, for every such session, the agent calls Quest
// (via its checkLabResultReady tool) and - when the result is final - resumes that session's
// durable workflow itself.
class LabResultPollingJob {
    *task:Job;

    public function execute() {
        if aiApiKey.trim().length() == 0 {
            log:printWarn("Lab result polling skipped: aiApiKey is not configured");
            return;
        }
        WorkflowSession[] sessions = getSessionsAwaitingLabResults();
        foreach WorkflowSession session in sessions {
            string prompt = string `Check whether the lab result for workflowId=${session.workflowId} ` +
                string `and placerOrderId=${session.placerOrderId} is ready for physician review.`;
            string|error agentReply = labResultPollingAgent.run(prompt, session.workflowId);
            if agentReply is error {
                log:printError("Lab result polling agent run failed", 'error = agentReply,
                        workflowId = session.workflowId);
                continue;
            }
            log:printInfo("Lab result polling agent tick complete", workflowId = session.workflowId,
                    reply = agentReply);
        }
    }
}

# Starts the recurring lab-result polling job. Called once from `main`.
# + intervalSeconds - how often to poll every awaiting session
# + return - an error if the job could not be scheduled
function startLabResultPollingJob(decimal intervalSeconds) returns error? {
    task:JobId _ = check task:scheduleJobRecurByFrequency(new LabResultPollingJob(), intervalSeconds);
    log:printInfo("Lab result polling job scheduled", intervalSeconds = intervalSeconds);
}
