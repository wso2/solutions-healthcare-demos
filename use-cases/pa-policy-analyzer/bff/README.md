# PA Policy Analyzer BFF

Backend-for-frontend service for the PA Policy Analyzer prior authorization demo. Built with [Ballerina](https://ballerina.io/) (Swan Lake 2201.13.1).

Connects a React frontend to a Cerner FHIR R4 EMR, a MySQL policy database, and an AI-powered evaluation agent to support end-to-end prior authorization workflows.

## What it does

1. **EMR integration** -- Proxies patient lookups, clinical resource queries, and binary document fetches to a Cerner FHIR R4 server using OAuth2 client credentials.

2. **Payer onboarding** -- Ingests payer policy PDFs from an external service, converts them to Markdown, and uses Claude (Anthropic) to extract structured coverage clauses and applicable billing codes (CPT / HCPCS / ICD-10) into MySQL.

3. **Policy & code lookup** -- Exposes payer, policy, clause, and code data for the frontend to browse and search.

4. **Prior-auth evaluations** -- Kicks off an AI agent that evaluates a patient's clinical record against policy clauses, storing per-clause results and supporting evidence.

## Prerequisites

- Ballerina Swan Lake 2201.13.1+
- MySQL 8+
- Access to a Cerner FHIR R4 sandbox (or production tenant)
- An Anthropic API key
- The companion PDF service running on port 6092
- The companion Markdown converter service running on port 6093

## Setup

### 1. Database

```bash
mysql -u root -p < scripts/init.sql
```

Tables are also auto-created on startup via `db.bal:initDb()`, so the script is optional.

### 2. Configuration

Copy or edit `Config.toml` with your values:

```toml
# Cerner FHIR connection
base       = "https://fhir-ehr-code.cerner.com/r4/<tenant-id>"
tokenUrl   = "https://authorization.cerner.com/tenants/<tenant-id>/protocols/oauth2/profiles/smart-v1/token"
clientId   = "<client-id>"
clientSecret = "<client-secret>"
scopes     = ["system/Patient.read", "system/Condition.read", "..."]

# MySQL
dbHost     = "localhost"
dbPort     = 3306
dbUser     = "root"
dbPassword = "<password>"
dbName     = "pa_policy_analyzer"

# Anthropic
ANTHROPIC_API_KEY = "<sk-ant-...>"

# Companion services
MOCK_PDF_SERVICE_BASE  = "http://localhost:6092"
CONVERTER_SERVICE_BASE = "http://localhost:6093/v1"
STORE_PATH             = "./data"

# Evaluation agent
agentServiceUrl = "http://localhost:9090//GapEvalAgent"
```

### 3. Run

```bash
bal run
```

The service starts on **port 6091** and serves all endpoints under `/v1`.

## API overview

### Patients (Cerner EMR proxy)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/patients` | List patients (map of id -> name) |
| GET | `/v1/patientById?id=` | Get full Patient resource by ID |
| GET | `/v1/searchPatients?name=&birthdate=` | Search patients by query params |
| GET | `/v1/patientSummary?id=` | Get patient summary |
| GET | `/v1/documentProxy?id=` | Fetch a Binary resource by ID |
| GET | `/v1/patientResources?id=&resourceType=` | Fetch clinical resources (Condition, MedicationRequest, etc.) for a patient |

### Payer onboarding

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/payer/onboard` | Start onboarding (body: `{payerName, serviceUrl, apiKey}`) |
| GET | `/v1/payer/onboard/{jobId}/status` | Poll onboarding job status |
| POST | `/v1/payer/{payerId}/resync` | Re-run onboarding for an existing payer |

### Payers, policies & codes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/payers` | List active payers with policy/code counts |
| GET | `/v1/payers/{payerId}/codes?type=` | Codes for a payer, optionally filtered by type |
| GET | `/v1/payers/{payerId}/policies` | Policies for a payer |
| GET | `/v1/payer/codes?type=` | All codes, optionally filtered by type |
| GET | `/v1/payer/codes/{code}/policy` | Look up a code and its parent policy + clauses |
| GET | `/v1/payer/policy/{policyId}/clauses` | Coverage clauses for a policy |

### Evaluations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/evaluations` | Start an evaluation (body: `{patientId, patientName, policyId, cptCode, cptDescription, payer}`) |
| GET | `/v1/evaluations` | List all evaluations |
| GET | `/v1/evaluations/{evalId}` | Get evaluation detail with per-clause results and evidence |

## Policy parsing and clause extraction

When a payer policy PDF is onboarded, the system converts it to Markdown and then extracts structured data in two passes: **coverage clauses** and **applicable codes**. The primary extraction path uses Claude (Anthropic); a deterministic manual parser serves as a fallback if the LLM call fails.

### Document sectioning

The Markdown is first split into major sections by scanning for known heading titles defined in `MAJOR_SECTION_TITLES` (e.g. "Coverage Rationale", "Applicable Codes", "Definitions"). If none of those titles match the document, the first 3 000 characters are sent to the LLM to extract a table of contents, and the returned titles are used instead.

Each section is classified as one of:

| `section_type` | Meaning |
|---|---|
| `coverage_rationale` | Contains the conditions under which a treatment is covered or excluded |
| `applicable_codes` | Contains CPT / HCPCS / ICD-10 billing code tables |
| `medical_records` | Lists required medical record documentation |
| `other` | Everything else (background, definitions, references, etc.) |

Sections are stored in the `policy_sections` table, preserving their document order via `sort_order`.

### Clause data model

Coverage clauses are stored in the `coverage_clauses` table as a **self-referencing tree** (adjacency list). Each row has:

| Column | Description |
|---|---|
| `id` | UUID primary key |
| `policy_id` | FK to the parent `policy_documents` row |
| `parent_id` | FK to the parent clause (nullable -- `NULL` for root-level clauses) |
| `clause_text` | The cleaned text of the clause |
| `clause_type` | One of `group`, `requirement`, `exclusion`, or `condition` |
| `logical_operator` | `AND` (all/both of the following), `OR` (one of the following), or `NULL` |
| `sort_order` | Insertion order, preserving the document sequence |
| `is_editable` | Whether the clause can be modified by users (default `TRUE`) |

**Clause types explained:**

- **`group`** -- Introduces a list of child clauses (e.g. "all of the following criteria are met").
- **`requirement`** -- States something is "proven and medically necessary".
- **`exclusion`** -- States something is "unproven and not medically necessary".
- **`condition`** -- Any other individual criterion.

A `group` clause's `logical_operator` determines how its children combine: `AND` means every child must be satisfied; `OR` means at least one.

### LLM extraction procedure

**Coverage Rationale** is processed as follows:

1. The section text is split into chunks at each root-level bold line (lines starting with `**`), so each chunk begins with a top-level coverage determination.
2. Each chunk is sent to Claude with a prompt that requests a flat, ordered list of clauses with a `depth` field (0 = root, 1 = first-level sub-clause, etc.).
3. The returned clauses are inserted into `coverage_clauses` using a depth stack to reconstruct parent-child relationships: as each clause arrives, the stack is popped until a clause with a shallower depth is found, which becomes the parent.

**Applicable Codes** is processed as follows:

1. The section text is split by code-type headers (`CPT Code`, `HCPCS Code`, `Diagnosis Code` / `ICD-10`).
2. Each sub-section is sent to Claude with a prompt that requests structured `{code_type, code, description}` entries.
3. The returned codes are inserted into `policy_codes`.

### Manual fallback parsers

If LLM extraction fails, deterministic parsers take over:

- **Clauses:** Lines are scanned for bullet dashes (`- `). Indentation depth determines nesting. Bold/italic lines without bullets are treated as root clauses. Clause type and logical operators are detected by keyword matching (e.g. "all of the following" -> `group` + `AND`).
- **Codes:** Markdown table rows (`| code | description |`) are split by pipe characters. The current code type is tracked by scanning for header rows containing "CPT Code", "HCPCS Code", or "Diagnosis Code".

Both paths produce the same schema in `coverage_clauses` and `policy_codes`.

## Project structure

```
bff/
  service.bal          HTTP resource definitions (the API surface)
  Config.bal           Configurable variables and constants
  Config.toml          Runtime configuration values
  connections.bal      MySQL, Anthropic, and FHIR client initialization
  db.bal               Table DDL and low-level DB helpers
  types.bal            Record types for DB rows and LLM responses
  payer_onboarding.bal Async onboarding pipeline (connect -> scan -> fetch -> convert)
  policy_parser.bal    LLM + manual fallback parsing of policy markdown into clauses/codes
  payer_utils.bal      HTTP helpers and payer/policy/code query functions
  eval_utils.bal       Evaluation query and JSON builder functions
  agents.bal           Agent invocation for prior-auth evaluations
  scripts/init.sql     Database bootstrap script
  data/                Runtime storage for downloaded PDFs and converted Markdown
```
