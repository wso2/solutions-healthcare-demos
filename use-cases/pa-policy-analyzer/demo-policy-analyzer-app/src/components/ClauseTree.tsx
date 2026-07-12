import { useState } from 'react';
import { Box, Typography, Chip } from '@wso2/oxygen-ui';
import { ChevronRight, ChevronDown } from '@wso2/oxygen-ui-icons-react';
import type { PolicyClause, EvaluationResult, ClauseStatus } from '../data/types';

const clauseTypeColors: Record<string, string> = {
  diagnosis: '#3b82f6',
  duration: '#8b5cf6',
  trial_failure: '#f59e0b',
  imaging: '#06b6d4',
  exclusion: '#ef4444',
  // DB clause types
  condition: '#3b82f6',
  requirement: '#22c55e',
  group: '#6b7280',
};

const clauseTypeLabels: Record<string, string> = {
  diagnosis: 'Dx',
  duration: 'Duration',
  trial_failure: 'Trial',
  imaging: 'Imaging',
  exclusion: 'Exclusion',
  // DB clause types
  condition: 'Condition',
  requirement: 'Required',
  group: 'Group',
};

const statusDotColor: Record<ClauseStatus, string> = {
  satisfied: '#22c55e',
  insufficient: '#ef4444',
  needs_review: '#f59e0b',
  not_applicable: '#9ca3af',
};

interface ClauseNodeProps {
  clause: PolicyClause;
  results: EvaluationResult[];
  selectedClauseId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}

function ClauseNode({ clause, results, selectedClauseId, onSelect, depth = 0 }: ClauseNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = clause.children && clause.children.length > 0;
  const result = results.find((r) => r.clause_id === clause.id);
  const isSelected = selectedClauseId === clause.id;

  return (
    <Box>
      <Box
        onClick={() => {
          if (hasChildren) setExpanded(!expanded);
          onSelect(clause.id);
        }}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          py: 0.75,
          px: 1,
          pl: depth * 2 + 1,
          borderRadius: 1,
          cursor: 'pointer',
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' },
          transition: 'background-color 0.15s',
        }}
      >
        <Box sx={{ mt: 0.4, minWidth: 16 }}>
          {hasChildren ? (
            expanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <Box sx={{ width: 14 }} />
          )}
        </Box>

        {result && (
          <Box
            sx={{
              mt: 0.6,
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: statusDotColor[result.status],
              flexShrink: 0,
            }}
          />
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontSize: '0.75rem',
              lineHeight: 1.4,
              fontWeight: isSelected ? 600 : 400,
              color: 'text.primary',
            }}
          >
            {clause.text}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.3, flexWrap: 'wrap' }}>
            <Chip
              label={clauseTypeLabels[clause.type]}
              size="small"
              sx={{
                height: 16,
                fontSize: '0.6rem',
                bgcolor: clauseTypeColors[clause.type] + '22',
                color: clauseTypeColors[clause.type],
                border: `1px solid ${clauseTypeColors[clause.type]}44`,
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
            {clause.logical_operator && hasChildren && (
              <Chip
                label={clause.logical_operator}
                size="small"
                sx={{
                  height: 16,
                  fontSize: '0.6rem',
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            )}
          </Box>
        </Box>
      </Box>

      {hasChildren && expanded && (
        <Box sx={{ borderLeft: '2px solid', borderColor: 'divider', ml: depth * 2 + 2 }}>
          {clause.children!.map((child) => (
            <ClauseNode
              key={child.id}
              clause={child}
              results={results}
              selectedClauseId={selectedClauseId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

interface ClauseTreeProps {
  clauses: PolicyClause[];
  results: EvaluationResult[];
  selectedClauseId: string | null;
  onSelect: (id: string) => void;
}

export function ClauseTree({ clauses, results, selectedClauseId, onSelect }: ClauseTreeProps) {
  return (
    <Box>
      {clauses.map((clause) => (
        <ClauseNode
          key={clause.id}
          clause={clause}
          results={results}
          selectedClauseId={selectedClauseId}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </Box>
  );
}
