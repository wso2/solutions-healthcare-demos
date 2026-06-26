# WSO2 Care Loop

An AI-assisted care loop connecting remote patients with a heart clinic, built
for the HL7 AI competition. Patient-side home monitoring and messaging feed an
agent-driven engine that converts incoming data to FHIR, predicts risk, and
routes clinical notifications and telehealth back to the care team. Integrations
run on Ballerina.

## Architecture

![WSO2 Care Loop architecture](assets/architecture-diagram-v2.png)

Earlier stages: [v1](assets/architecture-diagram-v1.png),
[whiteboard sketch](assets/whiteboard-sketch.png).

## Components

- [apple-healthkit-simulator](apple-healthkit-simulator/) — FastAPI service that
  ingests Apple HealthKit samples (port 8000).
- [whatsapp-simulator](whatsapp-simulator/) — Next.js chat UI that renders a
  pushed questionnaire and posts the conversation transcript to a callback URL
  (port 3000).
- OpenEMR — open-source EHR run from the official `openemr/openemr` image with a
  MySQL sidecar (internal only). Web UI on port 3001 (default login
  `admin` / `pass`). First boot seeds the database and takes a few minutes.
- fhir-mcp-server — WSO2 FHIR R4 to MCP bridge (`wso2/fhir-mcp-server`) in front
  of OpenEMR, exposing the FHIR API as MCP tools on port 8001.

Run the stack with `make up`, or `make watch` to run it in the foreground and
rebuild on change.

`make up` also runs `scripts/bootstrap-fhir.sh`, which registers and enables an OpenEMR
OAuth2 client, mints an access token, and writes it to `.fhir.env` (gitignored)
for the bridge. The bridge starts under the `fhir` compose profile once the
token exists. Re-run `make fhir` to mint a new token. The bridge reaches OpenEMR
over the internal Docker network in plain HTTP, since OpenEMR's FHIR endpoint
uses a self-signed cert the client will not trust; the OAuth2 token is still
required. Static-token mode is demo-grade; production should use the SMART
authorization-code grant instead.

## Pre-commit hooks

ruff (apple-healthkit-simulator) and biome plus knip (whatsapp-simulator) run on
staged files at commit time. The config lives at
`hl7-ai-competition/.pre-commit-config.yaml`; install the hook pointing at it
once, from the fork root (needs `pre-commit`, e.g. `uv tool install pre-commit`;
the whatsapp-simulator hooks also need `bun`):

```sh
pre-commit install -c hl7-ai-competition/.pre-commit-config.yaml
```
