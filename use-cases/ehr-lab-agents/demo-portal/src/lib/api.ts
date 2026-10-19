// Typed client for the integration API (/api) and the lab simulator (/lab-api).
// Shapes mirror ehr_agentic_integration/types.bal.

export type Stage =
  | 'STARTING'
  | 'BUILDING_SUMMARY'
  | 'AWAITING_PHYSICIAN'
  | 'PLACING_LAB_ORDER'
  | 'AWAITING_PATIENT'
  | 'AWAITING_LAB'
  | 'ANALYZING_RESULTS'
  | 'GENERATING_CARE_PLAN'
  | 'AWAITING_REVIEW'
  | 'COMPLETED'
  | 'FAILED'

export type WaitingOn = 'physician' | 'patient' | 'lab' | 'ai' | 'system' | 'none'

export interface EhrInfo {
  id: string
  name: string
  vendor: string
  baseUrl: string
  reachable: boolean
  summaryOperation: boolean
}

export interface SystemInfo {
  ehrs: EhrInfo[]
  lab: { name: string; baseUrl: string }
  model: { provider: string; name: string; configured: boolean }
  workflow: { engine: string; uiUrl: string }
  agents: string[]
  agentManager: AgentManagerInfo
}

/** How one agent is governed by WSO2 Agent Manager (never carries a secret). */
export interface ManagedAgent {
  key: 'copilot' | 'analyst' | 'carePlanner'
  role: string
  name: string
  displayName: string
  /** AgentID client id; empty when the agent has no identity in Agent Manager. */
  clientId: string
  /** Model calls go through Agent Manager's AI gateway. */
  llmGateway: boolean
  /** How the agent reaches the EHR: through the MCP proxy with its AgentID, directly, or not at all. */
  ehrAccess: 'mcp-proxy' | 'direct' | 'none'
  /** AgentID roles assigned by amp-setup.sh. */
  roles: string[]
  consoleUrl: string
}

/** A permission an agent may hold: one scope on one Agent Manager MCP proxy. */
export interface AgentPermission {
  key: string
  label: string
  target: string
  scope: string
  /** A harmless tool used to probe it; null for permissions never probed (writes). */
  probeTool: string | null
}

export interface AccessCell {
  permission: string
  granted: boolean
  detail: string
}

export interface AccessRow {
  key: ManagedAgent['key']
  displayName: string
  clientId: string
  roles: string[]
  cells: AccessCell[]
}

/** What each agent may do, as Agent Manager's identity provider answers now. */
export interface AccessMatrix {
  enabled: boolean
  checkedAt: string
  issuer: string
  permissions: AgentPermission[]
  rows: AccessRow[]
}

/** A real MCP call made as an agent through Agent Manager's proxy. */
export interface ProbeResult {
  agent: string
  permission: string
  allowed: boolean
  outcome: 'allowed' | 'refused' | 'error'
  detail: string
  tokenScopes: string
  durationMs: number
}

// One agent run in the trace router's usage ledger (tokens from its model calls, priced with the AI
// gateway's price list). `step` is the agent's part of the assessment: copilot, analysis or care-plan.
export interface AgentRun {
  traceId: string
  agent: string
  role: string
  assessmentId?: string | null
  step?: string | null
  model?: string | null
  inputTokens: number
  outputTokens: number
  llmCalls: number
  toolCalls: number
  costUsd: number | null
  startedAt: number
  durationMs: number
  ok: boolean
}

export interface UsageTotals {
  runs: number
  inputTokens: number
  outputTokens: number
  costUsd: number
}

// What Agent Manager enforces on the agent's model configuration (scripts/amp-budgets.sh).
export interface AgentBudget {
  usdPerDay: number
  tokensPerHour: number
  exhausted: boolean
}

export interface AgentUsage {
  role: string | null
  allTime: UsageTotals
  last24h: UsageTotals
  lastHour: UsageTotals
  budget?: AgentBudget | null
}

