import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  LinearProgress,
  Alert,
  CircularProgress,
} from '@wso2/oxygen-ui';
import { CheckCircle, Loader, Database, Brain, FileSearch } from '@wso2/oxygen-ui-icons-react';
import { fetchPatientList, type PatientListItem } from '../api/patients';
import { fetchPayers, fetchPayerCodes, fetchCodePolicy, type Payer, type PolicyCode, type PolicyDetail } from '../api/policies';
import { startEvaluation, fetchEvaluation } from '../api/evaluations';

interface NewEvaluationPageProps {
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface ProgressStep {
  label: string;
  detail: string;
  icon: React.ReactNode;
  status: StepStatus;
}

export function NewEvaluationPage({ onNavigate }: NewEvaluationPageProps) {
  const [patientList, setPatientList] = useState<PatientListItem[]>([]);
  const [patientListLoading, setPatientListLoading] = useState(true);
  const [payers, setPayers] = useState<Payer[]>([]);
  const [payersLoading, setPayersLoading] = useState(true);
  const [payerCodes, setPayerCodes] = useState<PolicyCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);

  const [patientId, setPatientId] = useState('');
  const [payerId, setPayerId] = useState('');
  const [cptCode, setCptCode] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [error, setError] = useState('');

  // Load patient list and payers on mount
  useEffect(() => {
    fetchPatientList()
      .then(setPatientList)
      .catch(() => {})
      .finally(() => setPatientListLoading(false));

    fetchPayers()
      .then(setPayers)
      .catch(() => {})
      .finally(() => setPayersLoading(false));
  }, []);

  // When payer changes, load their CPT codes
  useEffect(() => {
    if (!payerId) {
      setPayerCodes([]);
      setCptCode('');
      return;
    }
    setCodesLoading(true);
    setCptCode('');
    fetchPayerCodes(payerId, 'CPT')
      .then(setPayerCodes)
      .catch(() => setPayerCodes([]))
      .finally(() => setCodesLoading(false));
  }, [payerId]);

  const selectedPatient = patientList.find((p) => p.id === patientId);
  const selectedPayer = payers.find((p) => p.id === payerId);
  const selectedCode = payerCodes.find((c) => c.code === cptCode);
  const canRun = patientId && payerId && cptCode;

  const initialSteps = useCallback((): ProgressStep[] => [
    {
      label: 'Fetching patient FHIR data',
      detail: 'Retrieving conditions, medications, procedures and clinical notes',
      icon: <Database size={16} />,
      status: 'pending',
    },
    {
      label: 'Loading payer policy',
      detail: `Loading ${selectedPayer?.name ?? 'payer'} coverage criteria for CPT ${cptCode}`,
      icon: <FileSearch size={16} />,
      status: 'pending',
    },
    {
      label: 'AI evaluation agent running',
      detail: 'Agent is evaluating patient data against policy clauses',
      icon: <Brain size={16} />,
      status: 'pending',
    },
    {
      label: 'Generating audit trail',
      detail: 'Compiling per-clause decisions with source document references',
      icon: <CheckCircle size={16} />,
      status: 'pending',
    },
  ], [selectedPayer, cptCode]);

