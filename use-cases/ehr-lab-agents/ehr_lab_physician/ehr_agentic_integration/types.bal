// FHIR R4 types for the Longevity Care Workflow API are sourced directly from the
// official Ballerina FHIR libraries instead of being hand-rolled:
//   - ballerinax/health.fhir.r4               -> generic data types, Bundle, Parameters, OperationOutcome
//   - ballerinax/health.fhir.r4.international401 -> clinical resources (Patient, Encounter, Task, ...)
// See connections.bal, data_mappings.bal and main.bal for their usage (aliased `r4` / `international401`).

// Internal (non-FHIR-spec) types used only inside this integration.

# Narrative text produced for each Composition section by the rule-based Summary agent.
type SummaryNarratives record {
    string overview;
    string encounters;
    string conditions;
    string biomarkers;
    string diagnosticReports;
};
