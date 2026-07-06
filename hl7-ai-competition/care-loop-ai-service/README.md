# care-loop-ai-service

Standalone Ballerina agent (port 8003). `POST /questionnaires {patientId}`
runs an `ai:Agent` wired to fhir-mcp-server via `ai:McpToolKit`: it calls the
MCP `search` tool itself to pull that patient's Observations, then drafts a
FHIR `Questionnaire` (questions only, no answers) targeted at the vitals
trend. Not wired into the rest of the loop yet - standalone component for now.

## Config

Copy `Config.toml.example` to `Config.toml` (gitignored) and fill in the
`[ballerina.ai.wso2ProviderConfig]` `serviceUrl`/`accessToken` for
`ballerina/ai`'s built-in `Wso2ModelProvider`. docker-compose mounts
`Config.toml` into the container, so this file must exist before
`make up`/`docker compose up` will start this service.

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
