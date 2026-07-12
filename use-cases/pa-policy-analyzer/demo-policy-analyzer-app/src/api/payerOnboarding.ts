import { apiFetch, apiPost } from './bff';

export type JobStatus =
  | 'connecting'
  | 'authenticating'
  | 'scanning'
  | 'fetching'
  | 'converting'
  | 'done'
  | 'error';

export type PdfEntryStatus =
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'converting'
  | 'done'
  | 'skipped'
  | 'error';

export interface PdfEntry {
  id: string;
  filename: string;
  sizeBytes: number;
  pdfStatus: PdfEntryStatus;
}

export interface OnboardingStatus {
  jobId: string;
  payerName: string;
  status: JobStatus;
  stepIndex: number;
  pdfs: PdfEntry[];
  skippedCount: number;
  errorMessage?: string;
}

export interface StartOnboardingRequest {
  payerName: string;
  serviceUrl: string;
  apiKey: string;
}

export function startOnboarding(data: StartOnboardingRequest): Promise<{ jobId: string }> {
  return apiPost<{ jobId: string }>('/payer/onboard', data);
}

export function fetchOnboardingStatus(jobId: string): Promise<OnboardingStatus> {
  return apiFetch<OnboardingStatus>(`/payer/onboard/${jobId}/status`);
}

export function resyncPayer(payerId: string, apiKey?: string): Promise<{ jobId: string }> {
  return apiPost<{ jobId: string }>(`/payer/${payerId}/resync`, { apiKey: apiKey ?? '' });
}