export interface UsageSummary {
  currency: string
  pricedWith: string
  prices: Record<string, { input_cost_per_token: number; output_cost_per_token: number }>
  agents: Record<string, AgentUsage>
  runs: AgentRun[]
  totals: UsageTotals
}

export interface AssessmentUsage {
  currency: string
  assessmentId: string
  runs: AgentRun[]
  totals: UsageTotals
}

export interface AgentManagerInfo {
  enabled: boolean
  consoleUrl: string
  agents: ManagedAgent[]
}

export interface PatientCard {
  ehr: string
  ehrName: string
  id: string
  name: string
  gender?: string | null
  birthDate?: string | null
  age?: number | null
  mrn?: string | null
  city?: string | null
  phone?: string | null
}

export interface BiomarkerPoint {
  date: string
  value: number
  interpretation?: string | null
  source: string
}

export interface BiomarkerSeries {
  code: string
  name: string
  unit: string
  points: BiomarkerPoint[]
  latest: number
  latestDate: string
  previous?: number | null
  changePct?: number | null
  trend: 'rising' | 'falling' | 'stable' | 'single'
  status: 'normal' | 'high' | 'low'
  referenceLow?: number | null
  referenceHigh?: number | null
  longevityTarget?: string | null
}

export interface SummaryFlag {
  severity: 'info' | 'watch' | 'concern'
  title: string
  detail: string
  codes: string[]
}

export interface ConditionItem { display: string; code?: string | null; onset?: string | null; abatement?: string | null; status?: string | null }
export interface MedicationItem { display: string; status?: string | null; since?: string | null; until?: string | null; dosage?: string | null; source: 'prescribed' | 'patient-reported' }
export interface AllergyItem { substance: string; category?: string | null; criticality?: string | null; reactions: string[]; severity?: string | null; recorded?: string | null }
export interface ImmunizationItem { vaccine: string; date?: string | null; status?: string | null }
export interface ProcedureItem { display: string; date?: string | null; status?: string | null }
export interface SocialHistoryItem { label: string; value: string; date?: string | null }
export interface FamilyHistoryItem { relationship: string; condition: string; onsetAge?: number | null }
export interface EncounterItem { id: string; date?: string | null; type: string; reason?: string | null; status?: string | null; provider?: string | null }

export interface VitalSigns {
  systolic?: number | null
  diastolic?: number | null
  bloodPressureDate?: string | null
  heartRate?: number | null
  respiratoryRate?: number | null
  temperature?: number | null
  bmi?: number | null
  weightKg?: number | null
  heightCm?: number | null
}

export interface VitalTrend {
  code: string
  name: string
  unit: string
  points: { date: string; value: number; value2?: number | null }[]
}

export interface PatientSummary {
  patient: PatientCard
  source: 'summary-operation' | 'composed-search'
  fhirQueries: string[]
  conditions: ConditionItem[]
  allergies: AllergyItem[]
  medications: MedicationItem[]
  immunizations: ImmunizationItem[]
  procedures: ProcedureItem[]
  socialHistory: SocialHistoryItem[]
  familyHistory: FamilyHistoryItem[]
  encounters: EncounterItem[]
  vitals: VitalSigns
  vitalTrends: VitalTrend[]
  biomarkers: BiomarkerSeries[]
  flags: SummaryFlag[]
  careGaps: { title: string; detail: string; suggestedTests: string[] }[]
  generatedAt: string
}

export interface ExplorerRow {
  ref: string
  kind: string
  date?: string | null
  title: string
  detail?: string | null
  value?: string | null
  unit?: string | null
  flag?: string | null
  status?: string | null
  code?: string | null
  text?: string | null
}

export interface ExplorerResult {
  ehr: string
  patientId: string
  rows: ExplorerRow[]
  counts: Record<string, number>
  queries: string[]
  fetchedAt: string
  durationMs: number
}

export interface ExplorerKind { kind: string; label: string; resourceType: string }

