#!/usr/bin/env bash
# Evaluation scores from WSO2 Agent Manager, side by side: one column per review (amp-evaluations.sh --label …),
# one row per agent and evaluator, each the mean score over that review's traces (0–1; "skip" when every
# trace was skipped). Use it to compare models on the same assessment.
#
#   ./scripts/amp-scores.sh deepseek-v4-1-flash glm-5-3     # the labelled reviews to compare
#   ./scripts/amp-scores.sh                                  # the continuous monitors, last 24 h
set -euo pipefail
cd "$(dirname "$0")/.."

API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
PROJECT="${AMP_PROJECT:-longevity-clinic}"
AGENTS=(diagnostic-copilot results-analyst care-planner)
case "${1:-}" in -h|--help) sed -n '2,8p' "$0"; exit 0 ;; esac

TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=amp:monitor:read amp:monitor:score-read" "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || { echo "could not get an admin token from $THUNDER" >&2; exit 1; }
START=$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '-7 days' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u -v+1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+1 hour' +%Y-%m-%dT%H:%M:%SZ)

if [[ $# -gt 0 ]]; then columns=("$@"); else columns=(monitor); fi
printf '%-20s %-34s' agent evaluator
for c in "${columns[@]}"; do printf ' %20s' "$c"; done
echo
for agent in "${AGENTS[@]}"; do
  : > /tmp/amp-scores-$$.json
  for c in "${columns[@]}"; do
    monitor=$([[ $c == monitor ]] && echo "$agent-quality" || echo "$agent-review-$c")
    from=$([[ $c == monitor ]] && (date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '-24 hours' +%Y-%m-%dT%H:%M:%SZ) || echo "$START")
    curl -s -H "Authorization: Bearer $TOKEN" \
      "$API/orgs/default/projects/$PROJECT/agents/$agent/monitors/$monitor/scores?startTime=$from&endTime=$END" \
      | jq -c --arg c "$c" '{column: $c, scores: ([.evaluators[]? | {key: .evaluatorName, value: (if .aggregations.mean == null then "skip" else (.aggregations.mean * 100 | round / 100 | tostring) end)}] | from_entries)}' \
      >> /tmp/amp-scores-$$.json
  done
  jq -rs --arg agent "$agent" '
    (map(.scores | keys) | add | unique) as $names
    | $names[] as $n | [$agent, $n] + map(.scores[$n] // "—") | @tsv' /tmp/amp-scores-$$.json \
    | while IFS=$'\t' read -r a n rest; do
        printf '%-20s %-34s' "$a" "$n"
        IFS=$'\t' read -r -a vals <<<"$rest"
        for v in "${vals[@]}"; do printf ' %20s' "$v"; done
        echo
      done
  rm -f /tmp/amp-scores-$$.json
done
