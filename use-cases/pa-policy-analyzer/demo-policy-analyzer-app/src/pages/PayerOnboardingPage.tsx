import { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  LinearProgress,
  Chip,
  Divider,
  InputAdornment,
} from '@wso2/oxygen-ui';
import {
  CheckCircle,
  Loader,
  ArrowRight,
  Shield,
  FileText,
  Building2,
  Globe,
  Database,
  FileSearch,
  Brain,
} from '@wso2/oxygen-ui-icons-react';
import {
  startOnboarding,
  fetchOnboardingStatus,
  type OnboardingStatus,
  type PdfEntry,
} from '../api/payerOnboarding';

interface PayerOnboardingPageProps {
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

type Phase = 'form' | 'fetching' | 'converting' | 'done';
type StepStatus = 'pending' | 'running' | 'done';

// Static metadata for display in the done/converting phases.
// Keys match filenames served by mock-pdf-service.
const PDF_METADATA: Record<string, { category: string; cptCodes: string[]; clauseCount: number; pages: number }> = {
  'surgery-knee.pdf': { category: 'Knee Surgery', cptCodes: ['27447', '27446'], clauseCount: 6, pages: 14 },
  'mri-ct-scan-site-of-service.pdf': { category: 'MRI / CT Scan', cptCodes: ['70553', '71250'], clauseCount: 4, pages: 9 },
  'sinus-surgeries-interventions.pdf': { category: 'Sinus Surgery', cptCodes: ['31255', '31267'], clauseCount: 5, pages: 11 },
  'Medical-Record-Requirements-for-Pre-Service.pdf': { category: 'Prior Authorization', cptCodes: ['G0008', 'G0009'], clauseCount: 8, pages: 22 },
  'vyepti-cs.pdf': { category: 'Vyepti Coverage', cptCodes: ['J0222'], clauseCount: 3, pages: 7 },
};

const FETCH_STEPS: { label: string; detail: string; icon: React.ReactNode }[] = [
  {
    label: 'Connecting to PDF service endpoint',
    detail: 'Establishing secure TLS connection to policy document server',
    icon: <Database size={14} />,
  },
  {
    label: 'Authenticating provider credentials',
    detail: 'Verifying API key and provider NPI against payer directory',
    icon: <Shield size={14} />,
  },
  {
    label: 'Scanning policy document repository',
    detail: 'Discovering available coverage policy documents',
    icon: <FileSearch size={14} />,
  },
];

// Map backend job status to which fetch step is active/done.
function stepStatusesFromJob(status: OnboardingStatus['status']): StepStatus[] {
  if (['converting', 'done', 'fetching'].includes(status)) return ['done', 'done', 'done'];
  if (status === 'scanning') return ['done', 'done', 'running'];
  if (status === 'authenticating') return ['done', 'running', 'pending'];
  if (status === 'connecting') return ['running', 'pending', 'pending'];
  return ['pending', 'pending', 'pending'];
}

// Map backend pdfStatus to the visual state used in the converting phase.
function pdfVisualStatus(pdfStatus: PdfEntry['pdfStatus']): 'pending' | 'processing' | 'done' | 'skipped' {
  if (pdfStatus === 'skipped') return 'skipped';
  if (pdfStatus === 'done') return 'done';
  if (pdfStatus === 'converting') return 'processing';
  return 'pending';
}

export function PayerOnboardingPage({ onNavigate }: PayerOnboardingPageProps) {
  const [phase, setPhase] = useState<Phase>('form');

  // Form state
  const [payerName, setPayerName] = useState('Centene Corporation');
  const [serviceUrl, setServiceUrl] = useState('https://api.centene.com/policy/v2/documents');
  const [apiKey, setApiKey] = useState('');
  const [submitError, setSubmitError] = useState('');

  // Live data from API
  const [apiPdfs, setApiPdfs] = useState<PdfEntry[]>([]);
  const [fetchStepStatuses, setFetchStepStatuses] = useState<StepStatus[]>(['pending', 'pending', 'pending']);
  const [convertingProgress, setConvertingProgress] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const canSubmit = payerName.trim() !== '' && serviceUrl.trim() !== '';

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const applyStatus = (s: OnboardingStatus) => {
    const steps = stepStatusesFromJob(s.status);
    setFetchStepStatuses(steps);
    setApiPdfs(s.pdfs);
    setSkippedCount(s.skippedCount ?? 0);

    const activePdfs = s.pdfs.filter((p) => p.pdfStatus !== 'skipped');

    if (s.status === 'done') {
      setConvertingProgress(activePdfs.length);
      setPhase('done');
      stopPolling();
    } else if (s.status === 'converting') {
      setConvertingProgress(activePdfs.filter((p) => p.pdfStatus === 'done').length);
      setPhase('converting');
    } else if (s.status === 'error') {
      setSubmitError(s.errorMessage ?? 'Onboarding failed');
      setPhase('form');
      stopPolling();
    } else {
      setPhase('fetching');
    }
  };

  const startPolling = (jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await fetchOnboardingStatus(jobId);
        applyStatus(status);
      } catch (err) {
        console.error('Status polling error:', err);
      }
    }, 500);
  };

  const runOnboarding = async () => {
    setSubmitError('');
    setPhase('fetching');
    setFetchStepStatuses(['running', 'pending', 'pending']);
    setApiPdfs([]);
    setConvertingProgress(0);
    try {
      const { jobId } = await startOnboarding({ payerName, serviceUrl, apiKey });
      jobIdRef.current = jobId;
      startPolling(jobId);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to start onboarding');
      setPhase('form');
    }
  };

  const resetState = () => {
    stopPolling();
    jobIdRef.current = null;
    setPhase('form');
    setFetchStepStatuses(['pending', 'pending', 'pending']);
    setApiPdfs([]);
    setConvertingProgress(0);
    setSkippedCount(0);
    setSubmitError('');
  };

  // ── Form ─────────────────────────────────────────────────────────────────────
  if (phase === 'form') {
    return (
      <Box sx={{ p: 3, maxWidth: 680, mx: 'auto' }}>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: '#ede9fe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={20} color="#7c3aed" />
            </Box>
            <Typography variant="h5" fontWeight={600}>
              Onboard New Payer
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Connect a payer's PDF policy service to automatically extract and structure their
            coverage criteria into evaluatable clause trees.
          </Typography>
        </Box>

        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
            Payer Details
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <TextField
              fullWidth
              label="Payer Organization Name"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="e.g. Centene Corporation"
            />

            <Divider />

            <Typography variant="subtitle2" fontWeight={600}>
              PDF Policy Service
            </Typography>

            <TextField
              fullWidth
              label="PDF Service URL"
              value={serviceUrl}
              onChange={(e) => setServiceUrl(e.target.value)}
              placeholder="https://api.payer.com/policy/v2/documents"
              helperText="Endpoint that returns coverage policy documents in PDF format"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Globe size={16} color="#9ca3af" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              fullWidth
              label="API Key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Optional — leave blank for anonymous access"
              helperText="Authentication key for the PDF service endpoint"
            />

            {submitError && (
              <Typography variant="body2" color="error.main">
                {submitError}
              </Typography>
            )}

            <Button
              variant="contained"
              size="large"
              disabled={!canSubmit}
              onClick={runOnboarding}
              sx={{ mt: 1 }}
            >
              Connect &amp; Fetch Policies
            </Button>
          </Box>
        </Paper>
      </Box>
    );
  }

  // ── Fetching ──────────────────────────────────────────────────────────────────
  if (phase === 'fetching') {
    return (
      <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Connecting to {payerName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
            {serviceUrl}
          </Typography>
        </Box>

        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3, mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2.5 }}>
            Establishing Connection
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {FETCH_STEPS.map((step, i) => {
              const status = fetchStepStatuses[i];
              return (
                <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      border: 2,
                      borderColor:
                        status === 'done'
                          ? 'success.main'
                          : status === 'running'
                            ? 'primary.main'
                            : 'divider',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color:
                        status === 'done'
                          ? 'success.main'
                          : status === 'running'
                            ? 'primary.main'
                            : 'text.disabled',
                      flexShrink: 0,
                      transition: 'all 0.3s',
                    }}
                  >
                    {status === 'running' ? (
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : status === 'done' ? (
                      <CheckCircle size={14} />
                    ) : (
                      step.icon
                    )}
                  </Box>
                  <Box sx={{ flex: 1, pt: 0.4 }}>
                    <Typography
                      variant="body2"
                      fontWeight={status === 'running' ? 600 : 400}
                      color={
                        status === 'done'
                          ? 'text.primary'
                          : status === 'running'
                            ? 'primary.main'
                            : 'text.disabled'
                      }
                    >
                      {step.label}
                    </Typography>
                    {status !== 'pending' && (
                      <Typography variant="caption" color="text.secondary">
                        {step.detail}
                      </Typography>
                    )}
                    {status === 'running' && (
                      <LinearProgress sx={{ mt: 0.75, borderRadius: 1, height: 3 }} />
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Paper>

        {apiPdfs.length > 0 && (
          <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <FileText size={16} color="#b45309" />
              <Typography variant="subtitle2" fontWeight={600}>
                Policy Documents Found
              </Typography>
              <Chip
                label={`${apiPdfs.filter((p) => p.pdfStatus !== 'skipped').length} new`}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.62rem',
                  bgcolor: '#fef3c7',
                  color: '#b45309',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
              {skippedCount > 0 && (
                <Chip
                  label={`${skippedCount} already synced`}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.62rem',
                    bgcolor: '#f3f4f6',
                    color: '#6b7280',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {apiPdfs.map((pdf) => {
                const meta = PDF_METADATA[pdf.filename];
                const isSkipped = pdf.pdfStatus === 'skipped';
                return (
                  <Box
                    key={pdf.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.25,
                      borderRadius: 1.5,
                      border: 1,
                      borderColor: isSkipped ? '#e5e7eb' : '#fde68a',
                      bgcolor: isSkipped ? '#f9fafb' : '#fffbeb',
                      opacity: isSkipped ? 0.6 : 1,
                      animation: 'fadeInDown 0.3s ease',
                    }}
                  >
                    {isSkipped ? (
                      <CheckCircle size={18} color="#9ca3af" />
                    ) : (
                      <FileText size={18} color="#b45309" />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        fontWeight={500}
                        sx={{ fontSize: '0.82rem', fontFamily: 'monospace' }}
                        noWrap
                      >
                        {pdf.filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {isSkipped ? 'Already synced' : `${(pdf.sizeBytes / 1024).toFixed(0)} KB`}
                      </Typography>
                    </Box>
                    {meta && (
                      <Chip
                        label={meta.category}
                        size="small"
                        sx={{ height: 16, fontSize: '0.58rem', '& .MuiChip-label': { px: 0.75 } }}
                      />
                    )}
                  </Box>
                );
              })}
            </Box>
          </Paper>
        )}
      </Box>
    );
  }

  // ── Converting ────────────────────────────────────────────────────────────────
  if (phase === 'converting') {
    const activePdfs = apiPdfs.filter((p) => p.pdfStatus !== 'skipped');
    const activeTotal = activePdfs.length;
    return (
      <Box sx={{ p: 3, maxWidth: 940, mx: 'auto' }}>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
            <Brain
              size={20}
              color="#7c3aed"
              style={{ animation: convertingProgress < activeTotal ? 'spin 2s linear infinite' : 'none' }}
            />
            <Typography variant="h5" fontWeight={600}>
              Extracting Policy Structure
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Parsing PDFs and converting coverage criteria into structured clause trees using AI extraction.
            {skippedCount > 0 && ` (${skippedCount} already synced polic${skippedCount === 1 ? 'y' : 'ies'} skipped)`}
          </Typography>
        </Box>

        {/* Progress bar */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary">
              {convertingProgress} of {activeTotal} policies extracted
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activeTotal > 0 ? Math.round((convertingProgress / activeTotal) * 100) : 0}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={activeTotal > 0 ? (convertingProgress / activeTotal) * 100 : 0}
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>

        {/* Column headers */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 52px 1fr',
            gap: 1,
            mb: 1,
            px: 0.5,
          }}
        >
          <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5}>
            SOURCE PDF
          </Typography>
          <Box />
          <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.5}>
            EXTRACTED POLICY
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {activePdfs.map((pdf) => {
            const status = pdfVisualStatus(pdf.pdfStatus);
            const meta = PDF_METADATA[pdf.filename];
            return (
              <Box
                key={pdf.id}
                sx={{ display: 'grid', gridTemplateColumns: '1fr 52px 1fr', gap: 1, alignItems: 'center' }}
              >
                {/* PDF card */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.5,
                    border: 2,
                    borderColor:
                      status === 'processing'
                        ? 'primary.main'
                        : status === 'done'
                          ? '#86efac'
                          : 'divider',
                    borderRadius: 2,
                    bgcolor:
                      status === 'processing'
                        ? '#eff6ff'
                        : status === 'done'
                          ? '#f0fdf4'
                          : 'background.paper',
                    transition: 'all 0.35s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1,
                      flexShrink: 0,
                      bgcolor: status === 'done' ? '#dcfce7' : '#fef3c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background-color 0.3s',
                    }}
                  >
                    {status === 'done' ? (
                      <CheckCircle size={18} color="#16a34a" />
                    ) : (
                      <FileText size={18} color="#b45309" />
                    )}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      fontWeight={500}
                      sx={{ fontSize: '0.76rem', fontFamily: 'monospace' }}
                      noWrap
                    >
                      {pdf.filename}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {(pdf.sizeBytes / 1024).toFixed(0)} KB
                    </Typography>
                  </Box>
                </Paper>

                {/* Arrow / status indicator */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {status === 'processing' ? (
                    <Loader size={22} color="#2563eb" style={{ animation: 'spin 0.8s linear infinite' }} />
                  ) : status === 'done' ? (
                    <ArrowRight size={22} color="#16a34a" />
                  ) : (
                    <ArrowRight size={22} color="#d1d5db" />
                  )}
                </Box>

                {/* Policy result card */}
                {status === 'done' && meta && (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      border: 2,
                      borderColor: '#86efac',
                      borderRadius: 2,
                      bgcolor: '#f0fdf4',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      animation: 'fadeIn 0.4s ease',
                    }}
                  >
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 1,
                        flexShrink: 0,
                        bgcolor: '#dcfce7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Shield size={18} color="#16a34a" />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem', color: '#15803d' }}>
                        {meta.category}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {meta.clauseCount} criteria · CPT {meta.cptCodes.join(', ')}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${meta.clauseCount} clauses`}
                      size="small"
                      sx={{
                        height: 18,
                        fontSize: '0.58rem',
                        bgcolor: '#dcfce7',
                        color: '#15803d',
                        flexShrink: 0,
                        '& .MuiChip-label': { px: 0.75 },
                      }}
                    />
                  </Paper>
                )}

                {status === 'processing' && (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.5,
                      border: 2,
                      borderColor: 'primary.light',
                      borderRadius: 2,
                      bgcolor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Loader
                      size={14}
                      color="#2563eb"
                      style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
                    />
                    <Typography variant="caption" color="primary.main" fontWeight={500}>
                      Extracting policy structure…
                    </Typography>
                  </Paper>
                )}

                {status === 'pending' && (
                  <Box
                    sx={{
                      p: 1.5,
                      border: 2,
                      borderColor: 'divider',
                      borderRadius: 2,
                      bgcolor: 'background.default',
                      display: 'flex',
                      alignItems: 'center',
                      minHeight: 68,
                    }}
                  >
                    <Typography variant="caption" color="text.disabled">
                      Pending…
                    </Typography>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  // ── Done ──────────────────────────────────────────────────────────────────────
  const donePdfs = apiPdfs.filter((p) => p.pdfStatus !== 'skipped');
  const totalClauses = donePdfs.reduce((acc, p) => {
    const meta = PDF_METADATA[p.filename];
    return acc + (meta?.clauseCount ?? 0);
  }, 0);
  const allCPTs = new Set(donePdfs.flatMap((p) => PDF_METADATA[p.filename]?.cptCodes ?? []));

  return (
    <Box sx={{ p: 3, maxWidth: 720, mx: 'auto' }}>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            bgcolor: '#dcfce7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <CheckCircle size={28} color="#16a34a" />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={600}>
            {payerName} {skippedCount > 0 ? 'Synced' : 'Onboarded'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {donePdfs.length > 0
              ? `${donePdfs.length} polic${donePdfs.length === 1 ? 'y' : 'ies'} extracted · ${totalClauses} coverage criteria · ${allCPTs.size} CPT codes`
              : 'No new policies found'}
            {skippedCount > 0 && ` · ${skippedCount} existing polic${skippedCount === 1 ? 'y' : 'ies'} unchanged`}
          </Typography>
        </Box>
      </Box>

      {/* Summary stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mb: 2 }}>
        {[
          { label: donePdfs.length > 0 ? 'New Policies' : 'Policies', value: donePdfs.length, color: '#7c3aed', bg: '#ede9fe' },
          { label: 'Criteria', value: totalClauses, color: '#0891b2', bg: '#ecfeff' },
          { label: 'CPT Codes', value: allCPTs.size, color: '#16a34a', bg: '#dcfce7' },
        ].map((stat) => (
          <Paper
            key={stat.label}
            elevation={0}
            sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}
          >
            <Typography variant="h4" fontWeight={700} sx={{ color: stat.color }}>
              {stat.value}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stat.label}
            </Typography>
          </Paper>
        ))}
      </Box>

      {/* Extracted policy list */}
      <Paper
        elevation={0}
        sx={{ border: 2, borderColor: '#86efac', borderRadius: 2, overflow: 'hidden', mb: 2.5 }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: '#f0fdf4',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Shield size={16} color="#16a34a" />
          <Typography variant="body2" fontWeight={600}>
            Extracted Policies
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {donePdfs.map((pdf) => {
            const meta = PDF_METADATA[pdf.filename];
            return (
              <Box
                key={pdf.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.25,
                  borderRadius: 1.5,
                  bgcolor: '#f0fdf4',
                }}
              >
                <CheckCircle size={14} color="#16a34a" />
                <Typography variant="body2" fontWeight={500} sx={{ flex: 1, fontSize: '0.82rem' }}>
                  {meta?.category ?? pdf.filename}
                </Typography>
                {meta && (
                  <>
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      {meta.clauseCount} criteria
                    </Typography>
                    {meta.cptCodes.map((code) => (
                      <Chip
                        key={code}
                        label={`CPT ${code}`}
                        size="small"
                        sx={{ height: 16, fontSize: '0.58rem', '& .MuiChip-label': { px: 0.5 } }}
                      />
                    ))}
                  </>
                )}
              </Box>
            );
          })}
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <Button variant="contained" onClick={() => onNavigate('policies')}>
          View Extracted Policies
        </Button>
        <Button variant="outlined" onClick={() => onNavigate('new-evaluation')}>
          Run an Evaluation
        </Button>
        <Button variant="text" onClick={resetState}>
          Onboard Another Payer
        </Button>
      </Box>
    </Box>
  );
}
