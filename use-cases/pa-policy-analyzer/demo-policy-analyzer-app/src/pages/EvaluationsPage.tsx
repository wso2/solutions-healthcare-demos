import { useState, useMemo, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  ListingTable,
  Chip,
  CircularProgress,
  Alert,
} from '@wso2/oxygen-ui';
import { Plus, ArrowRight, AlertCircle } from '@wso2/oxygen-ui-icons-react';
import { fetchEvaluations } from '../api/evaluations';
import { EvalStatusChip } from '../components/StatusChip';
import type { Evaluation, EvaluationStatus } from '../data/types';

interface EvaluationsPageProps {
  onNavigate: (page: string, params?: Record<string, string>) => void;
}

const statusFilters: { label: string; value: EvaluationStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Criteria Met', value: 'approved' },
  { label: 'Gaps Found', value: 'pending_review' },
  { label: 'Ineligible', value: 'denied' },
];

type EvalWithGap = Evaluation & { _gap_count?: number; _raw_status?: string };

export function EvaluationsPage({ onNavigate }: EvaluationsPageProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<EvaluationStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [evaluations, setEvaluations] = useState<EvalWithGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchEvaluations()
      .then((data) => {
        setEvaluations(data as EvalWithGap[]);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return evaluations
      .filter((e) => {
        const matchesSearch =
          !search ||
          e.patient_name.toLowerCase().includes(search.toLowerCase()) ||
          e.cpt_code.includes(search) ||
          e.payer.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [evaluations, search, statusFilter]);

  const paginated = filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={600} gutterBottom>
            Evaluations
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gap analysis and documentation requirements for prior authorization requests
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus size={16} />}
          onClick={() => onNavigate('new-evaluation')}
        >
          New Evaluation
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load evaluations: {error}
        </Alert>
      )}

      {/* Status filter chips */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {statusFilters.map((f) => (
          <Chip
            key={f.value}
            label={`${f.label}${f.value !== 'all' ? ` (${evaluations.filter((e) => e.status === f.value).length})` : ` (${evaluations.length})`}`}
            onClick={() => setStatusFilter(f.value)}
            color={statusFilter === f.value ? 'primary' : 'default'}
            variant={statusFilter === f.value ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <ListingTable.Provider
          searchValue={search}
          onSearchChange={setSearch}
          page={page}
          rowsPerPage={rowsPerPage}
          totalCount={filtered.length}
          onPageChange={setPage}
          onRowsPerPageChange={setRowsPerPage}
        >
          <ListingTable.Container>
            <ListingTable.Toolbar
              showSearch
              searchPlaceholder="Search by patient, CPT code, or payer..."
            />

            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Patient</ListingTable.Cell>
                  <ListingTable.Cell>CPT Code</ListingTable.Cell>
                  <ListingTable.Cell>Payer</ListingTable.Cell>
                  <ListingTable.Cell>Status</ListingTable.Cell>
                  <ListingTable.Cell>Open Gaps</ListingTable.Cell>
                  <ListingTable.Cell>Reviewer</ListingTable.Cell>
                  <ListingTable.Cell>Date</ListingTable.Cell>
                  <ListingTable.Cell align="right"></ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>

              <ListingTable.Body>
                {paginated.length === 0 ? (
                  <ListingTable.Row>
                    <ListingTable.Cell colSpan={8}>
                      <ListingTable.EmptyState title="No evaluations match your search" />
                    </ListingTable.Cell>
                  </ListingTable.Row>
                ) : (
                  paginated.map((ev) => {
                    const gaps = ev._gap_count ?? 0;
                    const isInProgress = ev._raw_status === 'in_progress';
                    return (
                      <ListingTable.Row
                        key={ev.id}
                        onClick={() => !isInProgress && onNavigate('evaluation-detail', { id: ev.id })}
                        sx={{ cursor: isInProgress ? 'default' : 'pointer', opacity: isInProgress ? 0.7 : 1 }}
                      >
                        <ListingTable.Cell>
                          <Typography variant="body2" fontWeight={500}>
                            {ev.patient_name}
                          </Typography>
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {ev.cpt_code}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {ev.cpt_description}
                            </Typography>
                          </Box>
                        </ListingTable.Cell>
                        <ListingTable.Cell>{ev.payer}</ListingTable.Cell>
                        <ListingTable.Cell>
                          {isInProgress ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <CircularProgress size={14} />
                              <Typography variant="caption" color="text.secondary">Evaluating...</Typography>
                            </Box>
                          ) : (
                            <EvalStatusChip status={ev.status} />
                          )}
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          {isInProgress ? (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          ) : gaps > 0 ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AlertCircle
                                size={14}
                                color={ev.status === 'denied' ? '#ef4444' : '#f59e0b'}
                              />
                              <Typography
                                variant="caption"
                                fontWeight={600}
                                color={ev.status === 'denied' ? 'error.main' : 'warning.main'}
                              >
                                {gaps} {gaps === 1 ? 'item' : 'items'}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              —
                            </Typography>
                          )}
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <Typography variant="caption" color="text.secondary">
                            {ev.reviewer ?? '—'}
                          </Typography>
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(ev.timestamp).toLocaleDateString()}
                          </Typography>
                        </ListingTable.Cell>
                        <ListingTable.Cell align="right">
                          <ArrowRight size={16} />
                        </ListingTable.Cell>
                      </ListingTable.Row>
                    );
                  })
                )}
              </ListingTable.Body>

              <ListingTable.Footer />
            </ListingTable>
          </ListingTable.Container>
        </ListingTable.Provider>
      )}
    </Box>
  );
}
