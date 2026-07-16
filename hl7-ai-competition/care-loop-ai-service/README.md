# care-loop-ai-service

Standalone Ballerina agent (port 8003). `POST /questionnaires {patientId}`
runs an `ai:Agent` wired to fhir-mcp-server via `ai:McpToolKit`: it calls the
MCP `search` tool itself to pull that patient's Observations, then drafts a
FHIR `Questionnaire` (questions only, no answers) targeted at the vitals
trend. Not wired into the rest of the loop yet - standalone component for now.

## Config

Copy `Config.toml.example` to `Config.toml` (gitignored), set
`modelProvider` to either `openai` or `anthropic`, and fill in the matching
API key. docker-compose mounts `Config.toml` into the container, so this file
must exist before `make up`/`docker compose up` will start this service.

When running through docker-compose, set `CARE_LOOP_AI_PROVIDER` to choose the
provider used by the stack:

```sh
CARE_LOOP_AI_PROVIDER=anthropic docker compose up care-loop-ai-service
```

`fhirMcpUrl` in the example already points at the `fhir-mcp-server` compose
service name; switch it back to `localhost` if running with `bal run` on the
host instead.

## Run locally

```sh
bal run
```

## Run with Docker

From the `hl7-ai-competition` root (docker stack):

```sh
make up        # build and start care-loop-ai-service on :8003
make ps        # show status
make down      # stop it
```
