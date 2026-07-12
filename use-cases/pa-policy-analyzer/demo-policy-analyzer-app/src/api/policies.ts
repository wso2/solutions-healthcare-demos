import { apiFetch } from './bff';

export interface Payer {
  id: string;
  name: string;
  policyCount: number;
  codeCount: number;
}

export interface PolicyCode {
  id: string;
  policyId: string;
  codeType: string;
  code: string;
  description: string | null;
}

export interface PolicyDoc {
  id: string;
  jobId: string;
  pdfId: string;
  policyName: string;
  markdownPath: string | null;
  medicalRecordsRef: string | null;
}

export interface CoverageClause {
  id: string;
  policyId: string;
  parentId: string | null;
  clauseText: string;
  clauseType: string;
  logicalOperator: string | null;
  sortOrder: number;
  isEditable: boolean;
}

export interface PolicyDetail {
  code: string;
  codeType: string;
  description: string | null;
  policy: {
    id: string;
    policyName: string;
    medicalRecordsRef: string | null;
    clauses: CoverageClause[];
    relatedCodes: PolicyCode[];
  };
}

export function fetchPayers(): Promise<Payer[]> {
  return apiFetch<Payer[]>('/payers');
}

export function fetchPayerCodes(payerId: string, type?: string): Promise<PolicyCode[]> {
  const params: Record<string, string> = {};
  if (type) params.type = type;
  return apiFetch<PolicyCode[]>(`/payers/${payerId}/codes`, params);
}

export function fetchPayerPolicies(payerId: string): Promise<PolicyDoc[]> {
  return apiFetch<PolicyDoc[]>(`/payers/${payerId}/policies`);
}

export function fetchCodePolicy(code: string): Promise<PolicyDetail> {
  return apiFetch<PolicyDetail>(`/payer/codes/${code}/policy`);
}

export function fetchPolicyClauses(policyId: string): Promise<CoverageClause[]> {
  return apiFetch<CoverageClause[]>(`/payer/policy/${policyId}/clauses`);
}
