# TODO

- fhir-sync only mirrors ehr-fhir-server -> care-loop-fhir-server, so Task/RiskAssessment resources care-loop-analysis-service writes to ehr-fhir-server never reconcile back into care-loop-fhir-server.
- care-loop-ai-service's /risk-assessment (GPT_4_1) still occasionally cites a resource that doesn't quite support its own claim - worth trying a bigger/different model or an audit pass to close this out fully.
- Self-host rxnorm_mcp and fda_safety_mcp (from GoogleCloudPlatform/hcls-mcp-servers) and wire both into riskAssessmentAgent's tools alongside fhirToolkit, for drug classification/interactions and adverse-event grounding. Both are keyless.
- care-loop-collector-service only ever drafts a questionnaire on the emergency (ML-escalation) path - a patient who stays under threshold never gets checked in on at all. Add a daily cron that sends every monitored patient a routine, non-emergency questionnaire as a baseline touchpoint.
