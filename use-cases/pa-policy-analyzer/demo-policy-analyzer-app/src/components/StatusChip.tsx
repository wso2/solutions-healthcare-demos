import { Chip } from '@wso2/oxygen-ui';
import type { ClauseStatus, EvaluationStatus } from '../data/types';

interface ClauseStatusChipProps {
  status: ClauseStatus;
  size?: 'small' | 'medium';
}

const clauseConfig: Record<ClauseStatus, { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
  satisfied: { label: 'Documented', color: 'success' },
  insufficient: { label: 'Gap', color: 'error' },
  needs_review: { label: 'Needs Documentation', color: 'warning' },
  not_applicable: { label: 'N/A', color: 'default' },
};

export function ClauseStatusChip({ status, size = 'small' }: ClauseStatusChipProps) {
  const config = clauseConfig[status];
  return <Chip label={config.label} color={config.color} size={size} />;
}

interface EvalStatusChipProps {
  status: EvaluationStatus;
  size?: 'small' | 'medium';
}

const evalConfig: Record<EvaluationStatus, { label: string; color: 'success' | 'error' | 'warning' }> = {
  approved: { label: 'Criteria Met', color: 'success' },
  denied: { label: 'Ineligible', color: 'error' },
  pending_review: { label: 'Gaps Found', color: 'warning' },
};

export function EvalStatusChip({ status, size = 'small' }: EvalStatusChipProps) {
  const config = evalConfig[status];
  return <Chip label={config.label} color={config.color} size={size} />;
}
