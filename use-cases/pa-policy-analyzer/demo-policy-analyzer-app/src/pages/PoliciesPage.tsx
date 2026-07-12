import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Divider,
  TextField,
  InputAdornment,
  CircularProgress,
} from '@wso2/oxygen-ui';
import {
  Shield,
  ChevronRight,
  ChevronDown,
  FileText,
  ClipboardList,
  Search,
  RefreshCw,
  CheckCircle,
  Loader,
} from '@wso2/oxygen-ui-icons-react';
import {
  fetchPayers,
  fetchPayerCodes,
  fetchCodePolicy,
  type Payer,
  type PolicyCode,
  type PolicyDetail,
  type CoverageClause,
} from '../api/policies';
import {
  resyncPayer,
  fetchOnboardingStatus,
  type OnboardingStatus,
} from '../api/payerOnboarding';

// ─── Payer accent palette ────────────────────────────────────────────────────
const PAYER_COLORS: { border: string; bg: string; icon: string; badge: string }[] = [
  { border: '#2563eb', bg: '#eff6ff', icon: '#2563eb', badge: '#dbeafe' },
  { border: '#7c3aed', bg: '#f5f3ff', icon: '#7c3aed', badge: '#ede9fe' },
  { border: '#0891b2', bg: '#ecfeff', icon: '#0891b2', badge: '#cffafe' },
  { border: '#16a34a', bg: '#f0fdf4', icon: '#16a34a', badge: '#dcfce7' },
  { border: '#dc2626', bg: '#fef2f2', icon: '#dc2626', badge: '#fecaca' },
  { border: '#ea580c', bg: '#fff7ed', icon: '#ea580c', badge: '#fed7aa' },
  { border: '#9333ea', bg: '#faf5ff', icon: '#9333ea', badge: '#e9d5ff' },
  { border: '#0d9488', bg: '#f0fdfa', icon: '#0d9488', badge: '#ccfbf1' },
];
const defaultColor = { border: '#6b7280', bg: '#f9fafb', icon: '#6b7280', badge: '#f3f4f6' };
function payerColor(index: number) {
  return PAYER_COLORS[index % PAYER_COLORS.length] ?? defaultColor;
}

// ─── Clause type styling ─────────────────────────────────────────────────────
const clauseTypeStyles: Record<string, { bg: string; color: string; label: string }> = {
  requirement: { bg: '#dcfce7', color: '#15803d', label: 'Requirement' },
  exclusion:   { bg: '#fee2e2', color: '#b91c1c', label: 'Exclusion' },
  group:       { bg: '#dbeafe', color: '#1d4ed8', label: 'Group' },
  condition:   { bg: '#fef3c7', color: '#b45309', label: 'Condition' },
};

// ─── Build clause tree from flat list ────────────────────────────────────────
interface ClauseNode extends CoverageClause {
  children: ClauseNode[];
}

