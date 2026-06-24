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

## Pre-commit hooks

ruff runs on staged files at commit time. The config lives at
`hl7-ai-competition/.pre-commit-config.yaml`; install the hook pointing at it
once, from the fork root (needs `pre-commit`, e.g. `uv tool install pre-commit`):

```sh
pre-commit install -c hl7-ai-competition/.pre-commit-config.yaml
```
