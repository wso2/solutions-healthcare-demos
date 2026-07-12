import ballerina/log;
import ballerina/sql;

function initDb() returns error? {
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS onboarding_jobs (
            id            VARCHAR(64)  PRIMARY KEY,
            payer_name    VARCHAR(255) NOT NULL,
            plan_type     VARCHAR(100),
            service_url   VARCHAR(500),
            step_index    INT          DEFAULT 0,
            status        VARCHAR(50)  DEFAULT 'connecting',
            error_message TEXT,
            created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS onboarding_pdfs (
            id          VARCHAR(64)  PRIMARY KEY,
            job_id      VARCHAR(64)  NOT NULL,
            filename    VARCHAR(255) NOT NULL,
            size_bytes  BIGINT       DEFAULT 0,
            pdf_status  VARCHAR(50)  DEFAULT 'pending',
            local_path  VARCHAR(500),
            created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES onboarding_jobs(id)
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS policy_documents (
            id                  VARCHAR(64)  PRIMARY KEY,
            job_id              VARCHAR(64)  NOT NULL,
            pdf_id              VARCHAR(64)  NOT NULL,
            policy_name         VARCHAR(255),
            markdown_path       VARCHAR(500),
            medical_records_ref VARCHAR(255),
            created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES onboarding_jobs(id),
            FOREIGN KEY (pdf_id) REFERENCES onboarding_pdfs(id)
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS policy_sections (
            id           VARCHAR(64)  PRIMARY KEY,
            policy_id    VARCHAR(64)  NOT NULL,
            title        VARCHAR(500) NOT NULL,
            content      LONGTEXT,
            section_type VARCHAR(50)  DEFAULT 'other',
            sort_order   INT          DEFAULT 0,
            created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (policy_id) REFERENCES policy_documents(id)
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS coverage_clauses (
            id               VARCHAR(64)  PRIMARY KEY,
            policy_id        VARCHAR(64)  NOT NULL,
            parent_id        VARCHAR(64),
            clause_text      TEXT         NOT NULL,
            clause_type      VARCHAR(50)  DEFAULT 'condition',
            logical_operator VARCHAR(10),
            sort_order       INT          DEFAULT 0,
            is_editable      BOOLEAN      DEFAULT TRUE,
            created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (policy_id) REFERENCES policy_documents(id),
            FOREIGN KEY (parent_id) REFERENCES coverage_clauses(id)
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS policy_codes (
            id          VARCHAR(64)  PRIMARY KEY,
            policy_id   VARCHAR(64)  NOT NULL,
            code_type   VARCHAR(20)  NOT NULL,
            code        VARCHAR(20)  NOT NULL,
            description TEXT,
            created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (policy_id) REFERENCES policy_documents(id)
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS payers (
            id          VARCHAR(64)  PRIMARY KEY,
            name        VARCHAR(255) NOT NULL UNIQUE,
            status      VARCHAR(50)  DEFAULT 'active',
            created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS evaluations (
            id                VARCHAR(64)  PRIMARY KEY,
            patient_id        VARCHAR(64)  NOT NULL,
            patient_name      VARCHAR(255) NOT NULL,
            policy_id         VARCHAR(64)  NOT NULL,
            cpt_code          VARCHAR(20)  NOT NULL,
            cpt_description   VARCHAR(255),
            payer             VARCHAR(255) NOT NULL,
            status            VARCHAR(50)  DEFAULT 'in_progress',
            overall_reasoning TEXT,
            reviewer          VARCHAR(255),
            created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS evaluation_results (
            id              VARCHAR(64)  PRIMARY KEY,
            evaluation_id   VARCHAR(64)  NOT NULL,
            clause_id       VARCHAR(64)  NOT NULL,
            clause_text     TEXT,
            status          VARCHAR(50)  NOT NULL,
            confidence      DECIMAL(3,2) NOT NULL,
            reasoning       TEXT,
            ai_augmented    BOOLEAN      DEFAULT FALSE,
            sort_order      INT          DEFAULT 0,
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (evaluation_id) REFERENCES evaluations(id)
        )
    `);
    _ = check dbClient->execute(`
        CREATE TABLE IF NOT EXISTS evaluation_evidence (
            id              VARCHAR(64)  PRIMARY KEY,
            result_id       VARCHAR(64)  NOT NULL,
            source          VARCHAR(255) NOT NULL,
            document_id     VARCHAR(255),
            date            VARCHAR(50),
            text            TEXT,
            resource_type   VARCHAR(50)  NOT NULL,
            created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (result_id) REFERENCES evaluation_results(id)
        )
    `);
    log:printInfo("Database tables verified/created");
}

isolated function dbUpdateJobStatus(string jobId, string status, int stepIndex) returns error? {
    sql:ParameterizedQuery updateQuery = `
        UPDATE onboarding_jobs
        SET    status = ${status}, step_index = ${stepIndex}, updated_at = CURRENT_TIMESTAMP
        WHERE  id = ${jobId}
    `;
    _ = check dbClient->execute(updateQuery);
}

isolated function dbSetJobError(string jobId, string message) {
    sql:ParameterizedQuery updateQuery = `
        UPDATE onboarding_jobs
        SET    status = 'error', error_message = ${message}, updated_at = CURRENT_TIMESTAMP
        WHERE  id = ${jobId}
    `;
    sql:ExecutionResult|sql:Error result = dbClient->execute(updateQuery);
    if result is sql:Error {
        log:printError("Failed to persist error status for job " + jobId + ": " + result.message());
    }
}

isolated function dbUpdatePdfStatus(string pdfId, string status) returns error? {
    sql:ParameterizedQuery updateQuery = `
        UPDATE onboarding_pdfs
        SET    pdf_status = ${status}, updated_at = CURRENT_TIMESTAMP
        WHERE  id = ${pdfId}
    `;
    _ = check dbClient->execute(updateQuery);
}

isolated function dbSetPdfLocalPath(string pdfId, string localPath) returns error? {
    sql:ParameterizedQuery updateQuery = `
        UPDATE onboarding_pdfs
        SET    local_path = ${localPath}, updated_at = CURRENT_TIMESTAMP
        WHERE  id = ${pdfId}
    `;
    _ = check dbClient->execute(updateQuery);
}
