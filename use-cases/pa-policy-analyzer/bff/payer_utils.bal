import ballerina/sql;
import ballerina/http;

// ── Helper: build standardised HTTP error responses ─────────────────────────

function notFoundResponse(string message) returns http:Response {
    http:Response res = new;
    res.statusCode = 404;
    res.setJsonPayload({"error": message});
    return res;
}

function internalErrorResponse(string message) returns http:Response {
    http:Response res = new;
    res.statusCode = 500;
    res.setJsonPayload({"error": message});
    return res;
}

// ── Policy-code queries ─────────────────────────────────────────────────────

function queryPolicyCodes(string? codeType) returns PolicyCodeRow[]|error {
    stream<PolicyCodeRow, sql:Error?> codeStream;
    if codeType is string {
        codeStream = dbClient->query(`
            SELECT id, policy_id as policyId, code_type as codeType,
                   code, description
            FROM   policy_codes
            WHERE  code_type = ${codeType}
            ORDER  BY code
        `);
    } else {
        codeStream = dbClient->query(`
            SELECT id, policy_id as policyId, code_type as codeType,
                   code, description
            FROM   policy_codes
            ORDER  BY code_type, code
        `);
    }
    return check from PolicyCodeRow r in codeStream select r;
}

function queryCodeByValue(string code) returns PolicyCodeRow|sql:NoRowsError|sql:Error {
    return dbClient->queryRow(`
        SELECT id, policy_id as policyId, code_type as codeType,
               code, description
        FROM   policy_codes
        WHERE  code = ${code}
        LIMIT  1
    `);
}

// ── Policy-document queries ─────────────────────────────────────────────────

function queryPolicyById(string policyId) returns PolicyDocRow|sql:Error {
    return dbClient->queryRow(`
        SELECT id, job_id as jobId, pdf_id as pdfId,
               policy_name as policyName, markdown_path as markdownPath,
               medical_records_ref as medicalRecordsRef
        FROM   policy_documents
        WHERE  id = ${policyId}
    `);
}

// ── Coverage-clause queries ─────────────────────────────────────────────────

function queryClausesByPolicyId(string policyId) returns CoverageClauseRow[]|error {
    stream<CoverageClauseRow, sql:Error?> clauseStream = dbClient->query(`
        SELECT id, policy_id as policyId, parent_id as parentId,
               clause_text as clauseText, clause_type as clauseType,
               logical_operator as logicalOperator, sort_order as sortOrder,
               is_editable as isEditable
        FROM   coverage_clauses
        WHERE  policy_id = ${policyId}
        ORDER  BY sort_order
    `);
    return check from CoverageClauseRow c in clauseStream select c;
}

// ── Related codes for a policy ──────────────────────────────────────────────

function queryCodesByPolicyId(string policyId) returns PolicyCodeRow[]|error {
    stream<PolicyCodeRow, sql:Error?> codeStream = dbClient->query(`
        SELECT id, policy_id as policyId, code_type as codeType,
               code, description
        FROM   policy_codes
        WHERE  policy_id = ${policyId}
        ORDER  BY code_type, code
    `);
    return check from PolicyCodeRow r in codeStream select r;
}

// ── Payer queries ───────────────────────────────────────────────────────────

function queryActivePayers() returns PayerRow[]|error {
    stream<PayerRow, sql:Error?> payerStream = dbClient->query(`
        SELECT id, name, status FROM payers WHERE status = 'active' ORDER BY name
    `);
    return check from PayerRow r in payerStream select r;
}

function queryPayerById(string payerId) returns PayerRow|sql:Error {
    return dbClient->queryRow(`
        SELECT id, name, status FROM payers WHERE id = ${payerId}
    `);
}

function queryPayerPolicyCount(string payerName) returns int {
    int|sql:Error result = dbClient->queryRow(`
        SELECT COUNT(*) as cnt FROM policy_documents pd
        JOIN onboarding_jobs oj ON pd.job_id = oj.id
        WHERE oj.payer_name = ${payerName}
    `);
    return result is int ? result : 0;
}

function queryPayerCodeCount(string payerName) returns int {
    int|sql:Error result = dbClient->queryRow(`
        SELECT COUNT(*) as cnt FROM policy_codes pc
        JOIN policy_documents pd ON pc.policy_id = pd.id
        JOIN onboarding_jobs oj ON pd.job_id = oj.id
        WHERE oj.payer_name = ${payerName}
    `);
    return result is int ? result : 0;
}

// ── Payer-scoped code queries ───────────────────────────────────────────────

function queryCodesByPayerName(string payerName, string? codeType) returns PolicyCodeRow[]|error {
    stream<PolicyCodeRow, sql:Error?> codeStream;
    if codeType is string {
        codeStream = dbClient->query(`
            SELECT pc.id, pc.policy_id as policyId, pc.code_type as codeType,
                   pc.code, pc.description
            FROM   policy_codes pc
            JOIN   policy_documents pd ON pc.policy_id = pd.id
            JOIN   onboarding_jobs oj ON pd.job_id = oj.id
            WHERE  oj.payer_name = ${payerName}
            AND    pc.code_type = ${codeType}
            ORDER  BY pc.code
        `);
    } else {
        codeStream = dbClient->query(`
            SELECT pc.id, pc.policy_id as policyId, pc.code_type as codeType,
                   pc.code, pc.description
            FROM   policy_codes pc
            JOIN   policy_documents pd ON pc.policy_id = pd.id
            JOIN   onboarding_jobs oj ON pd.job_id = oj.id
            WHERE  oj.payer_name = ${payerName}
            ORDER  BY pc.code_type, pc.code
        `);
    }
    return check from PolicyCodeRow r in codeStream select r;
}

// ── Payer-scoped policy queries ─────────────────────────────────────────────

function queryPoliciesByPayerName(string payerName) returns PolicyDocRow[]|error {
    stream<PolicyDocRow, sql:Error?> policyStream = dbClient->query(`
        SELECT pd.id, pd.job_id as jobId, pd.pdf_id as pdfId,
               pd.policy_name as policyName, pd.markdown_path as markdownPath,
               pd.medical_records_ref as medicalRecordsRef
        FROM   policy_documents pd
        JOIN   onboarding_jobs oj ON pd.job_id = oj.id
        WHERE  oj.payer_name = ${payerName}
        ORDER  BY pd.policy_name
    `);
    return check from PolicyDocRow p in policyStream select p;
}
