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

// ── Workflow session types ──

# Input to the durable longevity-assessment workflow: identifies the session and the
# placer-order id the workflow should wait for a lab result against.
type LabOrderInput record {
    string workflowId;
    string placerOrderId;
};

# Result of one Quest poll attempt (used by both the polling activity and the polling agent tool).
type LabPollOutcome record {
    boolean ready;
    string? reportId;
    string? status;
};

# Data event sent into the workflow once the polling agent confirms the lab result is ready.
type LabResultEvent record {
    string placerOrderId;
    string reportId;
    string status;
};

# Events a running longevity-assessment workflow instance waits on.
type LabResultEvents record {|
    future<LabResultEvent> labResultReady;
|};

# In-memory record of a workflow session's durability bookkeeping - tracks the underlying
# `ballerina/workflow` instance id and current polling stage for a given session id (workflowId).
# This sits alongside (and will later be backed by) the FHIR Task repository from a later phase.
type WorkflowSession record {
    string workflowId;
    string instanceId;
    string placerOrderId;
    string stage;
};