  const runEvaluation = async () => {
    setError('');
    if (!selectedPatient || !selectedPayer || !cptCode) return;

    const stepList = initialSteps();
    setSteps(stepList);
    setRunning(true);

    // Step 1: Starting — show fetching patient data
    setSteps((prev) => prev.map((s, i) => ({ ...s, status: i === 0 ? 'running' : 'pending' })));

    try {
      // Look up the policy for the code
      let policyDetail: PolicyDetail;
      try {
        policyDetail = await fetchCodePolicy(cptCode);
      } catch {
        setError(`No policy found for CPT ${cptCode} under ${selectedPayer.name}. Make sure the payer has been onboarded.`);
        setRunning(false);
        return;
      }

      // Step 2: Loading policy
      setSteps((prev) => prev.map((s, i) => ({
        ...s,
        status: i === 0 ? 'done' : i === 1 ? 'running' : 'pending',
      })));
      await new Promise((r) => setTimeout(r, 500));

      // Step 3: Start the evaluation via agent
      setSteps((prev) => prev.map((s, i) => ({
        ...s,
        status: i <= 1 ? 'done' : i === 2 ? 'running' : 'pending',
      })));

      const { id: evalId } = await startEvaluation({
        patientId,
        patientName: selectedPatient.name,
        policyId: policyDetail.policy.id,
        cptCode,
        cptDescription: selectedCode?.description ?? '',
        payer: selectedPayer.name,
      });

      // Poll for completion
      let evalDone = false;
      let pollCount = 0;
      while (!evalDone && pollCount < 120) {
        await new Promise((r) => setTimeout(r, 2000));
        pollCount++;
        try {
          const evalData = await fetchEvaluation(evalId);
          if (evalData.status !== 'pending_review' || evalData.results.length > 0 ||
              (evalData as { _raw_status?: string })._raw_status !== 'in_progress') {
            // Check if the raw status from the API is no longer in_progress
            // The mapper maps in_progress to pending_review, so we need the actual status
            const raw = await fetch(`${window.config?.EVAL_AGENT_URL || 'http://localhost:6091/v1/evaluations'}/${evalId}`);
            const rawData = await raw.json();
            if (rawData.status !== 'in_progress') {
              evalDone = true;
            }
          }
        } catch {
          // Keep polling
        }
      }

      // Step 4: Done
      setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' })));
      await new Promise((r) => setTimeout(r, 400));

      onNavigate('evaluation-detail', { id: evalId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start evaluation');
      setRunning(false);
    }
  };

  const stepStatusColor = (s: StepStatus) => {
    if (s === 'done') return 'success.main';
    if (s === 'running') return 'primary.main';
    if (s === 'error') return 'error.main';
    return 'text.disabled';
  };

  return (
    <Box sx={{ p: 3, maxWidth: 680, mx: 'auto' }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          New Prior Authorization Evaluation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select a patient, payer, and procedure code to run an AI-driven evaluation against the
          payer's coverage policy.
        </Typography>
      </Box>

      {!running ? (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
            Evaluation Parameters
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <FormControl fullWidth disabled={patientListLoading}>
              <InputLabel>Patient</InputLabel>
              <Select
                value={patientId}
                label="Patient"
                onChange={(e) => setPatientId(e.target.value)}
                startAdornment={
                  patientListLoading ? (
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                  ) : undefined
                }
              >
                {patientList.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Box>
                      <Typography variant="body2">{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        ID: {p.id}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedPatient && (
              <Alert severity="info" sx={{ py: 0.5 }}>
                <Typography variant="caption">
                  <strong>Patient:</strong> {selectedPatient.name} · ID: {selectedPatient.id}
                </Typography>
              </Alert>
            )}

            <FormControl fullWidth disabled={payersLoading}>
              <InputLabel>Payer</InputLabel>
              <Select
                value={payerId}
                label="Payer"
                onChange={(e) => setPayerId(e.target.value)}
                startAdornment={
                  payersLoading ? (
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                  ) : undefined
                }
              >
                {payers.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Box>
                      <Typography variant="body2">{p.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.policyCount} {p.policyCount === 1 ? 'policy' : 'policies'} · {p.codeCount} codes
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth disabled={!payerId || codesLoading}>
              <InputLabel>CPT Code</InputLabel>
              <Select
                value={cptCode}
                label="CPT Code"
                onChange={(e) => setCptCode(e.target.value)}
                startAdornment={
                  codesLoading ? (
                    <CircularProgress size={16} sx={{ mr: 1 }} />
                  ) : undefined
                }
              >
                {payerCodes.map((c) => (
                  <MenuItem key={c.code} value={c.code}>
                    <Box>
                      <Typography variant="body2">{c.code}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.description}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {error && (
              <Alert severity="warning">
                <Typography variant="caption">{error}</Typography>
              </Alert>
            )}

            <Button
              variant="contained"
              size="large"
              disabled={!canRun}
              onClick={runEvaluation}
              sx={{ mt: 1 }}
            >
              Run Evaluation
            </Button>
          </Box>
        </Paper>
      ) : (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
            Evaluation in Progress
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 3 }}>
            {selectedPatient?.name} · CPT {cptCode} · {selectedPayer?.name}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {steps.map((step, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: 2,
                    borderColor:
                      step.status === 'done'
                        ? 'success.main'
                        : step.status === 'running'
                          ? 'primary.main'
                          : 'divider',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: stepStatusColor(step.status),
                    flexShrink: 0,
                    transition: 'all 0.3s',
                  }}
                >
                  {step.status === 'running' ? (
                    <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  ) : step.status === 'done' ? (
                    <CheckCircle size={14} />
                  ) : (
                    step.icon
                  )}
                </Box>
                <Box sx={{ flex: 1, pt: 0.4 }}>
                  <Typography
                    variant="body2"
                    fontWeight={step.status === 'running' ? 600 : 400}
                    color={
                      step.status === 'done'
                        ? 'text.primary'
                        : step.status === 'running'
                          ? 'primary.main'
                          : 'text.disabled'
                    }
                  >
                    {step.label}
                  </Typography>
                  {step.status !== 'pending' && (
                    <Typography variant="caption" color="text.secondary">
                      {step.detail}
                    </Typography>
                  )}
                  {step.status === 'running' && (
                    <LinearProgress sx={{ mt: 0.75, borderRadius: 1, height: 3 }} />
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