function buildClauseTree(clauses: CoverageClause[]): ClauseNode[] {
  const map = new Map<string, ClauseNode>();
  const roots: ClauseNode[] = [];
  for (const c of clauses) {
    map.set(c.id, { ...c, children: [] });
  }
  for (const c of clauses) {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ─── ClauseItem (recursive) ─────────────────────────────────────────────────
function ClauseItem({ node, depth = 0 }: { node: ClauseNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const style = clauseTypeStyles[node.clauseType] ?? clauseTypeStyles.condition;

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          p: 1,
          pl: depth === 0 ? 1 : depth * 2 + 1,
          borderRadius: 1,
          cursor: hasChildren ? 'pointer' : 'default',
          '&:hover': hasChildren ? { bgcolor: 'action.hover' } : {},
        }}
        onClick={() => hasChildren && setExpanded((v) => !v)}
      >
        {hasChildren ? (
          <Box sx={{ mt: 0.3, flexShrink: 0 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </Box>
        ) : (
          <Box sx={{ width: 14, flexShrink: 0 }} />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              label={style.label}
              size="small"
              sx={{
                height: 18, fontSize: '0.62rem',
                bgcolor: style.bg, color: style.color,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
            {node.logicalOperator && (
              <Chip
                label={node.logicalOperator}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.62rem', '& .MuiChip-label': { px: 0.75 } }}
              />
            )}
          </Box>
          <Typography variant="body2" sx={{ mt: 0.5, fontSize: '0.8rem', lineHeight: 1.5 }}>
            {node.clauseText}
          </Typography>
        </Box>
      </Box>
      {hasChildren && expanded && (
        <Box sx={{ ml: depth * 2 + 2, borderLeft: '2px solid', borderColor: 'divider' }}>
          {node.children.map((child) => (
            <ClauseItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Breadcrumb ──────────────────────────────────────────────────────────────
interface Crumb { label: string; onClick: () => void }

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 2.5, flexWrap: 'wrap' }}>
      {crumbs.map((c, i) => (
        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {i > 0 && <ChevronRight size={14} color="#9ca3af" />}
          <Typography
            variant="body2"
            onClick={c.onClick}
            sx={{
              fontSize: '0.8rem',
              color: i === crumbs.length - 1 ? 'text.primary' : 'primary.main',
              fontWeight: i === crumbs.length - 1 ? 600 : 400,
              cursor: i === crumbs.length - 1 ? 'default' : 'pointer',
              '&:hover': i === crumbs.length - 1 ? {} : { textDecoration: 'underline' },
            }}
          >
            {c.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// ─── Loading / Error helpers ─────────────────────────────────────────────────
function Loading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={28} />
    </Box>
  );
}

function ErrorMsg({ message }: { message: string }) {
  return (
    <Typography variant="body2" color="error.main" sx={{ py: 4, textAlign: 'center' }}>
      {message}
    </Typography>
  );
}

// ─── Resync status labels ───────────────────────────────────────────────────
const RESYNC_LABELS: Record<string, string> = {
  connecting: 'Connecting...',
  authenticating: 'Authenticating...',
  scanning: 'Scanning for new policies...',
  fetching: 'Fetching new PDFs...',
  converting: 'Extracting policy structure...',
};

// ─── View 1: Payer Selection ─────────────────────────────────────────────────
function PayerSelectView({ onSelect }: { onSelect: (payer: Payer, idx: number) => void }) {
  const [payers, setPayers] = useState<Payer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPayers()
      .then(setPayers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (payers.length === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No payers onboarded yet. Use "Onboard Payer" to add one.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={600} gutterBottom>
          Payer Policies
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Select a payer to browse their coverage policies and CPT codes.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
          gap: 1.5,
        }}
      >
        {payers.map((payer, i) => {
          const colors = payerColor(i);
          return (
            <Paper
              key={payer.id}
              elevation={0}
              onClick={() => onSelect(payer, i)}
              sx={{
                p: 2,
                border: 2,
                borderColor: 'divider',
                borderRadius: 2,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                '&:hover': { borderColor: colors.border, bgcolor: colors.bg },
                transition: 'all 0.12s',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 40, height: 40, borderRadius: 1.5,
                    bgcolor: colors.badge,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}
                >
                  <Shield size={20} color={colors.icon} />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3, fontSize: '0.85rem' }} noWrap>
                    {payer.name}
                  </Typography>
                </Box>
                <ChevronRight size={16} color="#9ca3af" />
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Chip
                  label={`${payer.policyCount} polic${payer.policyCount === 1 ? 'y' : 'ies'}`}
                  size="small"
                  sx={{ height: 18, fontSize: '0.6rem', bgcolor: colors.badge, color: colors.icon, '& .MuiChip-label': { px: 0.75 } }}
                />
                <Chip
                  label={`${payer.codeCount} codes`}
                  size="small"
                  variant="outlined"
                  sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.75 } }}
                />
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── View 2: CPT Code Selection ──────────────────────────────────────────────
function CodeSelectView({
  payer,
  colorIdx,
  onSelect,
  onBack,
}: {
  payer: Payer;
  colorIdx: number;
  onSelect: (code: PolicyCode) => void;
  onBack: () => void;
}) {
  const [codes, setCodes] = useState<PolicyCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  // Resync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncResult, setSyncResult] = useState<{ newCount: number; skippedCount: number } | null>(null);

  const loadCodes = useCallback(() => {
    setLoading(true);
    fetchPayerCodes(payer.id)
      .then(setCodes)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [payer.id]);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const handleResync = async () => {
    if (syncing) return;

    setSyncing(true);
    setSyncStatus('Starting sync...');
    setSyncResult(null);

    try {
      const { jobId } = await resyncPayer(payer.id);

      // Poll until done
      const finalStatus = await new Promise<OnboardingStatus>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const status = await fetchOnboardingStatus(jobId);
            setSyncStatus(RESYNC_LABELS[status.status] ?? status.status);
            if (status.status === 'done') {
              clearInterval(interval);
              resolve(status);
            } else if (status.status === 'error') {
              clearInterval(interval);
              reject(new Error(status.errorMessage ?? 'Sync failed'));
            }
          } catch (err) {
            clearInterval(interval);
            reject(err);
          }
        }, 600);
      });

      const newCount = finalStatus.pdfs.filter((p) => p.pdfStatus !== 'skipped').length;
      setSyncResult({ newCount, skippedCount: finalStatus.skippedCount });
      setSyncStatus('');
      setSyncing(false);

      // Refresh code list if new policies were added
      if (newCount > 0) {
        loadCodes();
      }
    } catch (err) {
      setSyncStatus(err instanceof Error ? err.message : 'Sync failed');
      setTimeout(() => {
        setSyncing(false);
        setSyncStatus('');
      }, 3000);
    }
  };

  const colors = payerColor(colorIdx);

  const filtered = query.trim()
    ? codes.filter(
        (c) =>
          c.code.toLowerCase().includes(query.toLowerCase()) ||
          (c.description ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : codes;

  // Group by code type
  const grouped = new Map<string, PolicyCode[]>();
  for (const c of filtered) {
    const arr = grouped.get(c.codeType) ?? [];
    arr.push(c);
    grouped.set(c.codeType, arr);
  }

  return (
    <Box>
      <Breadcrumb
        crumbs={[
          { label: 'Payers', onClick: onBack },
          { label: payer.name, onClick: () => {} },
        ]}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Box
          sx={{
            width: 44, height: 44, borderRadius: 2, bgcolor: colors.badge,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <Shield size={22} color={colors.icon} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={600}>{payer.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            Select a code to view its coverage policy and clause tree.
          </Typography>
        </Box>
        <Chip
          icon={
            syncing
              ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
              : <RefreshCw size={14} />
          }
          label={syncing ? 'Syncing...' : 'Sync Policies'}
          size="small"
          onClick={handleResync}
          disabled={syncing}
          sx={{
            height: 28,
            fontSize: '0.72rem',
            fontWeight: 500,
            cursor: syncing ? 'default' : 'pointer',
            bgcolor: syncing ? '#eff6ff' : 'transparent',
            border: '1px solid',
            borderColor: syncing ? 'primary.light' : colors.border + '88',
            color: syncing ? 'primary.main' : colors.icon,
            '& .MuiChip-label': { px: 1 },
            '& .MuiChip-icon': { ml: 0.75 },
            '&:hover': syncing ? {} : { bgcolor: colors.bg, borderColor: colors.border },
            flexShrink: 0,
          }}
        />
      </Box>

      {/* Sync progress / result banner */}
      {syncing && syncStatus && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, mb: 2,
            border: 1, borderColor: 'primary.light', borderRadius: 2, bgcolor: '#eff6ff',
          }}
        >
          <Loader size={14} color="#2563eb" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
          <Typography variant="body2" color="primary.main" fontWeight={500} sx={{ fontSize: '0.82rem' }}>
            {syncStatus}
          </Typography>
        </Paper>
      )}
      {syncResult && (
        <Paper
          elevation={0}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, mb: 2,
            border: 1,
            borderColor: syncResult.newCount > 0 ? '#86efac' : 'divider',
            borderRadius: 2,
            bgcolor: syncResult.newCount > 0 ? '#f0fdf4' : '#f9fafb',
          }}
        >
          <CheckCircle size={14} color={syncResult.newCount > 0 ? '#16a34a' : '#9ca3af'} />
          <Typography
            variant="body2"
            color={syncResult.newCount > 0 ? '#15803d' : 'text.secondary'}
            fontWeight={500}
            sx={{ fontSize: '0.82rem' }}
          >
            {syncResult.newCount > 0
              ? `${syncResult.newCount} new polic${syncResult.newCount === 1 ? 'y' : 'ies'} synced`
              : 'Already up to date — no new policies found'}
            {syncResult.skippedCount > 0 && ` · ${syncResult.skippedCount} existing polic${syncResult.skippedCount === 1 ? 'y' : 'ies'} unchanged`}
          </Typography>
        </Paper>
      )}

      <TextField
        fullWidth
        size="small"
        placeholder="Search by code or description..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search size={16} color="#9ca3af" />
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2, maxWidth: 480 }}
      />

      {loading && <Loading />}
      {error && <ErrorMsg message={error} />}
      {!loading && !error && codes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No codes found for this payer.
        </Typography>
      )}

      {Array.from(grouped.entries()).map(([codeType, typeCodes]) => (
        <Box key={codeType} sx={{ mb: 2.5 }}>
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: colors.icon }}>
            {codeType} Codes
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 1,
            }}
          >
            {typeCodes.map((code) => (
              <Box
                key={code.id}
                onClick={() => onSelect(code)}
                sx={{
                  p: 1.5,
                  border: 2,
                  borderColor: colors.border + '55',
                  borderRadius: 2,
                  bgcolor: colors.bg,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  '&:hover': { borderColor: colors.border, filter: 'brightness(0.97)' },
                  transition: 'all 0.12s',
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace', color: colors.icon }}>
                      {code.code}
                    </Typography>
                    <Chip
                      label={codeType}
                      size="small"
                      sx={{ height: 16, fontSize: '0.58rem', bgcolor: colors.badge, color: colors.icon, '& .MuiChip-label': { px: 0.5 } }}
                    />
                  </Box>
                  {code.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35 }}>
                      {code.description.length > 80 ? code.description.substring(0, 80) + '...' : code.description}
                    </Typography>
                  )}
                </Box>
                <ChevronRight size={16} color={colors.icon} />
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

// ─── View 3: Policy Detail with Clause Tree ─────────────────────────────────
function PolicyDetailView({
  payer,
  code,
  colorIdx,
  onBack,
  onBackToPayer,
}: {
  payer: Payer;
  code: PolicyCode;
  colorIdx: number;
  onBack: () => void;
  onBackToPayer: () => void;
}) {
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDetail = useCallback(() => {
    setLoading(true);
    setError('');
    fetchCodePolicy(code.code)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code.code]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const colors = payerColor(colorIdx);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!detail) return null;

  const clauseTree = buildClauseTree(detail.policy.clauses);

  const totalClauses = (nodes: ClauseNode[]): number =>
    nodes.reduce((acc, n) => acc + 1 + totalClauses(n.children), 0);

  return (
    <Box>
      <Breadcrumb
        crumbs={[
          { label: 'Payers', onClick: onBackToPayer },
          { label: payer.name, onClick: onBack },
          { label: `${code.codeType} ${code.code}`, onClick: () => {} },
        ]}
      />

      {/* Policy header */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 2, border: 2, borderColor: colors.border, borderRadius: 2, bgcolor: colors.bg }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 2, bgcolor: colors.badge, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Shield size={22} color={colors.icon} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={600}>{detail.policy.policyName}</Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {code.description}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
              <Chip label={`${totalClauses(clauseTree)} coverage criteria`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
              <Chip label={`${detail.policy.relatedCodes.length} related codes`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
              {detail.policy.relatedCodes.map((rc) => (
                <Chip
                  key={rc.id}
                  label={`${rc.codeType} ${rc.code}`}
                  size="small"
                  sx={{
                    height: 20, fontSize: '0.65rem',
                    bgcolor: rc.code === code.code ? colors.badge : 'transparent',
                    color: rc.code === code.code ? colors.icon : 'text.secondary',
                    border: '1px solid',
                    borderColor: rc.code === code.code ? colors.icon + '88' : 'divider',
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />
              ))}
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Coverage Criteria (clause tree) */}
      {clauseTree.length > 0 && (
        <Paper elevation={0} sx={{ mb: 2, border: 2, borderColor: '#86efac', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f0fdf4' }}>
            <ClipboardList size={16} color="#16a34a" />
            <Typography variant="body2" fontWeight={600}>Coverage Criteria</Typography>
            <Chip
              label={`${clauseTree.length} top-level · ${totalClauses(clauseTree)} total`}
              size="small"
              sx={{ height: 16, fontSize: '0.58rem', ml: 0.5, bgcolor: '#dcfce7', color: '#15803d', '& .MuiChip-label': { px: 0.75 } }}
            />
            <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
              {Object.entries(clauseTypeStyles).map(([type, cfg]) => (
                <Chip
                  key={type}
                  label={cfg.label}
                  size="small"
                  sx={{ height: 15, fontSize: '0.57rem', bgcolor: cfg.bg, color: cfg.color, '& .MuiChip-label': { px: 0.5 } }}
                />
              ))}
            </Box>
          </Box>
          <Box sx={{ p: 1.5 }}>
            {clauseTree.map((node, i) => (
              <Box key={node.id}>
                <ClauseItem node={node} depth={0} />
                {i < clauseTree.length - 1 && <Divider sx={{ my: 0.5 }} />}
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* Medical Records Reference */}
      {detail.policy.medicalRecordsRef && (
        <Paper elevation={0} sx={{ border: 2, borderColor: '#fcd34d', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#fffbeb' }}>
            <FileText size={16} color="#b45309" />
            <Typography variant="body2" fontWeight={600}>Required Documentation</Typography>
          </Box>
          <Box sx={{ p: 2 }}>
            <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
              Medical record documentation requirements are defined in:{' '}
              <Typography component="span" variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {detail.policy.medicalRecordsRef}
              </Typography>
            </Typography>
          </Box>
        </Paper>
      )}
    </Box>
  );
}

// ─── Root page ───────────────────────────────────────────────────────────────
type View = 'payer-select' | 'code-select' | 'policy-detail';

export function PoliciesPage() {
  const [view, setView] = useState<View>('payer-select');
  const [selectedPayer, setSelectedPayer] = useState<Payer | null>(null);
  const [selectedCode, setSelectedCode] = useState<PolicyCode | null>(null);
  const [colorIdx, setColorIdx] = useState(0);

  const handleSelectPayer = (payer: Payer, idx: number) => {
    setSelectedPayer(payer);
    setColorIdx(idx);
    setSelectedCode(null);
    setView('code-select');
  };

  const handleSelectCode = (code: PolicyCode) => {
    setSelectedCode(code);
    setView('policy-detail');
  };

  return (
    <Box sx={{ p: 3, width: '100%', boxSizing: 'border-box' }}>
      {view === 'payer-select' && (
        <PayerSelectView onSelect={handleSelectPayer} />
      )}

      {view === 'code-select' && selectedPayer && (
        <CodeSelectView
          payer={selectedPayer}
          colorIdx={colorIdx}
          onSelect={handleSelectCode}
          onBack={() => setView('payer-select')}
        />
      )}

      {view === 'policy-detail' && selectedPayer && selectedCode && (
        <PolicyDetailView
          payer={selectedPayer}
          code={selectedCode}
          colorIdx={colorIdx}
          onBack={() => setView('code-select')}
          onBackToPayer={() => setView('payer-select')}
        />
      )}
    </Box>
  );
}
