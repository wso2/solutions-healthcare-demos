-- PA Policy Analyzer demo database bootstrap
-- Run once: mysql -u root -p < init.sql

CREATE DATABASE IF NOT EXISTS pa_policy_analyzer;
USE pa_policy_analyzer;

CREATE TABLE IF NOT EXISTS onboarding_jobs (
    id            VARCHAR(64)  PRIMARY KEY,
    payer_name    VARCHAR(255) NOT NULL,
    plan_type     VARCHAR(100),
    service_url   VARCHAR(500),
    step_index    INT          DEFAULT 0,
    status        VARCHAR(50)  DEFAULT 'connecting',
    -- status values: connecting | authenticating | scanning | fetching | converting | done | error
    error_message TEXT,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_pdfs (
    id          VARCHAR(64)  PRIMARY KEY,
    job_id      VARCHAR(64)  NOT NULL,
    filename    VARCHAR(255) NOT NULL,
    size_bytes  BIGINT       DEFAULT 0,
    pdf_status  VARCHAR(50)  DEFAULT 'pending',
    -- pdf_status values: pending | downloading | downloaded | converting | done | error
    local_path  VARCHAR(500),
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (job_id) REFERENCES onboarding_jobs(id)
);

-- ── Policy extraction tables ─────────────────────────────────────────────────

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
);

CREATE TABLE IF NOT EXISTS policy_sections (
    id           VARCHAR(64)  PRIMARY KEY,
    policy_id    VARCHAR(64)  NOT NULL,
    title        VARCHAR(500) NOT NULL,
    content      LONGTEXT,
    section_type VARCHAR(50)  DEFAULT 'other',
    -- section_type values: coverage_rationale | medical_records | applicable_codes | other
    sort_order   INT          DEFAULT 0,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (policy_id) REFERENCES policy_documents(id)
);

CREATE TABLE IF NOT EXISTS coverage_clauses (
    id               VARCHAR(64)  PRIMARY KEY,
    policy_id        VARCHAR(64)  NOT NULL,
    parent_id        VARCHAR(64),
    clause_text      TEXT         NOT NULL,
    clause_type      VARCHAR(50)  DEFAULT 'condition',
    -- clause_type values: requirement | exclusion | group | condition
    logical_operator VARCHAR(10),
    -- logical_operator values: AND | OR | NULL (leaf nodes)
    sort_order       INT          DEFAULT 0,
    is_editable      BOOLEAN      DEFAULT TRUE,
    created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (policy_id) REFERENCES policy_documents(id),
    FOREIGN KEY (parent_id) REFERENCES coverage_clauses(id)
);

CREATE TABLE IF NOT EXISTS payers (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    status      VARCHAR(50)  DEFAULT 'active',
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policy_codes (
    id          VARCHAR(64)  PRIMARY KEY,
    policy_id   VARCHAR(64)  NOT NULL,
    code_type   VARCHAR(20)  NOT NULL,
    -- code_type values: CPT | HCPCS | ICD10
    code        VARCHAR(20)  NOT NULL,
    description TEXT,
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (policy_id) REFERENCES policy_documents(id)
);

-- ── Evaluation tables ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS evaluations (
    id                VARCHAR(64)  PRIMARY KEY,
    patient_id        VARCHAR(64)  NOT NULL,
    patient_name      VARCHAR(255) NOT NULL,
    policy_id         VARCHAR(64)  NOT NULL,
    cpt_code          VARCHAR(20)  NOT NULL,
    cpt_description   VARCHAR(255),
    payer             VARCHAR(255) NOT NULL,
    status            VARCHAR(50)  DEFAULT 'in_progress',
    -- status values: in_progress | approved | denied | pending_review
    overall_reasoning TEXT,
    reviewer          VARCHAR(255),
    created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS evaluation_results (
    id              VARCHAR(64)  PRIMARY KEY,
    evaluation_id   VARCHAR(64)  NOT NULL,
    clause_id       VARCHAR(64)  NOT NULL,
    clause_text     TEXT,
    status          VARCHAR(50)  NOT NULL,
    -- status values: satisfied | insufficient | needs_review | not_applicable
    confidence      DECIMAL(3,2) NOT NULL,
    reasoning       TEXT,
    ai_augmented    BOOLEAN      DEFAULT FALSE,
    sort_order      INT          DEFAULT 0,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (evaluation_id) REFERENCES evaluations(id)
);

CREATE TABLE IF NOT EXISTS evaluation_evidence (
    id              VARCHAR(64)  PRIMARY KEY,
    result_id       VARCHAR(64)  NOT NULL,
    source          VARCHAR(255) NOT NULL,
    document_id     VARCHAR(255),
    date            VARCHAR(50),
    text            TEXT,
    resource_type   VARCHAR(50)  NOT NULL,
    -- resource_type values: Condition | Procedure | MedicationRequest | Observation | DocumentReference | ImagingStudy
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_id) REFERENCES evaluation_results(id)
);