export type Level = 'low' | 'moderate' | 'high'

export interface CopilotEvaluation {
  reply: string
  overview: string
  keyFindings: { finding: string; significance: Level; evidence: string[] }[]
  riskHypotheses: { area: string; likelihood: Level; rationale: string }[]
  recommendedTests: { testCode: string; priority: 'essential' | 'recommended' | 'optional'; rationale: string }[]
  questionsForPatient: string[]
  reasoningNote: string
}

export interface CopilotMessage {
  role: 'physician' | 'copilot'
  text: string
  at: string
  records?: number
  dateFrom?: string | null
  dateTo?: string | null
}

export interface LabOrderApproval { approvedTests: string[]; note: string; clinicalContext: string }

export interface LabOrderPlaced {
  labPatientId: string
  labServiceRequestId: string
  ehrServiceRequestId: string
  placerOrderId: string
  tests: string[]
}

export interface PatientNotification { communicationId: string; message: string; instructions: string[]; labName: string }
export interface LabVisit { specimenId: string; collectedAt: string; collectedBy: string }

export interface LabResultValue {
  code: string
  name: string
  value: number
  unit: string
  interpretation?: string | null
  referenceLow?: number | null
  referenceHigh?: number | null
  effectiveDate: string
}

export interface LabResults {
  diagnosticReportId: string
  ehrDiagnosticReportId: string
  status: string
  issued: string
  results: LabResultValue[]
}

export interface BiomarkerInsight {
  code: string
  name: string
  value: number
  unit: string
  status: 'optimal' | 'normal' | 'borderline' | 'out-of-range'
  trend: 'new' | 'rising' | 'falling' | 'stable'
  interpretation: string
}

export interface ResultsAnalysis {
  headline: string
  updatedSummary: string
  riskFlags: { area: string; severity: Level; finding: string; evidence: string[] }[]
  biomarkerInsights: BiomarkerInsight[]
  suggestedNextSteps?: string[]
}

export interface PatientReport {
  headline: string
  whatWeFound: string
  keyResults: { name: string; value: string; status: 'good' | 'watch' | 'act'; explanation: string }[]
  yourPlan: { title: string; detail: string }[]
  nextSteps: string[]
  closingNote: string
}

export interface CarePlanResult {
  physicianNote: string
  goals: { title: string; target: string; timeframe: string; category: string }[]
  followUpLabs: { testCode: string; timing: string }[]
  patientReport: PatientReport
}

export interface TimelineEvent {
  id: number
  occurredAt: string
  actor: 'physician' | 'patient' | 'workflow' | 'agent' | 'ehr' | 'lab' | 'operations'
  title: string
  detail?: string | null
  status: 'ok' | 'error'
}

export interface AssessmentData {
  summary?: PatientSummary
  copilot?: { status: 'running' | 'idle' | 'failed'; messages: CopilotMessage[] }
  evaluation?: CopilotEvaluation
  labOrderApproval?: LabOrderApproval
  labOrder?: LabOrderPlaced
  patientNotification?: PatientNotification
  labVisit?: LabVisit
  labResults?: LabResults
  analysis?: ResultsAnalysis
  carePlan?: CarePlanResult
  draftNote?: { noteId: string; status: string }
  release?: { comment: string }
  longevityRecord?: { published: boolean; patientId: string }
}

export interface Assessment {
  id: string
  ehr: string
  ehrName: string
  patientId: string
  patientName: string
  practitionerId: string
  stage: Stage
  waitingOn: WaitingOn
  error?: string | null
  ehrEncounterId?: string | null
  labServiceRequestId?: string | null
  createdAt: string
  updatedAt: string
  data: AssessmentData
  openTasks: Record<string, string>
  openReviews: Record<string, string>
  timeline: TimelineEvent[]
}

