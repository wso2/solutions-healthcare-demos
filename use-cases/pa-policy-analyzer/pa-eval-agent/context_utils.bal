isolated map<EvalContext> evalContextMap = {};

isolated function setEvalContext(string sessionId, EvalContext ctx) {
    lock {
        evalContextMap[sessionId] = ctx.cloneReadOnly();
    }
}

isolated function getEvalContext(string sessionId) returns EvalContext? {
    lock {
        return evalContextMap[sessionId].cloneReadOnly();
    }
}

isolated function incrementSortOrder(string sessionId) {
    lock {
        EvalContext? ctx = evalContextMap[sessionId];
        if ctx is EvalContext {
            ctx.resultSortOrder += 1;
        }
    }
}

isolated function clearEvalContext(string sessionId) {
    lock {
        _ = evalContextMap.remove(sessionId);
    }
}
