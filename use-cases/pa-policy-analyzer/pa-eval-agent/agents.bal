import ballerina/ai;
import ballerina/log;
import ballerina/sql;
import ballerina/uuid;

final ai:ShortTermMemory aiShorttermmemory = check new ();

final ai:Agent gapEvalAgent = check new (
    systemPrompt = {
        role: string `You are a prior authorization evaluation agent for health insurance. 
                    You evaluate whether a patient meets the coverage criteria defined in a payer's policy clause tree.`,
        instructions: string `
            0. Every tool call requires a sessionId parameter. ALWAYS pass the exact "Session ID for tool calls"
                value given in the prompt. Do NOT invent, guess, or modify it. Do NOT use the patient name or any
                other identifier as the sessionId.
            1. First, call get_policy_clauses to load the clause tree for the policy.
            2. The patient's clinical data (conditions, medications, procedures, observations, and clinical notes) is 
                already provided in the prompt below. Use that data directly — do NOT call any tool to fetch it.
            3. Evaluate EACH leaf clause against the patient data:
                - For group clauses with AND logic: ALL children must be satisfied.
                - For group clauses with OR logic: if ANY one child is satisfied, skip the rest in that group and mark the group as satisfied.
                - For exclusion clauses: check that the excluded condition is NOT present. "satisfied" means the exclusion does NOT apply 
                    (i.e. the patient does NOT have the contraindication).
            4. For each clause evaluation, call record_clause_result with your finding. Include:
                - clause_id: the clause ID from the policy
                - status: "satisfied" | "insufficient" | "needs_review" | "not_applicable"
                - confidence: 0.0-1.0 how confident you are
                - reasoning: 1-2 sentence explanation referencing specific clinical data
                - evidence_json: JSON array of evidence items, each with: source, document_id, date, text, resource_type
                - ai_augmented: true if you inferred this from unstructured notes rather than structured data
            5. After evaluating all clauses, call finalize_evaluation with the overall status and reasoning.
                - "approved" if ALL required clauses are satisfied
                - "denied" if any clause is "insufficient" and cannot be remedied
                - "pending_review" if any clause is "needs_review" or "insufficient" but could potentially be resolved

            # Important
                - Be precise. Reference specific ICD-10 codes, medication names, dates, and durations.
                - For duration checks (e.g. "PT >= 6 weeks"), calculate from the procedure date and duration data.
                - For medication duration, calculate from start date to end date or to today if still active.
                - Do NOT hallucinate evidence. Only cite data that was returned by the tools.
                - Keep reasoning concise but clinically precise.
            `}, 
        maxIter = 25,
        model = anthropicModelprovider,
        tools = [getPolicyClauses, recordClauseResult, finalizeEvaluation],
        verbose = true,
        memory = aiShorttermmemory
);

@ai:AgentTool {
    name: "get_policy_clauses",
    description: string `Retrieves the coverage policy clause tree for the current evaluation's policy. 
                Returns a hierarchical list of clauses with their IDs, types, logical operators, and text.`
}
isolated function getPolicyClauses(string sessionId) returns string|error {
    EvalContext? ctx = getEvalContext(sessionId);
    if ctx is () {
        return error("No evaluation context found for session");
    }

    stream<CoverageClauseRow, sql:Error?> clauseStream = dbClient->query(`
        SELECT id, policy_id as policyId, parent_id as parentId,
               clause_text as clauseText, clause_type as clauseType,
               logical_operator as logicalOperator, sort_order as sortOrder,
               is_editable as isEditable
        FROM   coverage_clauses
        WHERE  policy_id = ${ctx.policyId}
        ORDER  BY sort_order
    `);
    CoverageClauseRow[] clauses = check from CoverageClauseRow c in clauseStream
        select c;

    if clauses.length() == 0 {
        return "No clauses found for policy " + ctx.policyId;
    }

    return buildClauseTreeText(clauses);
}

@ai:AgentTool {
    name: "record_clause_result",
    description: string `Records the evaluation result for a single policy clause. Call this for each clause you evaluate. 
                evidence_json should be a JSON array string of evidence items, each with: source, document_id, date, text, resource_type.`
}
isolated function recordClauseResult(
        string sessionId,
        string clause_id,
        string status,
        float confidence,
        string reasoning,
        string evidence_json,
        boolean ai_augmented
) returns string|error {
    EvalContext? ctx = getEvalContext(sessionId);
    if ctx is () {
        return error("No evaluation context found for session");
    }

    string resultId = uuid:createType4AsString();

    string? clauseText = ();
    CoverageClauseRow|sql:Error clauseRow = dbClient->queryRow(`
        SELECT id, policy_id as policyId, parent_id as parentId,
               clause_text as clauseText, clause_type as clauseType,
               logical_operator as logicalOperator, sort_order as sortOrder,
               is_editable as isEditable
        FROM coverage_clauses WHERE id = ${clause_id}
    `);
    if clauseRow is CoverageClauseRow {
        clauseText = clauseRow.clauseText;
    }

    _ = check dbClient->execute(`
        INSERT INTO evaluation_results (id, evaluation_id, clause_id, clause_text, status, confidence, reasoning, ai_augmented, sort_order)
        VALUES (${resultId}, ${ctx.evaluationId}, ${clause_id}, ${clauseText}, ${status}, ${confidence}, ${reasoning}, ${ai_augmented}, ${ctx.resultSortOrder})
    `);
    incrementSortOrder(sessionId);

    json|error evidenceParsed = evidence_json.fromJsonString();
    if evidenceParsed is json {
        json[] evidenceArr = <json[]>evidenceParsed;
        foreach json ev in evidenceArr {
            string evId = uuid:createType4AsString();
            json|error srcVal = ev.'source;
            json|error docIdVal = ev.document_id;
            json|error dateVal = ev.date;
            json|error textVal = ev.text;
            json|error typeVal = ev.resource_type;
            string evSource = srcVal is json ? srcVal.toString() : "";
            string evDocId = docIdVal is json ? docIdVal.toString() : "";
            string evDate = dateVal is json ? dateVal.toString() : "";
            string evText = textVal is json ? textVal.toString() : "";
            string evType = typeVal is json ? typeVal.toString() : "Condition";

            _ = check dbClient->execute(`
                INSERT INTO evaluation_evidence (id, result_id, source, document_id, date, text, resource_type)
                VALUES (${evId}, ${resultId}, ${evSource}, ${evDocId}, ${evDate}, ${evText}, ${evType})
            `);
        }
    }

    log:printInfo(string `Recorded clause ${clause_id} = ${status} (confidence: ${confidence})`);
    return string `Recorded: clause ${clause_id} → ${status}`;
}

@ai:AgentTool {
    name: "finalize_evaluation",
    description: string `Finalizes the evaluation with an overall status and reasoning. Call this after evaluating all clauses. 
                overall_status must be 'approved', 'denied', or 'pending_review'.`
}
isolated function finalizeEvaluation(
        string sessionId,
        string overall_status,
        string overall_reasoning
) returns string|error {
    EvalContext? ctx = getEvalContext(sessionId);
    if ctx is () {
        return error("No evaluation context found for session");
    }

    _ = check dbClient->execute(`
        UPDATE evaluations
        SET    status = ${overall_status},
               overall_reasoning = ${overall_reasoning},
               updated_at = CURRENT_TIMESTAMP
        WHERE  id = ${ctx.evaluationId}
    `);

    log:printInfo(string `Evaluation ${ctx.evaluationId} finalized: ${overall_status}`);
    clearEvalContext(sessionId);

    return string `Evaluation finalized: ${overall_status}`;
}
