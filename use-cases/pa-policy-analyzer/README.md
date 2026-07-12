# PA Policy Analyzer

End-to-end prior authorization demo that connects a clinical frontend to a Cerner FHIR R4 EMR, a payer policy engine, and an AI-powered evaluation agent.

A user can browse patient records, onboard payer coverage policies from PDFs, and run AI evaluations that match a patient's clinical evidence against policy clauses -- producing per-clause results with confidence scores, reasoning, and supporting evidence.

| Component | Stack | Description |
|-----------|-------|-------------|
| [demo-policy-analyzer-app](demo-policy-analyzer-app/) | React 19, TypeScript, Oxygen UI | Clinical workspace -- patient browser, policy viewer, evaluation wizard |
| [bff](bff/) | Ballerina Swan Lake 2201.13.3 | Backend-for-frontend -- EMR proxy, payer onboarding pipeline, policy/code lookup, evaluation orchestration |
| [pa-eval-agent](pa-eval-agent/) | Ballerina Swan Lake 2201.13.3 | AI agent that evaluates patient clinical data against policy clauses using Claude |
| [pdf-md-service](pdf-md-service/) | Python | PDF-to-Markdown conversion service used by the payer onboarding pipeline |
| [mock-policy-document-service](mock-policy-document-service/) | Ballerina Swan Lake 2201.13.1 | Mock HTTP service that serves payer policy PDFs for the onboarding pipeline. In a real deployment this would be configured against the actual payer document APIs -- here it stands in as a stub for the demo. |

## Prerequisites

- **Node.js** 20+
- **Ballerina** Swan Lake 2201.13.1+
- **MySQL** 8+
- Access to a **Cerner FHIR R4** sandbox (or production tenant)
- An **Anthropic API key**

## Quick start

### 1. Database (Optional)

```bash
mysql -u root -p < bff/scripts/init.sql
```

Tables are also auto-created on BFF startup, so the script is optional.

### 2. Configuration

Each Ballerina service has its own `Config.toml`. At minimum you need to set:

- Cerner FHIR credentials (`base`, `tokenUrl`, `clientId`, `clientSecret`, `scopes`)
- MySQL connection (`dbHost`, `dbPort`, `dbUser`, `dbPassword`, `dbName`)
- Anthropic API key (`ANTHROPIC_API_KEY`)

See [bff/README.md](bff/README.md) and [pa-eval-agent/README.md](pa-eval-agent/README.md) for full configuration reference.

### 3. Start services

```bash
# Terminal 1 -- BFF (port 6091)
cd bff && bal run

# Terminal 2 -- Eval Agent (default listener)
cd pa-eval-agent && bal run

# Terminal 3 -- Frontend (port 5173)
cd demo-policy-analyzer-app && npm install && npm run dev
```

Open **http://localhost:5173** to access the UI. API calls are proxied to the BFF at `localhost:6091`.

## Key workflows

### Patient browsing

Split-pane patient browser backed by Cerner FHIR R4. View clinical resources (conditions, medications, procedures, documents, coverage) per patient.

### Payer onboarding

Upload a payer's policy PDFs. The BFF pipeline fetches, converts to Markdown, and uses Claude to extract structured coverage clauses and billing codes (CPT / HCPCS / ICD-10) into MySQL.

### Prior-auth evaluation

Select a patient, payer, and CPT code. The BFF kicks off the eval agent, which:

1. Fetches the patient's clinical data from Cerner FHIR
2. Loads the policy's coverage clause tree from MySQL
3. Evaluates each clause against the clinical summary using Claude
4. Records per-clause status (`satisfied`, `insufficient`, `needs_review`, `not_applicable`), confidence, reasoning, and evidence
5. Finalizes with an overall status (`approved`, `denied`, `pending_review`)
