// The real, distinct event labels our backend services fire, in pipeline order - keep in sync with the notifyDashboard/reportDashboardEvent call sites in each service.
export const STAGE_DEFS = [
  {
    key: "vitals",
    label: "Vitals ingested",
    service: "care-loop-collector-service",
    method: "POST",
    endpoint: "/vitals",
  },
  {
    key: "ml",
    label: "ML risk scoring complete",
    service: "care-loop-analysis-service",
    method: "POST",
    endpoint: "/predict (via care-loop-heart-risk-service)",
  },
  {
    key: "escalation",
    label: "Escalation triggered",
    service: "care-loop-analysis-service",
    method: "—",
    endpoint: "internal decision",
  },
  {
    key: "quest",
    label: "Questionnaire drafted",
    service: "care-loop-ai-service",
    method: "POST",
    endpoint: "/questionnaires",
  },
  {
    key: "sent",
    label: "Sent via WhatsApp",
    service: "whatsapp-simulator",
    method: "POST",
    endpoint: "/api/sessions",
  },
  {
    key: "respond",
    label: "Patient responded via WhatsApp",
    service: "whatsapp-simulator",
    method: "POST",
    endpoint: "/api/sessions/{id}/submit",
  },
  {
    key: "agentic_draft",
    label: "Agentic risk assessment drafted",
    service: "care-loop-ai-service",
    method: "POST",
    endpoint: "/risk-assessment",
  },
  {
    key: "agentic",
    label: "Agentic risk assessment complete",
    service: "care-loop-analysis-service",
    method: "POST",
    endpoint: "/fhir/RiskAssessment",
  },
  {
    key: "task_desc",
    label: "Task description drafted",
    service: "care-loop-ai-service",
    method: "POST",
    endpoint: "/task-description",
  },
  {
    key: "fhir",
    label: "FHIR Task created for front-desk",
    service: "care-loop-analysis-service",
    method: "POST",
    endpoint: "/fhir/Task",
  },
  {
    key: "clinician",
    label: "Clinician review",
    service: "front-desk-dashboard",
    method: "—",
    endpoint: "not observable from this dashboard",
  },
] as const;

// Single TS source of truth for the known label set; mirrored (unavoidably, per language) by care-loop-common/dashboard_events.bal's DashboardEventLabel enum.
export type StageLabel = (typeof STAGE_DEFS)[number]["label"];

// A new run starts at each "Vitals ingested" event - the real trigger collector-service fires at the top of every pipeline pass.
export const RUN_BOUNDARY_LABEL: StageLabel = "Vitals ingested";
