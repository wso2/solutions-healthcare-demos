import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Skeleton,
} from '@wso2/oxygen-ui';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Brain,
  FileText,
  AlertTriangle,
  CheckCircle,
  ClipboardList,
} from '@wso2/oxygen-ui-icons-react';
import { fetchEvaluation } from '../api/evaluations';
import { fetchPolicyClauses, type CoverageClause } from '../api/policies';
import {
  fetchPatientSummary,
  fetchPatientDocuments,
  fetchPatientMedications,
  fetchPatientProcedures,
  fetchPatientObservations,
} from '../api/patients';
import { ClauseTree } from '../components/ClauseTree';
import { PatientPanel } from '../components/PatientPanel';
import { ClauseStatusChip, EvalStatusChip } from '../components/StatusChip';
import type { Evaluation, EvaluationResult, PolicyClause, Patient } from '../data/types';

interface EvaluationDetailPageProps {
  evalId: string;
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

// ── Convert flat DB clauses into nested PolicyClause tree ───────────────────

function buildClauseTree(flat: CoverageClause[]): PolicyClause[] {
  const map = new Map<string, PolicyClause>();
  const roots: PolicyClause[] = [];

  // First pass: create PolicyClause for each flat clause
  for (const c of flat) {
    map.set(c.id, {
      id: c.id,
      text: c.clauseText,
      type: c.clauseType as PolicyClause['type'],
      logical_operator: (c.logicalOperator ?? undefined) as PolicyClause['logical_operator'],
      children: [],
    });
  }

  // Second pass: wire up parent-child
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  // Strip empty children arrays
  for (const node of map.values()) {
    if (node.children && node.children.length === 0) {
      delete node.children;
    }
  }

  return roots;
}

// ── Find clause text from tree (recursive) ──────────────────────────────────

function findClauseText(clauses: PolicyClause[], clauseId: string): string | undefined {
  for (const c of clauses) {
    if (c.id === clauseId) return c.text;
    if (c.children) {
      const found = findClauseText(c.children, clauseId);
      if (found) return found;
    }
  }
  return undefined;
}

// ── Subcomponents ────────────────────────────────────��──────────────────────

function EvidenceCard({ result }: { result: EvaluationResult; onHighlight: (id: string | null) => void }) {
  const [expanded, setExpanded] = useState(false);

  const isGap = result.status === 'insufficient' || result.status === 'needs_review';

  return (
    <Box
      sx={{
        border: 1,
        borderColor:
          result.status === 'satisfied'
            ? 'success.light'
            : result.status === 'insufficient'
              ? 'error.light'
              : result.status === 'needs_review'
                ? 'warning.light'
                : 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
      }}
    >
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          p: 1.5,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          cursor: 'pointer',
          bgcolor:
            result.status === 'satisfied'
              ? 'success.50'
              : result.status === 'insufficient'
                ? 'error.50'
                : result.status === 'needs_review'
                  ? 'warning.50'
                  : 'background.paper',
          '&:hover': { filter: 'brightness(0.97)' },
        }}
      >
        <Box sx={{ mt: 0.2 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
            <ClauseStatusChip status={result.status} />
            <Typography variant="caption" color="text.secondary">
              Confidence: {Math.round(result.confidence * 100)}%
            </Typography>
            {result.ai_augmented && (
              <Chip
                icon={<Brain size={10} />}
                label="AI-augmented"
                size="small"
                variant="outlined"
                color="secondary"
                sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-label': { pl: 0.5, pr: 0.75 } }}
              />
            )}
          </Box>
          <Typography variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
            {result.reasoning}
          </Typography>
        </Box>
      </Box>

      {/* Action callout for gaps */}
      {isGap && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            borderTop: 1,
            borderColor: result.status === 'insufficient' ? 'error.light' : 'warning.light',
            bgcolor: result.status === 'insufficient' ? 'error.50' : 'warning.50',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
          }}
        >
          <ClipboardList size={13} color={result.status === 'insufficient' ? '#ef4444' : '#d97706'} style={{ marginTop: 1, flexShrink: 0 }} />
          <Typography
            variant="caption"
            fontWeight={600}
            color={result.status === 'insufficient' ? 'error.dark' : 'warning.dark'}
            sx={{ fontSize: '0.7rem' }}
          >
            {result.status === 'insufficient'
              ? 'Required action: obtain or complete the missing documentation noted above'
              : 'Action required: confirm and attach the relevant documentation for human review'}
          </Typography>
        </Box>
      )}

      {expanded && result.evidence.length > 0 && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', p: 1.5 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 1 }}>
            SOURCE EVIDENCE
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {result.evidence.map((ev, i) => (
              <Box
                key={i}
                sx={{
                  p: 1,
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={ev.resource_type}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }}
                  />
                  <Chip
                    icon={<FileText size={10} />}
                    label={ev.source}
                    size="small"
                    variant="outlined"
                    sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { pl: 0.5, pr: 0.75 } }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.1 }}>
                    {ev.date}
                  </Typography>
                </Box>
                <Typography
                  variant="caption"
                  sx={{ fontStyle: 'italic', color: 'text.secondary', fontSize: '0.7rem' }}
                >
                  "{ev.text}"
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** Prominent summary of gaps or eligibility barriers at the top of the center panel */
function GapSummary({ evaluation }: { evaluation: Evaluation }) {
  const insufficient = evaluation.results.filter((r) => r.status === 'insufficient');
  const needsReview = evaluation.results.filter((r) => r.status === 'needs_review');

  if (evaluation.status === 'approved') {
    return (
      <Alert
        severity="success"
        icon={<CheckCircle size={18} />}
        sx={{ mb: 2, '& .MuiAlert-message': { fontSize: '0.78rem' } }}
      >
        <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.25 }}>
          All criteria are documented
        </Typography>
        All policy requirements have supporting evidence in the patient chart. This request is ready for submission.
      </Alert>
    );
  }

  if (evaluation.status === 'denied') {
    return (
      <Alert
        severity="error"
        icon={<AlertTriangle size={18} />}
        sx={{ mb: 2, '& .MuiAlert-message': { fontSize: '0.78rem' } }}
      >
        <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
          Patient is ineligible — {insufficient.length} eligibility {insufficient.length === 1 ? 'barrier' : 'barriers'} identified
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {insufficient.map((r) => (
            <Box component="li" key={r.clause_id}>
              <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                <Box component="span" fontWeight={600}>Clause {r.clause_id}:</Box>{' '}
                {r.reasoning}
              </Typography>
            </Box>
          ))}
        </Box>
      </Alert>
    );
  }

  // pending_review
  const totalGaps = insufficient.length + needsReview.length;
  return (
    <Alert
      severity="warning"
      icon={<ClipboardList size={18} />}
      sx={{ mb: 2, '& .MuiAlert-message': { fontSize: '0.78rem' } }}
    >
      <Typography variant="caption" fontWeight={600} display="block" sx={{ mb: 0.75 }}>
        {totalGaps} documentation {totalGaps === 1 ? 'gap' : 'gaps'} require attention before this request can proceed
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {insufficient.length > 0 && (
          <Box>
            <Typography variant="caption" fontWeight={600} color="error.dark" display="block" sx={{ mb: 0.5 }}>
              Missing / incomplete criteria
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {insufficient.map((r) => (
                <Box component="li" key={r.clause_id}>
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    <Box component="span" fontWeight={600}>Clause {r.clause_id}:</Box>{' '}
                    {r.reasoning}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
        {needsReview.length > 0 && (
          <Box>
            <Typography variant="caption" fontWeight={600} color="warning.dark" display="block" sx={{ mb: 0.5 }}>
              Documentation to confirm
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {needsReview.map((r) => (
                <Box component="li" key={r.clause_id}>
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    <Box component="span" fontWeight={600}>Clause {r.clause_id}:</Box>{' '}
                    {r.reasoning}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    </Alert>
  );
}

// ── Main page component ─────────────────────────────────────────────────────

export function EvaluationDetailPage({ evalId, onNavigate }: EvaluationDetailPageProps) {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [policyClauses, setPolicyClauses] = useState<PolicyClause[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [evalLoading, setEvalLoading] = useState(true);
  const [clausesLoading, setClausesLoading] = useState(true);
  const [patientLoading, setPatientLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);
  const [rawBundles, setRawBundles] = useState<Record<string, unknown>>({});
  const [patientResourcesLoading, setPatientResourcesLoading] = useState({
    documents: false, medications: false, procedures: false, coverages: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setEvalLoading(true);
      setClausesLoading(true);
      setPatientLoading(true);
      try {
        const evalData = await fetchEvaluation(evalId);
        if (cancelled) return;
        setEvaluation(evalData);
        setEvalLoading(false);

        // Fetch clauses and patient in parallel once we have evalData
        const clausesPromise = fetchPolicyClauses(evalData.policy_id)
          .then((clauses) => { if (!cancelled) { setPolicyClauses(buildClauseTree(clauses)); } })
          .catch(() => { /* Policy may not be in DB */ })
          .finally(() => { if (!cancelled) setClausesLoading(false); });

        // Fetch patient summary first (fast) then resources progressively
        const rl = { documents: true, medications: true, procedures: true, coverages: false };
        if (!cancelled) { setPatientResourcesLoading(rl); setRawBundles({}); }

        const patientId = evalData.patient_id;
        const summaryReady = fetchPatientSummary(patientId)
          .then((summary) => {
            if (cancelled) return;
            setPatient({
              ...summary, bmi: 0, conditions: [], medications: [],
              procedures: [], observations: [], notes: [], documents: [], coverages: [],
            });
            setPatientLoading(false);
          })
          .catch(() => { if (!cancelled) setPatientLoading(false); });

        // Start resource fetches immediately in parallel
        const docsP = fetchPatientDocuments(patientId);
        const medsP = fetchPatientMedications(patientId);
        const procsP = fetchPatientProcedures(patientId);
        const obsP = fetchPatientObservations(patientId);

        // Merge each resource into the patient as it arrives (after summary creates the base)
        const resourcesPromise = summaryReady.then(() => {
          docsP.then(({ mapped, raw }) => {
            if (cancelled) return;
            setPatient(prev => prev ? { ...prev, documents: mapped } : prev);
            setRawBundles(prev => ({ ...prev, documents: raw }));
            setPatientResourcesLoading(prev => ({ ...prev, documents: false }));
          }).catch(() => { if (!cancelled) setPatientResourcesLoading(prev => ({ ...prev, documents: false })); });

          medsP.then(({ mapped, raw }) => {
            if (cancelled) return;
            setPatient(prev => prev ? { ...prev, medications: mapped } : prev);
            setRawBundles(prev => ({ ...prev, medications: raw }));
            setPatientResourcesLoading(prev => ({ ...prev, medications: false }));
          }).catch(() => { if (!cancelled) setPatientResourcesLoading(prev => ({ ...prev, medications: false })); });

          procsP.then(({ mapped, raw }) => {
            if (cancelled) return;
            setPatient(prev => prev ? { ...prev, procedures: mapped } : prev);
            setRawBundles(prev => ({ ...prev, procedures: raw }));
            setPatientResourcesLoading(prev => ({ ...prev, procedures: false }));
          }).catch(() => { if (!cancelled) setPatientResourcesLoading(prev => ({ ...prev, procedures: false })); });

          obsP.then(({ mapped, raw, bmi }) => {
            if (cancelled) return;
            setPatient(prev => prev ? { ...prev, observations: mapped, bmi } : prev);
            setRawBundles(prev => ({ ...prev, observations: raw }));
          }).catch(() => {});
        });

        await Promise.all([clausesPromise, resourcesPromise]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load evaluation');
          setEvalLoading(false);
          setClausesLoading(false);
          setPatientLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [evalId]);

  if (evalLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !evaluation) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography>{error || 'Evaluation not found.'}</Typography>
        <Button onClick={() => onNavigate('evaluations')} sx={{ mt: 2 }}>
          Back to Evaluations
        </Button>
      </Box>
    );
  }

  const handleClauseSelect = (id: string) => {
    setSelectedClauseId(id);
    const result = evaluation.results.find((r) => r.clause_id === id);
    if (result && result.evidence.length > 0) {
      setHighlightedDocId(result.evidence[0].document_id);
    } else {
      setHighlightedDocId(null);
    }
  };

  const allResultsForDisplay = selectedClauseId
    ? evaluation.results.filter((r) => r.clause_id === selectedClauseId)
    : evaluation.results;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
        }}
      >
        <Button
          startIcon={<ArrowLeft size={16} />}
          onClick={() => onNavigate('evaluations')}
          size="small"
          sx={{ minWidth: 'auto' }}
        >
          Back
        </Button>
        <Divider orientation="vertical" flexItem />
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {evaluation.patient_name}
            </Typography>
            <Chip label={`CPT ${evaluation.cpt_code}`} size="small" variant="outlined" />
            <Chip label={evaluation.payer} size="small" variant="outlined" />
            <EvalStatusChip status={evaluation.status} />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {evaluation.cpt_description} · {new Date(evaluation.timestamp).toLocaleString()}
            {evaluation.reviewer && ` · Reviewed by ${evaluation.reviewer}`}
          </Typography>
        </Box>
      </Box>

      {/* 3-panel layout */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Clause Tree */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              POLICY CLAUSE TREE
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {evaluation.payer} · {evaluation.cpt_code} · Click a clause to inspect
            </Typography>
          </Box>
          {/* Legend */}
          <Box sx={{ px: 1.5, py: 0.75, borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {[
              { color: '#22c55e', label: 'Documented' },
              { color: '#ef4444', label: 'Gap' },
              { color: '#f59e0b', label: 'Needs Docs' },
            ].map((item) => (
              <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} />
                <Typography variant="caption" sx={{ fontSize: '0.65rem' }} color="text.secondary">
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
            {clausesLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : policyClauses.length > 0 ? (
              <ClauseTree
                clauses={policyClauses}
                results={evaluation.results}
                selectedClauseId={selectedClauseId}
                onSelect={handleClauseSelect}
              />
            ) : (
              <Box sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Policy clause tree not available for this evaluation.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Center: Gap Analysis */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                GAP ANALYSIS & DOCUMENTATION REVIEW
              </Typography>
              {selectedClauseId && (
                <Typography variant="caption" color="primary.main" display="block" sx={{ fontSize: '0.65rem' }}>
                  Filtered to clause: {selectedClauseId} —{' '}
                  <Box
                    component="span"
                    sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setSelectedClauseId(null)}
                  >
                    clear
                  </Box>
                </Typography>
              )}
            </Box>
          </Box>

          <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
            {/* Gap / eligibility summary — only show when not filtered to a clause */}
            {!selectedClauseId && <GapSummary evaluation={evaluation} />}

            {/* Per-clause breakdown */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {allResultsForDisplay.length === 0 && !selectedClauseId && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  No detailed results available for this evaluation.
                </Typography>
              )}
              {allResultsForDisplay.map((result) => (
                <Box key={result.clause_id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                    <Chip
                      label={`Clause ${result.clause_id}`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                    />
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {findClauseText(policyClauses, result.clause_id) ?? ''}
                    </Typography>
                  </Box>
                  <EvidenceCard
                    result={result}
                    onHighlight={setHighlightedDocId}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Right: Patient Chart */}
        <Box
          sx={{
            width: 300,
            flexShrink: 0,
            borderLeft: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary">
              PATIENT CHART
            </Typography>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {highlightedDocId ? 'Highlighted: evidence source' : 'Click clause to highlight evidence'}
            </Typography>
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            {patientLoading ? (
              <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Skeleton variant="circular" width={40} height={40} animation="wave" />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="60%" height={20} animation="wave" />
                    <Skeleton variant="text" width="80%" height={16} animation="wave" />
                  </Box>
                </Box>
                <Skeleton variant="rounded" height={32} animation="wave" />
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rounded" height={56} animation="wave" />
                ))}
              </Box>
            ) : patient ? (
              <PatientPanel
                patient={patient}
                highlightedDocId={highlightedDocId}
                rawBundles={rawBundles}
                resourcesLoading={patientResourcesLoading}
              />
            ) : (
              <Box sx={{ p: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Patient chart data not available.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
