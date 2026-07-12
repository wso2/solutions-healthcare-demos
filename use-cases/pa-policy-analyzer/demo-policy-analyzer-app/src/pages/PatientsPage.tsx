import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Grid,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Skeleton,
  TextField,
  InputAdornment,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@wso2/oxygen-ui';
import { User, ArrowRight, Search, FileText, Download, X } from '@wso2/oxygen-ui-icons-react';
import {
  fetchPatientList,
  fetchPatientSummary,
  fetchPatientDocuments,
  fetchPatientMedications,
  fetchPatientProcedures,
  fetchPatientObservations,
  type PatientListItem,
  type PatientBase,
} from '../api/patients';
import { documentProxyUrl, fetchBinaryBlobUrl } from '../api/bff';
import { fetchEvaluations } from '../api/evaluations';
import { EvalStatusChip } from '../components/StatusChip';
import type { Patient, Evaluation, DocumentRef } from '../data/types';


function PatientCardSkeleton() {
  return (
    <Paper elevation={0} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Skeleton variant="circular" width={40} height={40} animation="wave" />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="60%" height={20} animation="wave" />
          <Skeleton variant="text" width="40%" height={16} animation="wave" />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Skeleton variant="text" width={80} height={16} animation="wave" />
        <Skeleton variant="rounded" width={70} height={24} animation="wave" />
      </Box>
    </Paper>
  );
}

interface PatientCardProps {
  item: PatientListItem;
  selected: boolean;
  onClick: () => void;
  evaluations: Evaluation[];
}

function PatientCard({ item, selected, onClick, evaluations }: PatientCardProps) {
  const evals = evaluations.filter((e) => e.patient_id === item.id);
  const lastEval = [...evals].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )[0];

  return (
    <Paper
      elevation={0}
      onClick={onClick}
      sx={{
        p: 2,
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        borderRadius: 2,
        cursor: 'pointer',
        '&:hover': { borderColor: 'primary.light' },
        transition: 'border-color 0.15s',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            bgcolor: 'primary.50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <User size={20} color="#6366f1" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {item.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ID: {item.id}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {evals.length} evaluation{evals.length !== 1 ? 's' : ''}
        </Typography>
        {lastEval && <EvalStatusChip status={lastEval.status} />}
      </Box>
    </Paper>
  );
}

function DocumentCard({ doc, onViewPdf }: { doc: DocumentRef; onViewPdf: (resourceId: string, title: string) => void }) {
  const isPdf = doc.contentType === 'application/pdf';
  const isText = doc.contentType.startsWith('text/') || !!doc.textContent;

  return (
    <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <FileText size={16} />
          <Typography variant="body2" fontWeight={500} noWrap>
            {doc.description || doc.type}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
          <Chip label={doc.status} size="small" color={doc.status === 'current' ? 'success' : 'default'} />
        </Box>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
        {doc.type} · {doc.date}
      </Typography>

      {isText && doc.textContent && (
        <Box
          sx={{
            mt: 1,
            p: 1,
            bgcolor: 'background.default',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            maxHeight: 120,
            overflowY: 'auto',
          }}
        >
          <Typography variant="caption" sx={{ fontSize: '0.7rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {doc.textContent}
          </Typography>
        </Box>
      )}

      {isPdf && doc.url && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<FileText size={14} />}
          onClick={() => {
            const parts = doc.url!.split('/');
            const binaryIdx = parts.indexOf('Binary');
            const resourceId = binaryIdx >= 0 && binaryIdx < parts.length - 1 ? parts[binaryIdx + 1] : parts[parts.length - 1];
            onViewPdf(resourceId, doc.description || doc.type);
          }}
          sx={{ mt: 1, textTransform: 'none', fontSize: '0.7rem' }}
        >
          View PDF
        </Button>
      )}

      {!isText && !isPdf && doc.url && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Download size={14} />}
          href={documentProxyUrl(doc.url)}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ mt: 1, textTransform: 'none', fontSize: '0.7rem' }}
        >
          Download
        </Button>
      )}
    </Box>
  );
}

