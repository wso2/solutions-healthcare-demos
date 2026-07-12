import { useState } from 'react';
import { Box, Typography, Chip, Tabs, Tab, Paper, Button, Dialog, DialogTitle, DialogContent, IconButton, CircularProgress } from '@wso2/oxygen-ui';
import { X } from '@wso2/oxygen-ui-icons-react';
import { documentProxyUrl, fetchBinaryBlobUrl } from '../api/bff';
import type { Patient } from '../data/types';

interface PatientPanelProps {
  patient: Patient;
  highlightedDocId?: string | null;
  rawBundles?: Record<string, unknown>;
  resourcesLoading?: { documents?: boolean; medications?: boolean; procedures?: boolean; coverages?: boolean };
}

export function PatientPanel({ patient, highlightedDocId, rawBundles, resourcesLoading }: PatientPanelProps) {
  const [tab, setTab] = useState(0);
  const [showJson, setShowJson] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);

  const isHighlighted = (id: string) => highlightedDocId === id;

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

  const highlightSx = {
    border: '2px solid',
    borderColor: 'primary.main',
    bgcolor: 'primary.50',
  };

  const tabKeys = ['documents', 'medications', 'procedures', 'coverages'] as const;
  const currentTabKey = tabKeys[tab];
  const isTabLoading = resourcesLoading?.[currentTabKey] ?? false;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Patient Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {patient.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {patient.age}y {patient.gender} · MRN: {patient.mrn} · {patient.insurance}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
          <Chip label={`BMI ${patient.bmi}`} size="small" variant="outlined" />
          <Chip label={`DOB ${patient.dob}`} size="small" variant="outlined" />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v as number)}
          sx={{ flex: 1, minHeight: 36 }}
          TabIndicatorProps={{ style: { height: 2 } }}
        >
          <Tab label="Documents" sx={{ minHeight: 36, fontSize: '0.7rem', py: 0 }} />
          <Tab label="Medications" sx={{ minHeight: 36, fontSize: '0.7rem', py: 0 }} />
          <Tab label="Procedures" sx={{ minHeight: 36, fontSize: '0.7rem', py: 0 }} />
          <Tab label="Coverage" sx={{ minHeight: 36, fontSize: '0.7rem', py: 0 }} />
        </Tabs>
        {rawBundles && (
          <Button
            size="small"
            variant={showJson ? 'contained' : 'outlined'}
            onClick={() => setShowJson(!showJson)}
            sx={{ fontSize: '0.6rem', minHeight: 22, py: 0.25, px: 1, mr: 1, textTransform: 'none', flexShrink: 0 }}
          >
            {showJson ? 'List View' : 'Raw JSON'}
          </Button>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {isTabLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="caption" color="text.secondary">Loading…</Typography>
          </Box>
        ) : showJson && rawBundles ? (
          <Box sx={{ bgcolor: 'grey.50', borderRadius: 1, p: 1.5, overflow: 'auto' }}>
            <pre style={{ margin: 0, fontSize: '0.65rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
              {JSON.stringify(rawBundles[currentTabKey] ?? {}, null, 2)}
            </pre>
          </Box>
        ) : (
          <>
            {tab === 0 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {patient.documents.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No documents found
                  </Typography>
                ) : (
                  patient.documents.map((d) => {
                    const isPdf = d.contentType === 'application/pdf';
                    const isText = d.contentType.startsWith('text/') || !!d.textContent;
                    return (
                      <Paper
                        key={d.id}
                        elevation={0}
                        sx={{
                          p: 1.25,
                          border: 1,
                          borderColor: 'divider',
                          borderRadius: 1,
                          ...(isHighlighted(d.id) ? highlightSx : {}),
                          transition: 'border-color 0.2s, background-color 0.2s',
                        }}
                      >
                        <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.75rem' }} noWrap>
                          {d.description || d.type}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, alignItems: 'center' }}>
                          <Chip label={d.type} size="small" sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }} />
                          <Typography variant="caption" color="text.secondary">
                            {d.date}
                          </Typography>
                        </Box>
                        {isText && d.textContent && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            sx={{
                              mt: 0.5,
                              fontSize: '0.68rem',
                              lineHeight: 1.5,
                              maxHeight: 60,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {d.textContent}
                          </Typography>
                        )}
                        {isPdf && d.url && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              const parts = d.url!.split('/');
                              const binaryIdx = parts.indexOf('Binary');
                              const resourceId = binaryIdx >= 0 && binaryIdx < parts.length - 1 ? parts[binaryIdx + 1] : parts[parts.length - 1];
                              openPdfViewer(resourceId, d.description || d.type);
                            }}
                            sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.6rem', minHeight: 20, py: 0.25 }}
                          >
                            View PDF
                          </Button>
                        )}
                        {!isText && !isPdf && d.url && (
                          <Button
                            size="small"
                            variant="outlined"
                            href={documentProxyUrl(d.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.6rem', minHeight: 20, py: 0.25 }}
                          >
                            Download
                          </Button>
                        )}
                      </Paper>
                    );
                  })
                )}
              </Box>
            )}

            {tab === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {patient.medications.map((m) => (
                  <Paper
                    key={m.id}
                    elevation={0}
                    sx={{
                      p: 1.25,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      ...(isHighlighted(m.id) ? highlightSx : {}),
                      transition: 'border-color 0.2s, background-color 0.2s',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.75rem' }}>
                        {m.name}
                      </Typography>
                      <Chip
                        label={m.status}
                        size="small"
                        color={m.status === 'active' ? 'success' : 'default'}
                        sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }}
                      />
                    </Box>
                    {m.reason && (
                      <Typography variant="caption" color="text.secondary">
                        {m.reason}
                      </Typography>
                    )}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {m.start}{m.end ? ` → ${m.end}` : ' → present'}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            )}

            {tab === 2 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {patient.procedures.map((p) => (
                  <Paper
                    key={p.id}
                    elevation={0}
                    sx={{
                      p: 1.25,
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                      ...(isHighlighted(p.id) ? highlightSx : {}),
                      transition: 'border-color 0.2s, background-color 0.2s',
                    }}
                  >
                    <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.75rem' }}>
                      {p.display}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, alignItems: 'center' }}>
                      <Chip label={p.code} size="small" sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }} />
                      <Typography variant="caption" color="text.secondary">
                        {p.date}
                      </Typography>
                      {p.durationWeeks && (
                        <Chip
                          label={`${p.durationWeeks}w`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }}
                        />
                      )}
                    </Box>
                    {p.outcome && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                        {p.outcome}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            )}

            {tab === 3 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {patient.coverages.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    No coverage information found
                  </Typography>
                ) : (
                  patient.coverages.map((c) => (
                    <Paper
                      key={c.id}
                      elevation={0}
                      sx={{
                        p: 1.25,
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        ...(isHighlighted(c.id) ? highlightSx : {}),
                        transition: 'border-color 0.2s, background-color 0.2s',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Typography variant="body2" fontWeight={500} sx={{ fontSize: '0.75rem' }}>
                          {c.payer}
                        </Typography>
                        <Chip
                          label={c.status}
                          size="small"
                          color={c.status === 'active' ? 'success' : 'default'}
                          sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }}
                        />
                      </Box>
                      {c.subscriberId && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Subscriber: {c.subscriberId}
                        </Typography>
                      )}
                      {c.relationship && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          Relationship: {c.relationship}
                        </Typography>
                      )}
                      {c.period && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
                          {c.period.start ?? '?'} → {c.period.end ?? 'present'}
                        </Typography>
                      )}
                    </Paper>
                  ))
                )}
              </Box>
            )}
          </>
        )}
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
    </Box>
  );
}