export interface AssessmentListItem {
  id: string
  ehr: string
  ehrName: string
  patientId: string
  patientName: string
  stage: Stage
  waitingOn: WaitingOn
  error?: string | null
  tests: string[]
  headline?: string | null
  createdAt: string
  updatedAt: string
}

export type StepState = 'pending' | 'running' | 'retrying' | 'waiting' | 'attention' | 'done' | 'failed'

export interface WorkflowStep {
  key: string
  label: string
  kind: 'activity' | 'agent' | 'human' | 'event' | 'review'
  actor: string
  state: StepState
  startedAt?: string | null
  endedAt?: string | null
  attempts: number
  failure?: string | null
  detail?: string | null
  taskId?: string | null
}

export interface WorkflowNode {
  id: string
  name: string
  label: string
  type: string
  status: string
  startTime?: string | null
  endTime?: string | null
  attempt: number
  failure?: string | null
}

export interface WorkflowView {
  workflowId: string
  status: string
  temporalUrl: string
  steps: WorkflowStep[]
  history: WorkflowNode[]
}

export interface FaultSwitch { id: string; label: string; description: string; active: boolean; available: boolean }

export interface Analyte { code: string; name: string; unit: string; longevityTarget: string }
export interface OrderableTest { code: string; name: string; analytes: string[]; purpose: string; preparation: string }
export interface LabCatalog { orderableTests: OrderableTest[]; analytes: Analyte[] }

export interface LongevityRecord {
  schema: string
  generatedAt: string
  patient: PatientCard
  sources: {
    ehr: { id: string; system: string; clinicalNoteId: string; resultsReportId: string; summaryMethod: string }
    lab: { system: string; diagnosticReportId: string; issued: string }
    assessmentId: string
  }
  clinicalContext: {
    conditions: ConditionItem[]
    allergies: AllergyItem[]
    medications: MedicationItem[]
    familyHistory: FamilyHistoryItem[]
    vitals: VitalSigns
  }
  biomarkers: {
    code: string
    name: string
    unit: string
    longevityTarget?: string | null
    referenceLow?: number | null
    referenceHigh?: number | null
    history: BiomarkerPoint[]
    insight?: { status: BiomarkerInsight['status']; trend: BiomarkerInsight['trend']; interpretation: string }
  }[]
  assessment: { headline: string; riskFlags: ResultsAnalysis['riskFlags']; summary: string; physicianComment?: string | null }
  carePlan: { goals: CarePlanResult['goals']; followUpLabs: { testCode: string; name: string; timing: string }[] }
  patientReport: PatientReport
  provenance: { aiGenerated: string[]; deterministic: string[]; physicianApproved: boolean; approvedAt: string; note: string }
}

export interface PatientJourney {
  assessment: null | {
    id: string
    ehr: string
    ehrName: string
    stage: Stage
    step: 'consultation' | 'visit-lab' | 'processing' | 'reviewing' | 'ready' | 'stopped'
    startedAt: string
    updatedAt: string
    tests: { code: string; name: string; preparation?: string | null }[]
    orderNumber?: string | null
    notification?: PatientNotification | null
    labVisit?: LabVisit | null
    labName: string
  }
  longevityRecord: LongevityRecord | null
}

export interface PatientAppEntry { ehr: string; ehrName: string; patientId: string; patientName: string; stage: Stage; updatedAt: string }

export interface LabOrder {
  id: string
  placerOrderId?: string | null
  patientId: string
  patientName: string
  mrn?: string | null
  tests: { code: string; name: string }[]
  authoredOn?: string | null
  requester?: string | null
  status: 'awaiting-patient' | 'collected' | 'resulted'
  specimenId?: string | null
  collectedAt?: string | null
  reportId?: string | null
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const text = await response.text()
  const body = text ? safeJson(text) : undefined
  if (!response.ok) {
    const message = (body && typeof body === 'object' && 'message' in body ? String(body.message) : text) || response.statusText
    throw new ApiError(response.status, message)
  }
  return body as T
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const post = <T>(url: string, body: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body) })
const patientPath = (ehr: string, id: string) => `/api/ehrs/${ehr}/patients/${encodeURIComponent(id)}`

