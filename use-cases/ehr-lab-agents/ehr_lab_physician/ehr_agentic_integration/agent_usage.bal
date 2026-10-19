// What the agents use and spend. The trace router keeps a ledger of every agent run from its GenAI spans
// (tokens per model call) and prices it with the AI gateway's own price list, so the portal shows the
// same cost the gateway's budgets count; the budgets themselves are enforced by Agent Manager
// (scripts/amp-budgets.sh), not here.
import ballerina/http;

final http:Client usageLedger = check new (agentManager.usageUrl, {timeout: 5});

# Reads the usage ledger.
#
# + assessment - only this assessment's agent runs, or nil for all
# + return - per agent and per run usage with cost and budgets, or an error if the ledger is unreachable
isolated function agentUsage(string? assessment) returns json|error {
    if assessment is string && !re `[A-Za-z0-9_-]{1,64}`.isFullMatch(assessment) {
        return error("invalid assessment id");
    }
    return usageLedger->get(assessment is string ? "?assessment=" + assessment : "");
}
