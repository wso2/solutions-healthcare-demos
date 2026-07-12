# PA Policy Analyzer Evaluation Agent

AI-powered prior authorization evaluation agent for the PA Policy Analyzer demo. Built with [Ballerina](https://ballerina.io/) (Swan Lake 2201.13.1).

Evaluates a patient's clinical record from a Cerner FHIR R4 EMR against payer policy coverage clauses using Claude (Anthropic), producing per-clause results with supporting evidence.

## What it does

1. **Receives evaluation requests** -- Exposes an AI agent endpoint (`/GapEvalAgent`) that the BFF calls to kick off a prior-auth evaluation. The request carries a session ID tied to an existing evaluation row in MySQL.

2. **Fetches clinical data** -- Pulls the patient's medications, procedures, and observations from Cerner FHIR R4 and assembles a structured clinical summary.

3. **Loads policy clauses** -- Retrieves the hierarchical coverage clause tree for the target policy from MySQL and presents it to the agent.

4. **Clause-by-clause evaluation** -- The Claude-backed agent walks the clause tree, evaluating each leaf clause against the clinical summary. It respects AND/OR logic and exclusion semantics, recording a status (`satisfied`, `insufficient`, `needs_review`, `not_applicable`), confidence score, reasoning, and evidence for every clause.

5. **Finalizes the evaluation** -- After all clauses are evaluated, the agent sets an overall status (`approved`, `denied`, or `pending_review`) with reasoning and persists the result to MySQL.

## Prerequisites

- Ballerina Swan Lake 2201.13.1+
- MySQL 8+
- Access to a Cerner FHIR R4 sandbox (or production tenant)
- An Anthropic API key
- The companion BFF service (creates evaluation rows the agent reads)

## Setup

### 1. Database

The agent reads from and writes to the same `pa_policy_analyzer` MySQL database used by the BFF. Ensure the BFF has been run at least once (or the init script has been applied) so the required tables exist.

### 2. Configuration

Copy or edit `Config.toml` with your values:

```toml
# Cerner FHIR connection
base         = "https://fhir-ehr-code.cerner.com/r4/<tenant-id>"
tokenUrl     = "https://authorization.cerner.com/tenants/<tenant-id>/protocols/oauth2/profiles/smart-v1/token"
clientId     = "<client-id>"
clientSecret = "<client-secret>"
scopes       = ["system/Patient.read", "system/Observation.read", "system/MedicationRequest.read", "system/Procedure.read", "..."]

# MySQL
dbHost     = "localhost"
dbPort     = 3306
dbUser     = "root"
dbPassword = "<password>"
dbName     = "pa_policy_analyzer"

# Anthropic
ANTHROPIC_API_KEY = "<sk-ant-...>"
```

### 3. Run

```bash
bal run
```

The agent starts on the default HTTP listener and serves its endpoint at `/GapEvalAgent`.

## Agent tools

The evaluation agent has three tools available during its run:

| Tool | Description |
|------|-------------|
| `get_policy_clauses` | Loads the coverage clause tree for the evaluation's policy from MySQL |
| `record_clause_result` | Persists a per-clause evaluation result with evidence to MySQL |
| `finalize_evaluation` | Sets the overall evaluation status (`approved` / `denied` / `pending_review`) and reasoning |

## Project structure

```
eval_agent/
  main.bal            HTTP service definition (agent listener + chat endpoint)
  agents.bal          Agent configuration, system prompt, and tool implementations
  functions.bal       Async agent runner and error handling
  connections.bal     MySQL, Anthropic, and FHIR client initialization
  fhir_utils.bal      Clinical data fetching and FHIR bundle extraction
  policy_utils.bal    Clause tree builder for rendering policy hierarchies
  context_utils.bal   Thread-safe per-session evaluation context store
  types.bal           Record types for DB rows, clinical data, and evidence
  Config.toml         Runtime configuration values
  Ballerina.toml      Package metadata and dependencies
```