export const api = {
  system: () => request<SystemInfo>('/api/system'),
  catalog: () => request<LabCatalog>('/api/lab-catalog'),
  explorerKinds: () => request<ExplorerKind[]>('/api/explorer-kinds'),

  searchPatients: (ehr: string, q: string) => request<PatientCard[]>(`/api/ehrs/${ehr}/patients?q=${encodeURIComponent(q)}`),
  patient: (ehr: string, id: string) => request<PatientCard>(patientPath(ehr, id)),
  summary: (ehr: string, id: string) => request<PatientSummary>(`${patientPath(ehr, id)}/summary`),
  ips: (ehr: string, id: string) => request<unknown>(`${patientPath(ehr, id)}/ips`),
  records: (ehr: string, id: string, kinds: string[], from?: string, to?: string) => {
    const params = new URLSearchParams()
    if (kinds.length) params.set('kinds', kinds.join(','))
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return request<ExplorerResult>(`${patientPath(ehr, id)}/records?${params}`)
  },
  patientAssessments: (ehr: string, id: string) => request<AssessmentListItem[]>(`${patientPath(ehr, id)}/assessments`),
  longevityRecord: (ehr: string, id: string) => request<LongevityRecord>(`${patientPath(ehr, id)}/longevity-record`),
  journey: (ehr: string, id: string) => request<PatientJourney>(`${patientPath(ehr, id)}/journey`),
  patientAppPatients: () => request<PatientAppEntry[]>('/api/patient-app/patients'),

  assessments: () => request<AssessmentListItem[]>('/api/assessments'),
  assessment: (id: string) => request<Assessment>(`/api/assessments/${id}`),
  workflow: (id: string) => request<WorkflowView>(`/api/assessments/${id}/workflow`),
  startAssessment: (ehr: string, patientId: string) => post<{ id: string; existing: boolean }>('/api/assessments', { ehr, patientId }),
  evaluate: (id: string, records: ExplorerRow[], question: string, dateFrom?: string, dateTo?: string) =>
    post(`/api/assessments/${id}/evaluations`, { records, question, dateFrom: dateFrom || null, dateTo: dateTo || null }),
  messageCopilot: (id: string, message: string) => post(`/api/assessments/${id}/copilot-messages`, { message }),
  orderLabs: (id: string, body: LabOrderApproval) => post(`/api/assessments/${id}/lab-order`, body),
  release: (id: string, comment: string) => post(`/api/assessments/${id}/release`, { comment }),
  decideReview: (id: string, taskId: string, retry: boolean) => post(`/api/assessments/${id}/reviews/${taskId}`, { retry }),

  faults: () => request<FaultSwitch[]>('/api/demo/faults'),
  setFault: (id: string, active: boolean) => post<FaultSwitch[]>(`/api/demo/faults/${id}`, { active }),
  crash: () => post('/api/demo/crash', {}),
  agentAccess: () => request<AccessMatrix>('/api/agent-manager/access'),
  probeAccess: (agent: string, permission: string) => post<ProbeResult>('/api/agent-manager/probes', { agent, permission }),
  usage: () => request<UsageSummary>('/api/agent-manager/usage'),
  assessmentUsage: (id: string) => request<AssessmentUsage>(`/api/agent-manager/usage?assessment=${encodeURIComponent(id)}`),

  labOrders: () => request<LabOrder[]>('/lab-api/orders'),
  collectSpecimen: (id: string) => post<{ specimenId: string; integrationNotified: boolean }>(`/lab-api/orders/${id}/collect`, {}),
  releaseLabOrder: (id: string) =>
    post<{ serviceRequestId: string; diagnosticReportId: string; observations: number; integrationNotified: boolean }>(
      `/lab-api/orders/${id}/release`,
      {},
    ),
}
