export interface Condition {
  id: string;
  code: string;
  display: string;
  onset: string;
}

export interface Medication {
  id: string;
  name: string;
  status: 'active' | 'stopped' | 'completed';
  start: string;
  end?: string;
  reason?: string;
}

export interface Procedure {
  id: string;
  code: string;
  display: string;
  date: string;
  outcome?: string;
  durationWeeks?: number;
}

export interface Observation {
  id: string;
  code: string;
  display: string;
  value: string;
  unit: string;
  date: string;
}

export interface ClinicalNote {
  id: string;
  date: string;
  type: string;
  author: string;
  summary: string;
  content: string;
}

export interface DocumentRef {
  id: string;
  type: string;
  date: string;
  status: string;
  description: string;
  contentType: string;
  url?: string;
  textContent?: string;
}

export interface Coverage {
  id: string;
  status: string;
  payer: string;
  subscriberId?: string;
  relationship?: string;
  period?: { start?: string; end?: string };
}

export interface Patient {
  id: string;
  name: string;
  dob: string;
  age: number;
  gender: string;
  mrn: string;
  insurance: string;
  bmi: number;
  conditions: Condition[];
  medications: Medication[];
  procedures: Procedure[];
  observations: Observation[];
  notes: ClinicalNote[];
  documents: DocumentRef[];
  coverages: Coverage[];
}

export type ClauseType = 'diagnosis' | 'duration' | 'trial_failure' | 'imaging' | 'exclusion';
export type LogicalOperator = 'AND' | 'OR';

export interface PolicyClause {
  id: string;
  text: string;
  type: ClauseType;
  required_value?: string;
  logical_operator?: LogicalOperator;
  children?: PolicyClause[];
}

export interface CPTCodeNode {
  code: string;
  description: string;
}

export interface CPTCategory {
  id: string;
  label: string;
  description: string;
  color: string;
  bg: string;
  badge: string;
  codes: string[];
}

export interface Policy {
  id: string;
  category_id: string;       // procedure category this policy belongs to
  cpt_code: string;          // primary CPT code (backwards compat)
  cpt_codes: string[];       // all CPT codes this policy applies to
  cpt_description: string;
  payer: string;
  effective_date: string;
  coverage_status: 'covered' | 'not_covered';
  clauses: PolicyClause[];
  required_documentation: string[];
}

export type ClauseStatus = 'satisfied' | 'insufficient' | 'needs_review' | 'not_applicable';
export type EvaluationStatus = 'approved' | 'denied' | 'pending_review';

export interface Evidence {
  source: string;
  document_id: string;
  date: string;
  text: string;
  resource_type:
    | 'Condition'
    | 'Procedure'
    | 'MedicationRequest'
    | 'Observation'
    | 'DocumentReference'
    | 'ImagingStudy';
}

export interface EvaluationResult {
  clause_id: string;
  status: ClauseStatus;
  evidence: Evidence[];
  confidence: number;
  reasoning: string;
  ai_augmented: boolean;
}

export interface Evaluation {
  id: string;
  patient_id: string;
  patient_name: string;
  policy_id: string;
  cpt_code: string;
  cpt_description: string;
  payer: string;
  timestamp: string;
  status: EvaluationStatus;
  results: EvaluationResult[];
  overall_reasoning: string;
  reviewer?: string;
}
