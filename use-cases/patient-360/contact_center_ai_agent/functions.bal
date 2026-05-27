import ballerina/log;

// Information about API rate limiting errors
type RateLimitInfo record {
    string code;
    string message;
};

// Detects if an error is due to API rate limiting
function isRateLimitError(error err) returns RateLimitInfo? {
    string errorString = err.toString();

    // Check if error contains rate limit indicators
    if (!errorString.includes("900801") && !errorString.includes("API Limit Reached")) {
        return ();
    }

    // Extract rate limit information
    string? code = extractBetween(errorString, "\"code\":\"", "\"");
    string? message = extractBetween(errorString, "\"message\":\"", "\"");

    if (code is string && message is string) {
        return {
            code: code,
            message: message
        };
    }

    return ();
}

// Detects if an error is due to guardrail intervention by examining the error chain
function isGuardrailIntervention(error err) returns GuardrailInfo? {
    string errorString = err.toString();

    // Check if error contains guardrail indicators
    if (!errorString.includes("900514")) {
        return ();
    }

    // Extract the intervening guardrail message
    string? intervention = extractBetween(errorString, "\"interveningGuardrail\":\"", "\"");
    string? assessmentMessage = extractBetween(errorString, "\"assessments\":{\"message\":\"", "\"");

    if (intervention is string) {
        return {
            intervention: intervention,
            assessment: assessmentMessage ?: "Guardrail intervention detected"
        };
    }

    return ();
}

// Helper function to extract text between two delimiters
function extractBetween(string text, string startDelim, string endDelim) returns string? {
    int? startIndex = text.indexOf(startDelim);
    if (startIndex is () || startIndex < 0) {
        return ();
    }

    int contentStart = startIndex + startDelim.length();
    int? endIndex = text.indexOf(endDelim, contentStart);
    if (endIndex is () || endIndex < 0) {
        return ();
    }

    return text.substring(contentStart, endIndex);
}

function queryAgent(string sessionId, string userMessage) returns string {
    string|error result = _CallCenterAgentAgent.run(userMessage, sessionId);
    if (result is error) {
        // Check for API rate limiting errors first
        RateLimitInfo? rateLimitInfo = isRateLimitError(result);
        if (rateLimitInfo is RateLimitInfo) {
            log:printWarn("API rate limit reached: " + rateLimitInfo.message);
            log:printInfo("Rate limit code: " + rateLimitInfo.code);
            // Return a user-friendly rate limit message
            return "I apologize, but we're experiencing high demand right now. Our service has reached its API rate limit. Please try again in a few moments.";
        }

        // Check if this is a guardrail intervention
        GuardrailInfo? guardrailInfo = isGuardrailIntervention(result);
        if (guardrailInfo is GuardrailInfo) {
            log:printInfo("Guardrail intervention detected: " + guardrailInfo.intervention);
            log:printInfo("Assessment: " + guardrailInfo.assessment);
            // Return a friendly message instead of propagating the error
            return "I'm sorry, but I cannot process that request. It appears to violate our usage guidelines. Please rephrase your question or ask something else that I can help you with.";
        }

        // For all other errors, log and return a generic error message
        log:printError("Error querying Call Center Agent: " + result.message());
        log:printInfo("Full Error message: " + result.toString());
        return "I'm sorry, but I encountered an unexpected error while processing your request. Please try again later or contact support if the issue persists.";
    }
    return result;
}
