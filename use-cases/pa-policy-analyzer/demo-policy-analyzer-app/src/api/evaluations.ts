import { apiFetch, apiPost } from './bff';
import type { Evaluation, EvaluationResult, Evidence, EvaluationStatus, ClauseStatus } from '../data/types';

// ── API response types (match BFF JSON shape) ───────────────────────────────

interface EvaluationListItem {
  id: string;
  patient_id: string;
  patient_name: string;
  policy_id: string;
  cpt_code: string;
  cpt_description: string | null;
  payer: string;
  status: string;
  overall_reasoning: string | null;
  reviewer: string | null;
  timestamp: string;
  gap_count: number;
}

interface EvaluationDetailResponse {
  id: string;
  patient_id: string;
  patient_name: string;
  policy_id: string;
  cpt_code: string;
  cpt_description: string | null;
  payer: string;
  status: string;
  overall_reasoning: string | null;
  reviewer: string | null;
  timestamp: string;
  results: {
    clause_id: string;
    clause_text: string | null;
    status: string;
    confidence: number;
    reasoning: string | null;
    ai_augmented: boolean;
    evidence: {
      source: string;
      document_id: string | null;
      date: string | null;
      text: string | null;
      resource_type: string;
    }[];
  }[];
}

// ── Mappers ─────────────────────────────────────────────────────────────────

function mapStatus(s: string): EvaluationStatus {
  if (s === 'approved' || s === 'denied' || s === 'pending_review') return s;
  if (s === 'in_progress') return 'pending_review'; // map in_progress to pending_review for display
  return 'pending_review';
}

function mapClauseStatus(s: string): ClauseStatus {
  if (s === 'satisfied' || s === 'insufficient' || s === 'needs_review' || s === 'not_applicable') return s;
  return 'needs_review';
}

function mapResourceType(s: string): Evidence['resource_type'] {
  const valid = ['Condition', 'Procedure', 'MedicationRequest', 'Observation', 'DocumentReference', 'ImagingStudy'];
  return valid.includes(s) ? s as Evidence['resource_type'] : 'DocumentReference';
}

function mapListItem(item: EvaluationListItem): Evaluation {
  return {
    id: item.id,
    patient_id: item.patient_id,
    patient_name: item.patient_name,
    policy_id: item.policy_id,
    cpt_code: item.cpt_code,
    cpt_description: item.cpt_description ?? '',
    payer: item.payer,
    timestamp: item.timestamp,
    status: mapStatus(item.status),
    overall_reasoning: item.overall_reasoning ?? '',
    reviewer: item.reviewer ?? undefined,
    // List endpoint doesn't return full results, just gap_count
    results: [],
    _gap_count: item.gap_count,
    _raw_status: item.status,
  } as Evaluation & { _gap_count: number; _raw_status: string };
}

function mapDetail(resp: EvaluationDetailResponse): Evaluation {
  const results: EvaluationResult[] = resp.results.map((r) => ({
    clause_id: r.clause_id,
    status: mapClauseStatus(r.status),
    confidence: Number(r.confidence),
    reasoning: r.reasoning ?? '',
    ai_augmented: r.ai_augmented,
    evidence: r.evidence.map((ev): Evidence => ({
      source: ev.source,
      document_id: ev.document_id ?? '',
      date: ev.date ?? '',
      text: ev.text ?? '',
      resource_type: mapResourceType(ev.resource_type),
    })),
  }));

  return {
    id: resp.id,
    patient_id: resp.patient_id,
    patient_name: resp.patient_name,
    policy_id: resp.policy_id,
    cpt_code: resp.cpt_code,
    cpt_description: resp.cpt_description ?? '',
    payer: resp.payer,
    timestamp: resp.timestamp,
    status: mapStatus(resp.status),
    overall_reasoning: resp.overall_reasoning ?? '',
    reviewer: resp.reviewer ?? undefined,
    results,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function fetchEvaluations(): Promise<Evaluation[]> {
  const items = await apiFetch<EvaluationListItem[]>('/evaluations');
  return items.map(mapListItem);
}

export async function fetchEvaluation(id: string): Promise<Evaluation> {
  const resp = await apiFetch<EvaluationDetailResponse>(`/evaluations/${id}`);
  return mapDetail(resp);
}

export interface StartEvaluationRequest {
  patientId: string;
  patientName: string;
  policyId: string;
  cptCode: string;
  cptDescription: string;
  payer: string;
}

export async function startEvaluation(req: StartEvaluationRequest): Promise<{ id: string }> {
  return apiPost<{ id: string }>('/evaluations', req);
}
