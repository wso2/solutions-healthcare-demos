import ballerina/sql;

// ── Evaluation queries ──────────────────────────────────────────────────────

function queryAllEvaluations() returns EvaluationRow[]|error {
    stream<EvaluationRow, sql:Error?> evalStream = dbClient->query(`
        SELECT id, patient_id as patientId, patient_name as patientName,
               policy_id as policyId, cpt_code as cptCode,
               cpt_description as cptDescription, payer, status,
               overall_reasoning as overallReasoning, reviewer,
               created_at as createdAt
        FROM   evaluations
        ORDER  BY created_at DESC
    `);
    return check from EvaluationRow r in evalStream select r;
}

function queryEvaluationById(string evalId) returns EvaluationRow|sql:NoRowsError|sql:Error {
    return dbClient->queryRow(`
        SELECT id, patient_id as patientId, patient_name as patientName,
               policy_id as policyId, cpt_code as cptCode,
               cpt_description as cptDescription, payer, status,
               overall_reasoning as overallReasoning, reviewer,
               created_at as createdAt
        FROM   evaluations
        WHERE  id = ${evalId}
    `);
}

function queryEvaluationGapCount(string evaluationId) returns int {
    int|sql:Error result = dbClient->queryRow(`
        SELECT COUNT(*) as cnt FROM evaluation_results
        WHERE evaluation_id = ${evaluationId}
        AND   status IN ('insufficient', 'needs_review')
    `);
    return result is int ? result : 0;
}

// ── Evaluation result queries ───────────────────────────────────────────────

function queryEvaluationResults(string evaluationId) returns EvaluationResultRow[]|error {
    stream<EvaluationResultRow, sql:Error?> resultStream = dbClient->query(`
        SELECT id, evaluation_id as evaluationId, clause_id as clauseId,
               clause_text as clauseText, status, confidence, reasoning,
               ai_augmented as aiAugmented, sort_order as sortOrder
        FROM   evaluation_results
        WHERE  evaluation_id = ${evaluationId}
        ORDER  BY sort_order
    `);
    return check from EvaluationResultRow r in resultStream select r;
}

function queryEvidenceByResultId(string resultId) returns EvaluationEvidenceRow[]|error {
    stream<EvaluationEvidenceRow, sql:Error?> evidenceStream = dbClient->query(`
        SELECT id, result_id as resultId, source, document_id as documentId,
               date, text, resource_type as resourceType
        FROM   evaluation_evidence
        WHERE  result_id = ${resultId}
    `);
    return check from EvaluationEvidenceRow e in evidenceStream select e;
}

// ── Composite builders ──────────────────────────────────────────────────────

function buildEvaluationDetailJson(EvaluationRow eval) returns json|error {
    EvaluationResultRow[] resultRows = check queryEvaluationResults(eval.id);

    json[] resultsJson = [];
    foreach EvaluationResultRow r in resultRows {
        EvaluationEvidenceRow[] evidenceRows = check queryEvidenceByResultId(r.id);

        json[] evidenceJson = [];
        foreach EvaluationEvidenceRow ev in evidenceRows {
            evidenceJson.push({
                "source": ev.'source,
                "document_id": ev.documentId,
                "date": ev.date,
                "text": ev.text,
                "resource_type": ev.resourceType
            });
        }

        resultsJson.push({
            "clause_id": r.clauseId,
            "clause_text": r.clauseText,
            "status": r.status,
            "confidence": r.confidence,
            "reasoning": r.reasoning,
            "ai_augmented": r.aiAugmented,
            "evidence": evidenceJson
        });
    }

    return {
        "id": eval.id,
        "patient_id": eval.patientId,
        "patient_name": eval.patientName,
        "policy_id": eval.policyId,
        "cpt_code": eval.cptCode,
        "cpt_description": eval.cptDescription,
        "payer": eval.payer,
        "status": eval.status,
        "overall_reasoning": eval.overallReasoning,
        "reviewer": eval.reviewer,
        "timestamp": eval.createdAt,
        "results": resultsJson
    };
}