// Skeleton for the detail panel header
function PatientDetailSkeleton() {
  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
      <Box sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Skeleton variant="circular" width={52} height={52} animation="wave" />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="50%" height={28} animation="wave" />
            <Skeleton variant="text" width="70%" height={20} animation="wave" />
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <Skeleton variant="rounded" width={90} height={24} animation="wave" />
              <Skeleton variant="rounded" width={70} height={24} animation="wave" />
            </Box>
          </Box>
        </Box>
      </Box>
      <Box sx={{ px: 2, pt: 1, pb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {[80, 90, 80, 90].map((w, i) => (
            <Skeleton key={i} variant="text" width={w} height={36} animation="wave" />
          ))}
        </Box>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} animation="wave" />
        ))}
      </Box>
    </Paper>
  );
}

interface ResourceLoadingState {
  documents: boolean;
  medications: boolean;
  procedures: boolean;
  observations: boolean;
}

interface PatientDetailProps {
  summary: PatientBase;
  patient: Patient | null;
  resourcesLoading: ResourceLoadingState;
  rawBundles: Record<string, unknown>;
  onNavigate: (page: string, params?: Record<string, string>) => void;
  evaluations: Evaluation[];
}

function PatientDetail({ summary, patient, resourcesLoading, rawBundles, onNavigate, evaluations }: PatientDetailProps) {
  const [tab, setTab] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const evals = evaluations
    .filter((e) => e.patient_id === summary.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const tabKeys = ['documents', 'medications', 'procedures', 'evaluations'] as const;
  const isCurrentTabLoading =
    tab === 0 ? resourcesLoading.documents :
    tab === 1 ? resourcesLoading.medications :
    tab === 2 ? resourcesLoading.procedures :
    false;

  const openPdfViewer = async (resourceId: string, title: string) => {
    setPdfTitle(title);
    setPdfLoading(true);
    setPdfBlobUrl(null);
    try {
      const blobUrl = await fetchBinaryBlobUrl(resourceId);
      setPdfBlobUrl(blobUrl);
    } catch {
      setPdfBlobUrl(null);
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdfViewer = () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setPdfTitle('');
  };

  return (
    <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              bgcolor: 'primary.50',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <User size={24} color="#6366f1" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={600}>
              {summary.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {summary.dob && `DOB: ${summary.dob} · `}{summary.age > 0 && `${summary.age}y `}{summary.gender}
              {summary.insurance && ` · ${summary.insurance}`}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              <Chip label={`MRN: ${summary.mrn}`} size="small" variant="outlined" />
              {patient?.bmi && patient.bmi > 0 && (
                <Chip label={`BMI: ${patient.bmi}`} size="small" variant="outlined" />
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as number)}
          sx={{ flex: 1 }}
        >
          <Tab label="Documents" />
          <Tab label="Medications" />
          <Tab label="Procedures" />
          <Tab label="Evaluations" />
        </Tabs>
        {tab !== 3 && (
          <Button
            size="small"
            variant={showJson ? 'contained' : 'outlined'}
            onClick={() => setShowJson(!showJson)}
            sx={{ fontSize: '0.7rem', minHeight: 24, py: 0.25, px: 1.5, mr: 1.5, textTransform: 'none', flexShrink: 0 }}
          >
            {showJson ? 'List View' : 'Raw JSON'}
          </Button>
        )}
      </Box>

      {/* Scrollable tab content */}
      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <Box sx={{ p: 2, height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
          {isCurrentTabLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 4, gap: 1.5 }}>
              <CircularProgress size={28} />
              <Typography variant="caption" color="text.secondary">Loading clinical data…</Typography>
            </Box>
          ) : showJson && tab !== 3 ? (
            <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 2, overflow: 'auto' }}>
              <pre style={{ margin: 0, fontSize: '0.7rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {JSON.stringify(rawBundles[tabKeys[tab]] ?? {}, null, 2)}
              </pre>
            </Box>
          ) : (
            <>
              {tab === 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(patient?.documents ?? []).length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                      No documents found
                    </Typography>
                  ) : (
                    patient!.documents.map((d) => (
                      <DocumentCard key={d.id} doc={d} onViewPdf={openPdfViewer} />
                    ))
                  )}
                </Box>
              )}

              {tab === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(patient?.medications ?? []).length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                      No medications found
                    </Typography>
                  ) : (
                    patient!.medications.map((m) => (
                      <Box key={m.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="body2" fontWeight={500}>
                            {m.name}
                          </Typography>
                          <Chip
                            label={m.status}
                            size="small"
                            color={m.status === 'active' ? 'success' : 'default'}
                          />
                        </Box>
                        {m.reason && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {m.reason}
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary">
                          {m.start} → {m.end ?? 'present'}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
              )}

              {tab === 2 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(patient?.procedures ?? []).length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                      No procedures found
                    </Typography>
                  ) : (
                    patient!.procedures.map((p) => (
                      <Box key={p.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                          <Typography variant="body2" fontWeight={500}>
                            {p.display}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                            <Chip label={p.code} size="small" />
                            {p.durationWeeks && (
                              <Chip label={`${p.durationWeeks}w`} size="small" color="primary" variant="outlined" />
                            )}
                          </Box>
                        </Box>
                        <Typography variant="caption" color="text.secondary" display="block">
                          Date: {p.date}
                        </Typography>
                        {p.outcome && (
                          <Typography variant="caption" color="text.secondary">
                            Outcome: {p.outcome}
                          </Typography>
                        )}
                      </Box>
                    ))
                  )}
                </Box>
              )}

              {tab === 3 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {evals.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                      No evaluations yet
                    </Typography>
                  ) : (
                    evals.map((ev) => (
                      <Box
                        key={ev.id}
                        onClick={() => onNavigate('evaluation-detail', { id: ev.id })}
                        sx={{
                          p: 1.5,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          '&:hover': { bgcolor: 'action.hover' },
                          transition: 'background-color 0.15s',
                        }}
                      >
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2" fontWeight={500}>
                            CPT {ev.cpt_code} · {ev.payer}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(ev.timestamp).toLocaleDateString()}
                            {ev.reviewer && ` · ${ev.reviewer}`}
                          </Typography>
                        </Box>
                        <EvalStatusChip status={ev.status} />
                        <ArrowRight size={16} />
                      </Box>
                    ))
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

      {/* PDF Viewer Dialog */}
      <Dialog
        open={pdfLoading || pdfBlobUrl !== null}
        onClose={closePdfViewer}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { height: '85vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={600} noWrap>
            {pdfTitle}
          </Typography>
          <IconButton size="small" onClick={closePdfViewer}>
            <X size={16} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {pdfLoading ? (
            <CircularProgress />
          ) : pdfBlobUrl ? (
            <iframe
              src={pdfBlobUrl}
              title={pdfTitle}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          ) : (
            <Typography color="error">Failed to load PDF</Typography>
          )}
        </DialogContent>
      </Dialog>
    </Paper>
  );
}

interface PatientsPageProps {
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

export function PatientsPage({ onNavigate }: PatientsPageProps) {
  const [patientList, setPatientList] = useState<PatientListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [patientSummary, setPatientSummary] = useState<PatientBase | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState<ResourceLoadingState>({
    documents: false, medications: false, procedures: false, observations: false,
  });
  const [rawBundles, setRawBundles] = useState<Record<string, unknown>>({});
  const [listError, setListError] = useState('');
  const [patientError, setPatientError] = useState('');
  const [search, setSearch] = useState('');
  const [allEvaluations, setAllEvaluations] = useState<Evaluation[]>([]);

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patientList;
    return patientList.filter(
      (p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [patientList, search]);

  // Load patient list and evaluations on mount
  useEffect(() => {
    setListLoading(true);
    fetchPatientList()
      .then((list) => {
        setPatientList(list);
        if (list.length > 0) setSelectedId(list[0].id);
      })
      .catch(() => setListError('Failed to load patient list from BFF.'))
      .finally(() => setListLoading(false));

    fetchEvaluations()
      .then(setAllEvaluations)
      .catch(() => {/* evaluations load is non-fatal */});
  }, []);

  // On patient select: fetch summary fast, then each resource independently
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    setPatientSummary(null);
    setSelectedPatient(null);
    setPatientError('');
    setRawBundles({});
    setSummaryLoading(true);
    setResourcesLoading({ documents: true, medications: true, procedures: true, observations: true });

    // Start all fetches in parallel
    const summaryReady = fetchPatientSummary(selectedId)
      .then((summary) => {
        if (cancelled) return;
        setPatientSummary(summary);
        setSummaryLoading(false);
        // Create base patient with empty resources so the UI can render immediately
        setSelectedPatient({
          ...summary,
          bmi: 0,
          conditions: [],
          medications: [],
          procedures: [],
          observations: [],
          notes: [],
          documents: [],
          coverages: [],
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPatientError(`Failed to load patient ${selectedId}.`);
          setSummaryLoading(false);
        }
      });

    // Fire resource fetches immediately; merge results after summary creates the base patient
    const docsP = fetchPatientDocuments(selectedId);
    const medsP = fetchPatientMedications(selectedId);
    const procsP = fetchPatientProcedures(selectedId);
    const obsP = fetchPatientObservations(selectedId);

    summaryReady.then(() => {
      docsP.then(({ mapped, raw }) => {
        if (cancelled) return;
        setSelectedPatient((prev) => prev ? { ...prev, documents: mapped } : prev);
        setRawBundles((prev) => ({ ...prev, documents: raw }));
        setResourcesLoading((prev) => ({ ...prev, documents: false }));
      }).catch(() => { if (!cancelled) setResourcesLoading((prev) => ({ ...prev, documents: false })); });

      medsP.then(({ mapped, raw }) => {
        if (cancelled) return;
        setSelectedPatient((prev) => prev ? { ...prev, medications: mapped } : prev);
        setRawBundles((prev) => ({ ...prev, medications: raw }));
        setResourcesLoading((prev) => ({ ...prev, medications: false }));
      }).catch(() => { if (!cancelled) setResourcesLoading((prev) => ({ ...prev, medications: false })); });

      procsP.then(({ mapped, raw }) => {
        if (cancelled) return;
        setSelectedPatient((prev) => prev ? { ...prev, procedures: mapped } : prev);
        setRawBundles((prev) => ({ ...prev, procedures: raw }));
        setResourcesLoading((prev) => ({ ...prev, procedures: false }));
      }).catch(() => { if (!cancelled) setResourcesLoading((prev) => ({ ...prev, procedures: false })); });

      obsP.then(({ mapped, raw, bmi }) => {
        if (cancelled) return;
        setSelectedPatient((prev) => prev ? { ...prev, observations: mapped, bmi } : prev);
        setRawBundles((prev) => ({ ...prev, observations: raw }));
        setResourcesLoading((prev) => ({ ...prev, observations: false }));
      }).catch(() => { if (!cancelled) setResourcesLoading((prev) => ({ ...prev, observations: false })); });
    });

    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <Box
      sx={{
        p: 3,
        width: '100%',
        boxSizing: 'border-box',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Page header */}
      <Box sx={{ mb: 2, flexShrink: 0 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Patients
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Patient records from Cerner EMR via FHIR R4
        </Typography>
      </Box>

      {listError && (
        <Alert severity="error" sx={{ mb: 2, flexShrink: 0 }}>
          {listError}
        </Alert>
      )}

      {/* Two-column layout — each column scrolls independently */}
      <Grid container spacing={2} sx={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* Patient list */}
        <Grid size={{ xs: 12, md: 4 }} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Search bar */}
          <TextField
            size="small"
            placeholder="Search patients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ mb: 1.5, flexShrink: 0 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={16} />
                  </InputAdornment>
                ),
              },
            }}
          />

          <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1, pr: 0.5 }}>
            {listLoading ? (
              <>
                {[1, 2, 3, 4, 5].map((i) => <PatientCardSkeleton key={i} />)}
              </>
            ) : filteredList.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No patients match "{search}"
              </Typography>
            ) : (
              filteredList.map((item) => (
                <PatientCard
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                  evaluations={allEvaluations}
                />
              ))
            )}
          </Box>
        </Grid>

        {/* Patient detail */}
        <Grid size={{ xs: 12, md: 8 }} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {patientError && (
            <Alert severity="error" sx={{ mb: 1, flexShrink: 0 }}>{patientError}</Alert>
          )}
          <Box sx={{ flex: 1, minHeight: 0 }}>
            {summaryLoading ? (
              <PatientDetailSkeleton />
            ) : patientSummary ? (
              <PatientDetail
                summary={patientSummary}
                patient={selectedPatient}
                resourcesLoading={resourcesLoading}
                rawBundles={rawBundles}
                onNavigate={onNavigate}
                evaluations={allEvaluations}
              />
            ) : null}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
