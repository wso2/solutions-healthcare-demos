# EHR + Lab agentic integration

A longevity physician's journey that connects EHR history with lab biomarkers to catch risk early, built on
WSO2 integration technology:

- **Ballerina** services, with the official FHIR connector talking to the clinic's **EHR** and a reference lab (standing in for **Quest Diagnostics**), each its own FHIR R4 server; the lab simulator sends its specimens and results to the integration as **FHIR R4 messages** (to its `$process-message` operation, a FHIR service built on `health.fhirr4`), and both sides work in typed FHIR R4 resources (`health.fhir.r4`, `health.fhir.r4.international401`)
- one durable **Temporal workflow** per assessment (`ballerina/workflow`), whose waits on people are real **human tasks**
- **three Claude agents**, with read-only EHR access through the **WSO2 FHIR MCP server** and literature search through a **PubMed MCP server** (Ballerina, NCBI E-utilities)
- a **React portal**: a home page with the flow, and three apps that each open in their own tab — physician workspace (patient summary, EHR explorer, lab order, AI results analysis and release), patient app (optionally signing in with **SMART on FHIR** through **WSO2 API Manager** and the WSO2 Healthcare accelerator), and lab console (with the presenter's failure switches)
- realistic patient records generated with **Synthea**, with a curated storyline for the demo personas
- **WSO2 Agent Manager** governing the agents: an **AgentID** and **roles** per agent deciding which MCP tools it may call, Claude through the **AI gateway** with a key per agent and a **PHI-redaction guardrail**, every run **traced**, and **evaluation monitors** with built-in and custom evaluators — see [docs/agent-manager.md](docs/agent-manager.md)

The integration is the layer between the systems of record and the customer's own dashboards. It produces
the **Longevity Record**, the JSON that the physician and patient dashboards read.

```mermaid
flowchart LR
  subgraph SOR["Systems of record"]
    EHR[("EHR · FHIR R4<br/>wso2/fhir-server :8081")]
    LAB[("Lab · FHIR R4<br/>wso2/fhir-server :8082")]
  end
  TOX["Toxiproxy :8474<br/>outage switches"]
  subgraph INT["Integration · Ballerina :9090"]
    WF[["Temporal workflow<br/>human tasks + activities"]]
    AG["Agents<br/>Copilot · Analysis · Care Plan"]
  end
  MCP["FHIR MCP servers<br/>:8010 EHR · :8011 Lab"]
  SIM["Lab simulator :9093"]
  PG[("Postgres<br/>agent memory · read model")]
  UI["Demo portal :5173"]
  subgraph AMP["WSO2 Agent Manager · k3d amp-local"]
    GW["AI gateway<br/>/anthropic"]
    MP["MCP proxies<br/>AgentID + tool scopes"]
    OBS["Traces"]
  end
  TR["Trace router :4318"]
  CL(["Claude API"])

  UI -->|physician, patient and lab actions| WF
  WF -->|FHIR reads and writes| TOX
  TOX --> EHR
  WF --> LAB
  WF --> AG
  AG -->|search / read| MCP
  AG -->|Messages API, key per agent| GW
  GW --> CL
  AG -.->|AgentID token, optional| MP
  MP -.->|tunnel + gatekeeper| MCP
  AG -->|OTLP| TR
  TR -->|key per agent| OBS
  MCP --> TOX
  MCP --> LAB
  AG <--> PG
  SIM -->|specimens, results| LAB
  SIM -->|FHIR messages, via Toxiproxy| WF
  WF -->|longevity record| PG
  PG --> UI
```

## Run it

Everything runs in one **colima** VM: the demo's containers and the Agent Manager cluster. You need colima,
docker and docker-compose (`brew install colima docker docker-compose`) and an Anthropic API key.

```bash
cp secrets.example.toml secrets.toml        # then put your anthropicApiKey in it
./scripts/up.sh                              # creates the VM, builds, starts; first run loads seed/snapshot
./scripts/amp-install.sh                     # WSO2 Agent Manager 1.0.0 on k3d (~15–20 min, once)
./scripts/amp-gateway.sh                     # custom gateway with the mcp-fhir-deidentify policy (once)
./scripts/amp-setup.sh                       # agents, AgentIDs, roles, MCP proxies (tunnel, FHIR policy), model
                                             # configs + budgets per agent, traces
./scripts/amp-guardrails.sh --verify         # PHI redaction on the AI gateway, and proof of what Claude sees
./scripts/amp-evaluations.sh --backfill 24   # custom evaluators + a monitor per agent
```

`./scripts/up.sh --with-amp` does all of it. How it works and how to demo it: [docs/agent-manager.md](docs/agent-manager.md). Later runs of `up.sh` keep whatever data the demo has.

| URL | What |
|---|---|
| http://localhost:5173 | Demo portal home: the flow; opens the physician workspace, patient app and lab console in new tabs |
| http://localhost:8233 | Temporal UI: every assessment as a durable workflow |
| http://console.amp.localhost:8080 | WSO2 Agent Manager console (admin / admin) → project *Longevity Clinic* |
| http://localhost:9090/api/system | Integration API |
| http://localhost:9090/fhir/r4/Patient/{id}/$summary | Integration FHIR API: a patient's IPS (the lab posts its messages to `/fhir/r4/$process-message`) |
| http://localhost:8081/fhir/r4 · :8082 | EHR and lab FHIR servers |
| http://localhost:8474/proxies | Toxiproxy (what the outage switches change) |
| http://localhost:4318 | Trace router: traces forwarded per agent |
| https://localhost:9443/publisher · /devportal | WSO2 API Manager (admin / admin), only with [SMART mode](#patient-app-smart-on-fhir-through-wso2-api-manager) |
| https://localhost:8243/r4/.well-known/smart-configuration | SMART configuration on the APIM gateway |

| Script | What |
|---|---|
| `./scripts/up.sh [--restore\|--clean]` | Start. `--restore` reloads the saved demo state, `--clean` only the seed patients |
| `./scripts/snapshot.sh` | Save the current state as the seed (`seed/snapshot/`, checked for API keys) |
| `./scripts/reset.sh` | Clean slate: seed patients only, no assessments |
| `./scripts/smoke-test.sh [ehr] [patientId]` | One full assessment through the API (default Sofia Alvarez; real model calls) |
| `./scripts/colima-up.sh` | Start the VM (profile `agent-manager`, 6 CPU / 10 GB, vz + rosetta) |
| `./scripts/patient-app-mode.sh smart\|normal\|status` | Patient app with SMART on FHIR sign-in through APIM, or without sign-in (default) |
| `./scripts/apim-setup.sh [install\|start\|configure\|stop\|status]` | WSO2 API Manager 4.3.0 + Healthcare accelerator for SMART mode, on the Mac |

## The journey

| # | Step | Who | Workflow |
|---|---|---|---|
| 1 | Find the patient in the EHR and open them: **International Patient Summary** (allergy banner, problems, medications incl. patient-reported, vitals with trends, results, immunizations, procedures, social and family history, rule-based flags, care gaps), past assessments, **EHR explorer** | Physician | — |
| 2 | Start the assessment: record pulled from the patient's EHR, visit opened there | Integration | activities |
| 3 | Explore the record (data types, date range, text, abnormal only), order labs from the lab catalog (the AI evaluation is hidden in the portal: `SHOW_AI_EVALUATION` in `EvaluationPanel.tsx`) | Physician | ⏸ **human task** (physician) |
| 4 | Order of record in the EHR, patient matched in the lab by MRN, order to the lab, **patient notified** (FHIR `Communication`) | Integration | activities |
| 5 | Patient sees "visit the lab" with preparation instructions; lab console → **Collect specimen** | Patient → Lab | ⏸ **human task** (patient; completed by the lab) |
| 6 | Lab processes; lab console → **Release results**: the lab sends a FHIR message with the DiagnosticReport and its Observations (fallback poller reads them from the lab's FHIR server) | Lab | ⏸ system event |
| 7 | Results filed in the EHR → **Results Analysis** → **Care Plan** → draft note in the EHR (preliminary) — unattended | Agents | activities |
| 8 | Physician reviews and **releases**: note final, visit closed, report published, patient sees it | Physician | ⏸ **human task** (physician) |

## Demo script (about 15 minutes)

1. **Physician → Sofia Alvarez.** The patient summary is built live from the EHR over FHIR (12 searches in parallel, the EHR has no `$summary`); *View IPS bundle* shows the FHIR document. Point at the red allergy banner (aspirin, angioedema) and the first flag: *NSAID in use despite aspirin allergy* — a deterministic rule, because her ibuprofen is a patient-reported medication.
2. **EHR explorer.** Lab results + medications + notes, last 3 years → the FHIR queries are listed. Read a note ("taking ibuprofen 400 mg two to three times daily").
3. **Start the assessment and order labs.** The assessment starts (Temporal workflow); review the record beside the order form and pick the tests from the lab catalog (e.g. kidney function, metabolic panel, advanced lipids, liver panel).
4. **Temporal UI.** The workflow is suspended on a *human task* for the physician.
5. **Order labs.** Order of record in the EHR, order to Quest, patient notified. The workflow now waits on the **patient** — open the **patient app** (home page → Patient app, in its own tab): "Action needed: visit Quest Diagnostics", fasting instructions, order number. In [SMART mode](#patient-app-smart-on-fhir-through-wso2-api-manager), sign in as `sofia` / `Patient@123` on the APIM login page first, and open the SMART traffic panel to walk through discovery, authorize, token and the API calls.
6. **Simulate a crash** (lab console → Simulate failures → Crash). The integration restarts in seconds; the workflow is still waiting on the patient.
7. **Lab console → Collect specimen** → waiting on the **lab**. Optionally turn on *Lab webhook down* (lab console) first: the fallback poller completes the task ~20 s later.
8. **Release results.** The lab sends its report and observations as a FHIR message; they are filed in the EHR, then both agents run unattended. The analysis — headline, risk counts, then tabs for overview, risk flags, lab results, care plan, chart note and patient report — confirms early CKD with cystatin C, insulin resistance (HOMA-IR) and a metabolic liver pattern.
9. **Review & release.** The draft note becomes final in the EHR, the visit closes, the patient app shows the report.
10. **EHR outage** (any assessment, before an EHR write): turn on the *EHR outage* in the lab console, act (e.g. order labs). The step retries; leave it cut and the assessment pauses with **Retry / Stop** — turn the outage off and click **Retry**: it completes. Turn it off within ~45 s instead and the retry succeeds on its own.

11. **Agent Manager** (console only; the portal no longer shows governance). The console: the Copilot's traces (LLM calls, FHIR and PubMed tool calls, tokens), its monitor's scores, the `anthropic` provider with the PHI guardrail. Full script: [docs/agent-manager.md](docs/agent-manager.md#6-a-ten-minute-demo).

Other personas: **Daniel Reyes** — silent cardiometabolic drift, father's MI at 54, ApoB/Lp(a)/HOMA-IR story; **Priya Nair** — ferritin and hemoglobin falling under treated hypothyroidism, iron deficiency treated in 2019; **Marcus Bell** — healthy control.

## How it is built, and why

| Decision | Why |
|---|---|
| **The EHR and the lab, each its own FHIR server** | The pitch is "we are the layer between the EHR and the lab". Each holds its own patient ids; the patient is matched in the lab by MRN, and every write for an assessment goes back to the EHR. |
| **Generic `health.clients.fhir` connector** (`ehrSystems` config, one EHR) | Same pattern as pa-policy-analyzer. Pointing at a real tenant — or adding another EHR — is configuration: base URL, client credentials, MRN system, MCP URL. |
| **The lab speaks FHIR, and the integration reads it typed** (`fhir_api.bal`, `lab_messages.bal`, `lab_client.bal`) | The lab simulator notifies the integration with FHIR R4 message Bundles (a MessageHeader, then the Specimen or the DiagnosticReport and its Observations), POSTed to FHIR's `$process-message` operation. The integration serves it with the FHIR service type (`health.fhirr4`), which checks the request is FHIR before the code runs, answers with a response message, and reports errors as OperationOutcomes. Both sides build and read every resource as `health.fhir.r4` / `health.fhir.r4.international401` types, so a malformed resource fails the build or is refused at the door. |
| **One Temporal workflow per assessment** (`workflow.bal`) | The journey spans minutes (physician) to days (patient, lab). Temporal persists each step, so a waiting assessment survives restarts — the crash switch proves it. |
| **Waits on people are human tasks** (`awaitHumanTask`) | Physician order, patient lab visit and physician release each have an audience (role) and an audit trail of who completed them; the lab's "results ready" is a system event, so it stays a data event. |
| **Retry, then ask a person** (`RetryBeforeReview`) | A system of record down for seconds is retried automatically; down for longer, a review is raised so operations can retry or stop — the assessment does not fail. |
| **Every side effect is an activity** (`activities.bal`) | The workflow function only sequences steps and waits, so Temporal can replay it without calling an EHR, the lab or the model twice. |
| **Idempotent writes** | A retried activity runs again from the top. Encounter, orders, the notification and the note are created once per business identifier; filed results use `ifNoneExist`. |
| **FHIR end to end** (`fhir_utils.bal`, `clinical_digest.bal`, `demo-portal/src/lib/fhir.ts`) | Clinical data is FHIR R4 everywhere: the integration reads with the Ballerina FHIR library's parser (`parser:parse`, against each type's base profile) and writes with its serializers. The portal API returns FHIR (Patient search Bundles, the patient summary as an IPS document with the rule-based flags as DetectedIssue and care gaps as proposed ServiceRequests, the explorer's resources, the lab order, Communication, Specimen and filed results); the workflow carries the same FHIR JSON between steps; the lab console API returns the lab's FHIR resources. The portal derives what it shows from them in `lib/fhir.ts`. |
| **Deterministic patient summary (IPS sections)** (`summary.bal`, `ips.bal`) | The physician must see exactly what the EHR holds. Flags are named rules (drug–allergy cross-reactivity, trends, ranges, family history, BP, BMI, smoking). An IPS FHIR document is composed when the EHR has no `$summary`; FHIR clients get it from the integration's own `GET /fhir/r4/Patient/{id}/$summary` (a `health.fhirr4` service). |
| **EHR explorer filters in the EHR** (`explorer.bal`) | One FHIR search per data type with the EHR's own date parameters; active problems and medications older than the range are brought in by a second, status-filtered search. |
| **Three agents, not more** (`agents.bal`) | Copilot = reasoning before the order (with the physician, in conversation); Analysis and Care Plan = reasoning after the results. Analysis and Care Plan stay separate although they run back to back: different readers, and the Care Plan agent has no EHR access — it may only use what the analysis established. |
| **Copilot outside the workflow, agents after results inside it** | The Copilot is a conversation (Postgres memory, many turns); only the physician's resulting order is a durable step. Analysis and Care Plan are activities: retries, timeouts, crash recovery. |
| **FHIR MCP server per EHR, read-only** | The Copilot and the Analyst can look up anything the physician did not select, in the patient's own EHR. Only `search`, `read` and `get_capabilities`; EHRs are changed only by activities. |
| **Draft note until released** | The AI-written note is filed as `preliminary`; it becomes `final` and reaches the patient only after the physician's release. |
| **Real failures, not flags** (Toxiproxy) | Outage switches disable a proxy, so the FHIR connector gets real connection errors and the retries, reviews and fallback poller the audience sees are the production code paths. |
| **Workflow view from `ballerina/workflow`'s management API** (`workflow_view.bal`) | Activity tree, human tasks and reviews come from the library; live retry attempts come from Temporal's describe API. |
| **Agent Manager governs, the integration still runs the agents** (`agent_manager.bal`) | The agents stay Temporal activities; Agent Manager adds who they are (AgentID), what they may call (MCP tool scopes) and spend (gateway key per agent), and what they did (traces) — without moving them into its runtime. |
| **Trace router** (`infra/trace-router`) | One process, three agents, one exporter: the router files each agent run under its own agent, and drops non-agent traces (pollers, reads) rather than charging them to an agent. |
| **Synthea + storyline** (`seed/synthea/`) | Synthea gives every patient years of realistic, coded history (SNOMED CT, LOINC, RxNorm, CVX). The storyline overlay fixes the personas' trends, conditions, medications, allergies and notes so the agents find the same story every run. |

## WSO2 Agent Manager

`scripts/amp-install.sh` installs Agent Manager 1.0.0 as the k3d cluster `amp-local` in the same colima VM,
using AMP's own quick-start container (bash 5, k3d, kubectl, helm — nothing to install on the host).
`scripts/amp-setup.sh` then registers project **Longevity Clinic** with three externally hosted agents and
writes what they were issued into a generated block of `secrets.toml` (and `.amp/`, both gitignored):

| Feature | How it is wired |
|---|---|
| **Agent identity** | Each agent has an **AgentID** (OAuth client in the environment's ThunderID). The FHIR and PubMed MCP servers sit behind **MCP proxies** secured by AgentID, a scope per tool group. Roles: `ehr-reader` (FHIR read tools → Copilot, Analyst), `literature-searcher` (PubMed → all three), `ehr-writer` (FHIR writes → nobody). The integration's `McpToolKit` gets its token by client credentials with the proxy as `resource`. |
| **FHIR de-identification** | `mcp-fhir-deidentify`, a custom gateway policy (`gateway/policies/`, built in by `scripts/amp-gateway.sh`), on the FHIR MCP proxies: names, addresses, contact details and identifiers are removed, masked, pseudonymised or generalised in tool results, notes and billing are withheld, and searches by name, birth date or identifier are refused (rules: `amp/fhir-deidentify.json`). |
| **AI gateway** | LLM provider `anthropic` holds the Anthropic key. Each agent has its own model configuration (an LLM proxy with its own URL and key), so usage, limits and guardrails are per agent. |
| **Budgets and cost** | Per-agent US$/day and tokens/hour on each model configuration (`scripts/amp-budgets.sh`, `amp/budgets.json`); over budget the gateway refuses the agent and the workflow step waits for operations to retry. The trace router prices every run with the gateway's price list: spend per agent, assessment and workflow step in the portal. |
| **Monitoring** | `ballerina/ai` emits GenAI spans (`invoke_agent`, `chat`, `execute_tool`); `ballerina/otel` exports them to `infra/trace-router`, which forwards each agent run with that agent's tracing key (Agent Manager attributes a trace by key; one process hosts three agents). |

Without `amp-setup.sh` the agents call Claude and the FHIR MCP servers directly; the portal says so.

**MCP proxies and the tunnel.** Agent Manager 1.0.0 only accepts MCP upstreams that resolve to a public
address, so it cannot reach the FHIR MCP servers on the VM directly. `amp-setup.sh` therefore starts the
`amp-tunnel` compose profile: a Cloudflare quick tunnel (no account) to `infra/mcp-gatekeeper`, an nginx that
rejects every request without the `X-Tunnel-Key` only Agent Manager's proxy sends. The data is synthetic, but
the tunnel URL is public while it runs. `./scripts/amp-setup.sh --skip-mcp-proxies` leaves the agents on
direct MCP access (identity and traces still work).

**Workarounds for Agent Manager 1.0.0** (reported upstream): the host installer needs bash 4+ (macOS has
3.2), so the quick-start container is used; the gateway route caps requests at 30 s, so `amp-setup.sh` raises
it to 300 s for long Claude calls.

## Patient app: SMART on FHIR through WSO2 API Manager

The patient app runs in one of two modes, set by `"mode"` in `config/patient-auth.json`:

| Mode | Sign-in | API calls |
|---|---|---|
| `normal` (default) | none: the app lists every patient with an assessment | straight to the integration (`/api`) |
| `smart` | SMART on FHIR standalone launch: the patient signs in on the WSO2 API Manager login page and approves the scopes | through the APIM gateway with the patient's bearer token. The app shows only the token's patient. |

```bash
./scripts/patient-app-mode.sh smart     # needs the APIM setup below, once
./scripts/patient-app-mode.sh normal
./scripts/patient-app-mode.sh status
```

The portal reads the file on every page load. Nginx serves it in the container (`docker-compose.yml` mounts
it), and Vite serves it with `npm run dev`. A mode switch takes effect when you reload the patient app; you
don't need to rebuild or restart anything. `up.sh` creates the file from `config/patient-auth.example.json` if
it is missing. The app also falls back to `normal` if the file is missing or has no client ID.

### Set up WSO2 API Manager (once)

APIM runs on the Mac, beside the stack, and calls the integration at `http://localhost:9090/api`.

**You need:**
- the WSO2 API Manager 4.3.0 zip
- Java 11, 17 or 21 (tested with Temurin 21)
- these ports free: 9443, 9763, 8243, 8280, 9611, 9711 and **5672**. APIM's internal message broker uses
  5672, so stop a local RabbitMQ first: `brew services stop rabbitmq`.

The script downloads the [WSO2 Healthcare APIM Accelerator 2.0.0](https://github.com/wso2/healthcare-accelerator/releases/tag/v2.0.0)
itself.

```bash
APIM_ZIP=~/wso2/products/wso2am-4.3.0.zip ./scripts/apim-setup.sh   # install, start, configure (~5 min)
```

The script leaves the patient app in `smart` mode. Then:

1. **Trust APIM's self-signed certificate.** Open https://localhost:8243/r4/.well-known/smart-configuration
   and https://localhost:9443/devportal in the browser and accept the warning on each. Until you do, the
   browser blocks the app's calls to APIM, and the SMART traffic panel shows them as network errors.
2. **Sign in.** Open http://localhost:5173/patient and click **Sign in**. The app lists the patients
   registered in APIM with their usernames and passwords. Pick one, then type its credentials on the APIM
   login page and click **Allow** on the consent page.

| User | Patient | Password |
|---|---|---|
| `sofia` | Sofia Alvarez · `p-sofia-alvarez` | `Patient@123` |
| `daniel` | Daniel Reyes · `p-daniel-reyes` | `Patient@123` |
| `priya` | Priya Nair · `p-priya-nair` | `Patient@123` |
| `marcus` | Marcus Bell · `p-marcus-bell` | `Patient@123` |

A patient sees their own assessment once the physician has started one for them.

**Afterwards:**
- `./scripts/apim-setup.sh start`, `stop` and `status` start, stop and check APIM (log: `.apim/apim.log`).
- `configure` is idempotent, so run it again after changing a user or the integration URL. It keeps the
  application and its client ID.
- `rm -rf .apim` and re-running the script reinstalls APIM from scratch.

Environment overrides:
- `APIM_ZIP`
- `INTEGRATION_URL` (default `http://localhost:9090/api`)
- `PORTAL_ORIGIN` (default `http://localhost:5173`)
- `PATIENT_PASSWORD`

**What `apim-setup.sh` sets up**

| Step | What |
|---|---|
| install | Unzips APIM into `.apim/wso2am-4.3.0` (gitignored) and runs the accelerator's `merge.sh`. This adds the SMART well-known endpoint `/r4/.well-known/smart-configuration`, the FHIR metadata endpoint, the SMART scopes (`patient/*.r` → shared scope `patient-*.r` with role `patient-read`), the `patientId` claim and the Open Healthcare login theme. The script then fixes two things the merge leaves out on APIM 4.3 (below). |
| API | `HealthspanPatientApp`, at `https://localhost:8243/patient-app/1.0.0`, forwarding to the integration's `/api`. It has two OAuth2-secured GET resources, `/patient-app/patients` and `/ehrs/{ehr}/patients/{id}/journey`, each requiring `patient-*.r`. The definition carries `x-wso2-oh-fhir-resourceType: Patient`, so the accelerator maps SMART scopes onto it. |
| Users | One per demo persona, with the `patient-read` role. Each user's `patientId` claim holds the FHIR Patient id, which the accelerator returns as the token response's `patient`. |
| Application | `HealthspanPatientApp`: authorization code and refresh token grants, public client, PKCE S256 required, callback `http://localhost:5173/patient/callback`, subscribed to the API |
| Config | Writes `config/patient-auth.json` with the issuer, gateway, client ID, scopes, the users above, and `"mode": "smart"` |

**Fixes on top of the accelerator.** Without these, sign-in or the API calls fail:
- **Key validation handler.** `merge.sh` adds the accelerator's key validation handler only when
  `deployment.toml` has no `[apim.key_manager]` section, and APIM 4.3 ships one. Without the handler, the
  gateway can't match the token's `patient/*.r` to the resource scope `patient-*.r` and returns 403. The script
  sets `key_validation_handler_impl` itself.
- **CORS on the token endpoints.** The browser calls the key manager's `/oauth2/token` and `/oauth2/revoke`
  directly. APIM writes the `[cors]` settings but doesn't install the Tomcat CORS valve that applies them, so
  the script adds it through `[[catalina.valves]]`.

### The sign-in flow

The client is in `demo-portal/src/lib/smartAuth.ts`, and the sign-in screens are in `src/pages/PatientAuth.tsx`.

1. **Discover.** `GET {iss}/.well-known/smart-configuration` returns `authorization_endpoint`,
   `token_endpoint` and `revocation_endpoint`, all on the key manager at `:9443`.
2. **Authorize.** The browser goes to the authorization endpoint with:
   - `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`
   - `aud={iss}`
   - an S256 `code_challenge`
   - `prompt=login`, so APIM always shows its login page. APIM lists no `end_session_endpoint`, so its login
     session outlives **Sign out**.

   The default scopes are `openid fhirUser launch/patient patient/*.r`.
3. **Token.** `/patient/callback` checks `state`, then posts `grant_type=authorization_code`, the `code` and
   the `code_verifier` to the token endpoint. The response includes `patient`, and the ID token carries
   `fhirUser`. The session is kept for the browser tab only, and the refresh token renews the access token
   before it expires.
4. **Call the API.** The app sends `GET {apiBase}/patient-app/patients` and
   `GET {apiBase}/ehrs/{ehr}/patients/{id}/journey` with `Authorization: Bearer <token>`. A 401 ends the
   session. **Sign out** revokes the token.

**SMART traffic panel.** In SMART mode, the patient app's landing page has a collapsible panel on the right
(`src/components/SmartTracePanel.tsx`). It lists every request and response of these steps in order, each
as a collapsible item. Repeated identical API calls stay as one entry. The panel shows tokens in full, which
is meant for the demo. The APIM login and consent pages are not in it, because they happen outside the app.

### Configuration keys

`config/patient-auth.json` (gitignored; `apim-setup.sh` writes it):

| Key | Meaning |
|---|---|
| `mode` | `smart` or `normal` |
| `iss` | FHIR base URL on the gateway. The app discovers the endpoints from it and sends it as `aud`. |
| `apiBase` | The patient-app API on the gateway; it stands in for the integration's `/api` |
| `clientId` | Consumer key of the APIM application |
| `scope` | Scopes requested at the authorization endpoint |
| `redirectUri` | Must match the application's callback URL. Default `{portal origin}/patient/callback` |
| `demoUsers` | The users listed on the sign-in screen, with their passwords. For the demo only. |

### Known limitations

- **The integration doesn't enforce which patient a caller sees.** The app shows only the token's patient,
  but the integration would return another patient's journey to any valid token.
- **The backend never receives the patient ID.** The accelerator's backend JWT generator looks the user up by
  username. APIM 4.3 tokens identify the user by UUID, so the lookup fails and logs an error on every call.
- **The header shows the user's UUID instead of their name.** The ID token carries no name claim.
- **APIM's WebSub listener fails at startup.** `SecureWebhookServer` needs port 8443, which the Agent Manager
  cluster already uses. The error in the log is harmless.
- **Everything is local.** The certificates are self-signed and the passwords are demo passwords.

## Data

`seed/snapshot/` is the saved demo state — every FHIR store, the integration's database (assessments, agent
memory, longevity records) and Temporal's history — so finished assessments open with their workflow view.
`up.sh` loads it on the first run (`seed/restore-snapshot.sh`); `scripts/snapshot.sh` replaces it. The
images that wrote it are pinned by digest in `docker-compose.yml`.


`seed/ehr/` holds the EHR's committed transaction bundles (one per patient, plus the clinic's directory),
loaded by `seed/seed.sh`. They come from `seed/synthea/generate.sh`:

1. Synthea v4.0.0 (pinned, fixed seeds) generates 40 adults in each of two runs (Boston and Worcester, MA), for a varied population.
2. `transform.py` keeps the clinical record (8 years), drops billing, provenance and sensitive social-screening data, resolves Synthea's conditional references, rounds values to clinical precision, adds reference ranges, and picks the personas plus six other patients from each run — 16 patients in one EHR, sharing one MRN system.
3. `storyline.py` overlays each persona: identity, anchor visits with the trending labs and vitals, problems, medications (incl. history), allergies, family history and visit notes. Older Synthea results for the same tests are re-valued to lead into the story.

All patients are synthetic. Provider organizations and practitioners come from Synthea's public provider data.

## Project layout

```
ehr-lab-agents/
├── docker-compose.yml          all services
├── amp/                        Agent Manager evaluation config: evaluators/ (custom), monitors.json
├── docs/agent-manager.md       identity, AI gateway, guardrail, traces, evaluation — how and why
├── config/                     container configuration (no secrets); patient-auth.json: patient app mode + SMART settings
├── infra/                      Postgres, Toxiproxy, trace router, MCP gatekeeper, judge adapter
├── secrets.example.toml        copy to secrets.toml (gitignored)
├── seed/                       snapshot/ (saved state) · ehr/, lab-seed.json, seed.sh
│   └── synthea/                generate.sh · transform.py · storyline.py
├── ehr_lab_physician/          Ballerina workspace
│   ├── ehr_agentic_integration/   workflow, activities, agents, explorer, IPS, workflow view, API
│   ├── lab_simulator/             the reference lab's back office; notifies the integration with FHIR messages
│   └── pubmed_mcp/                PubMed MCP server (literature search tool)
├── demo-portal/                React + Vite + Tailwind
└── scripts/                    up · snapshot · reset · smoke-test · colima-up · amp-install · amp-setup ·
                                amp-gateway · amp-guardrails · amp-budgets · amp-evaluations · bal ·
                                apim-setup · patient-app-mode
(.apim/                         WSO2 API Manager + Healthcare accelerator, installed by apim-setup.sh; gitignored)
```

## Development

```bash
# Ballerina 2201.14.1 (or ./scripts/bal.sh <cmd> to use the Docker image instead)
cd ehr_lab_physician/ehr_agentic_integration
bal test                                     # unit tests need the compose stack running

# Portal with hot reload against the running stack (stop the portal container first)
docker compose stop portal
cd demo-portal && npm install && npm run dev

# Regenerate the seed data (needs Java 17+; downloads Synthea once into seed/synthea/.cache)
./seed/synthea/generate.sh && ./scripts/reset.sh
```

The integration's and the lab simulator's `Dependencies.toml` are committed and `sticky`. They pin
`ballerina/ftp` to 2.20.3: `health.clients.fhir` 3.0.6 needs `data.csv` 0.8.2, and the `ftp` bundled with
2201.14.1 needs `data.csv` 1.x. Without the pin, every rebuild after the first fails with "Incompatible
versions: ballerina/data.csv". Don't delete these files.

### Running the integration and lab simulator in WSO2 Integrator

To run or debug the two Ballerina services from WSO2 Integrator, use host mode. The integration and the
lab simulator then run on the Mac. Everything else stays in containers, including the PubMed MCP server.

```bash
./scripts/host-mode.sh on       # write each package's Config.toml, stop both containers, point the rest at the Mac
# Open ehr_lab_physician/ in WSO2 Integrator and run ehr_agentic_integration and lab_simulator,
# or run `bal run` in each package directory.
./scripts/host-mode.sh status
./scripts/host-mode.sh off      # back to everything in containers (stop the local runs first)
```

`host-mode.sh on` generates the gitignored `Config.toml` files from `config/integration.toml`,
`config/lab-simulator.toml` and `secrets.toml`, swapping each container address for a host port. After
`amp-setup.sh` or `amp-models.sh` changes those files, run `./scripts/host-mode.sh config`.

Host mode also sets `COMPOSE_FILE` in `.env`, so every `docker compose` command applies
[`docker-compose.host.yml`](docker-compose.host.yml) until host mode is switched off:

- The portal proxies `/api` and `/lab-api` to the Mac.
- EHR and lab-webhook traffic still goes through Toxiproxy, so the outage switches and webhook retries
  behave as they do in containers.
- The agents' OpenRouter calls reach Agent Manager through the LLM auth adapter, published on 127.0.0.1:8015.

Temporal holds the workflow state, so assessments that are already in flight carry on in whichever process
is running.

### Pointing at a real EHR

Edit its `[[ehrSystems]]` entry in `config/integration.toml`: `fhirBaseUrl`, `[ehrSystems.auth]` (token URL,
client id/secret, scopes) and `mrnSystem`. For its MCP server, set `FHIR_SERVER_BASE_URL` and the
`FHIR_SERVER_CLIENT_*` variables. The demo uses only standard FHIR R4 searches and writes.
