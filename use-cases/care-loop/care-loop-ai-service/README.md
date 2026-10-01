# care-loop-ai-service

Ballerina agent service (port 8003) that hosts the Care Loop's LLM-backed reasoning: drafting questionnaires, running the adaptive check-in, scoring risk, and narrating Tasks.

It uses either OpenAI (`GPT-4.1` / `GPT-4.1-nano`) or Anthropic (`Claude Sonnet 4.5` / `Claude Haiku 4.5`), with `ai:McpToolKit`s for FHIR, the knowledge base, and PubMed. Called by care-loop-collector-service and care-loop-analysis-service.

## Endpoints

- `POST /questionnaires` — drafts a FHIR `Questionnaire` from the patient's vitals trend.
- `POST /conversation/turn` — drives the live adaptive check-in one turn at a time.
- `POST /risk-assessment` — scores risk, grounding thresholds in the knowledge base and citing guideline sections.
- `POST /task-description` — narrates the Task.

## How LLM routing works

All LLM calls route only through the AMP AI gateway; there is no direct-provider mode. One uniform client (`AmpModelProvider`) always sends the OpenAI chat-completions wire format with the gateway's `API-Key` header. `modelProvider` (`openai` or `anthropic`) only selects the gateway route and model ids.

`careloop-anthropic` is registered under AMP's OpenAI-compatible template against Anthropic's OpenAI-compatible endpoint, so the same client reaches Claude. AMP is a required dependency. See the WSO2 Agent Manager section of the main README.

## Config

- In compose, `Config.compose.toml` is mounted as `Config.toml` and points the service URLs at the gateway. `docker-entrypoint.sh` injects the minted gateway keys from the `amp-shared` volume and refuses to boot without one.
- For a standalone run, copy `Config.toml.example` to `Config.toml` and fill in the gateway URLs and minted keys.
- `fhirMcpUrl`, `knowledgeMcpUrl`, and `pubmedMcpUrl` in the example already point at the compose service names; switch them to `localhost` when running with `bal run` on the host.

## Run locally

```sh
bal run
```

## Run with Docker

From the `use-cases/care-loop` root (docker stack):

```sh
make up        # build and start care-loop-ai-service on :8003
make ps        # show status
make down      # stop it
```
