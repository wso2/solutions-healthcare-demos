#!/usr/bin/env bash
# Configures evaluation in WSO2 Agent Manager for the demo's three agents:
#
#   custom evaluators   amp/evaluators/ (code: PHI leak, citation integrity, orderable tests, EHR read-only;
#                       LLM judges: medication safety, clinical grounding), described in evaluators.json
#   monitors            one continuous monitor per agent (amp/monitors.json): built-in evaluators
#                       (helpfulness, reasoning quality, tone…) plus the custom ones, judged by Claude
#                       through the AI gateway's `claude-judge` provider (created here, see below)
#
#   ./scripts/amp-evaluations.sh                 # after amp-setup.sh; idempotent (updates in place)
#   ./scripts/amp-evaluations.sh --backfill 24   # also review the last 24 hours of traces right away
#
# Scores show in the console: agent → Monitors, and a Score column on each trace.
set -euo pipefail
cd "$(dirname "$0")/.."

API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
CONSOLE="${AMP_CONSOLE:-http://console.amp.localhost:8080}"
ORG=default
ENV=default
PROJECT="${AMP_PROJECT:-longevity-clinic}"
EVAL_DIR=amp/evaluators
MONITORS=amp/monitors.json

BACKFILL_HOURS=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backfill) BACKFILL_HOURS="${2:?--backfill needs a number of hours}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
log() { printf '\033[0;34m[amp-evaluations]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-evaluations] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }
api() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o "$WORK/resp" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' --data-binary "@$body" "$API$path"
  else
    curl -sS -o "$WORK/resp" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN" "$API$path"
  fi
}
fail() { die "$2 failed (HTTP $1): $(head -c 400 "$WORK/resp")"; }

for tool in curl jq; do command -v "$tool" >/dev/null 2>&1 || die "$tool is required"; done

SCOPES="amp:evaluator:read amp:evaluator:create amp:evaluator:update amp:gateway:read
amp:llm-provider:create amp:llm-provider:update amp:llm-provider:deploy
amp:monitor:read amp:monitor:create amp:monitor:update amp:monitor:delete amp:monitor:execute amp:monitor:score-read
amp:agent:read amp:llm-provider:read amp:llm-proxy:create amp:llm-proxy:read amp:llm-proxy:deploy"
TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=$(echo $SCOPES)" "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || die "could not get an admin token from $THUNDER — is Agent Manager running?"

JUDGE_MODEL=$(jq -r .judgeModel "$MONITORS")
PROVIDER=$(jq -r .llmProvider "$MONITORS")
INTERVAL=$(jq -r .intervalMinutes "$MONITORS")
# ── The judge's model ──
# LLM judges run in AMP's evaluation image. On an `anthropic`-template provider they all fail: the image's
# Anthropic SDK (1.3.0) rejects the `temperature` argument its any-llm client always sends (D7). On Anthropic's
# OpenAI-compatible API they fail too: the judge's response_format schema has minimum/maximum, which that API
# rejects (and the gateway's openai-to-anthropic-transformer leaves 1.2.1 responses untranslated). So the
# judge gets its own provider: OpenAI template (the judge takes the OpenAI client path), upstream Anthropic's
# OpenAI-compatible API, and an interceptor-service policy calling infra/judge-adapter, which removes
# response_format (the judge's prompt already asks for the same JSON). Same Claude model; separate from the
# agents' provider, so judge traffic neither uses the agents' keys nor passes the PHI guardrail.
JUDGE_ADAPTER="${JUDGE_ADAPTER:-http://host.k3d.internal:8014}"
api GET "/orgs/$ORG/gateways" >/dev/null
GATEWAY_ID=$(jq -r '[.gateways[] | select(.gatewayType == "BOTH" or .gatewayType == "EGRESS")][0].uuid' "$WORK/resp")
sed -n 's/^[[:space:]]*anthropicApiKey[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' secrets.toml | head -1 > "$WORK/anthropic-key"
[[ -s "$WORK/anthropic-key" ]] || die "no anthropicApiKey in secrets.toml"
jq -n --rawfile key "$WORK/anthropic-key" --arg id "$PROVIDER" --arg gw "$GATEWAY_ID" --arg adapter "$JUDGE_ADAPTER" '{
  id: $id, name: "Claude (evaluation judge)", version: "v1.0", context: ("/" + $id), template: "openai",
  description: "Claude for LLM-judge evaluators, through Anthropic'"'"'s OpenAI-compatible API.",
  upstream: {main: {url: "https://api.anthropic.com/v1",
    auth: {type: "api-key", header: "Authorization", value: ("Bearer " + ($key | rtrimstr("\n")))}}},
  resilience: {timeout: "300s", idleTimeout: "300s"},
  accessControl: {mode: "allow_all", exceptions: []},
  security: {enabled: true, apiKey: {enabled: true, key: "api-key", in: "header"}},
  policies: [{name: "interceptor-service", version: "v1.0.1",
    paths: [{path: "/*", methods: ["*"], params: {endpoint: $adapter,
      request: {includeRequestBody: true, includeRequestHeaders: false, passthroughOnError: true}}}]}],
  gateways: [$gw]}' > "$WORK/body"
rm -f "$WORK/anthropic-key"
status=$(api GET "/orgs/$ORG/llm-providers/$PROVIDER")
if [[ $status == 404 ]]; then
  status=$(api POST "/orgs/$ORG/llm-providers" "$WORK/body"); verb=created
elif [[ $status == 200 ]]; then
  uuid=$(jq -r .uuid "$WORK/resp")   # updates take the UUID, not the handle (D5)
  status=$(api PUT "/orgs/$ORG/llm-providers/$uuid" "$WORK/body"); verb=updated
else
  fail "$status" "reading LLM provider $PROVIDER"
fi
rm -f "$WORK/body"
[[ $status == 20? ]] || fail "$status" "saving the judge provider $PROVIDER"
log "LLM provider $PROVIDER $verb for the judge (OpenAI-compatible Claude, via $JUDGE_ADAPTER)"
sleep 5   # the gateway picks it up asynchronously

# ── Custom evaluators ──
count=$(jq length "$EVAL_DIR/evaluators.json")
for ((i = 0; i < count; i++)); do
  jq ".[$i]" "$EVAL_DIR/evaluators.json" > "$WORK/def"
  id=$(jq -r .identifier "$WORK/def")
  file="$EVAL_DIR/$(jq -r .file "$WORK/def")"
  [[ -f "$file" ]] || die "missing $file"
  jq --rawfile source "$file" 'del(.file) | .source = $source' "$WORK/def" > "$WORK/body"
  status=$(api GET "/orgs/$ORG/evaluators/custom/$id")
  if [[ $status == 404 ]]; then
    status=$(api POST "/orgs/$ORG/evaluators/custom" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating evaluator $id"
    log "evaluator $id created ($(jq -r '.type + ", " + .level' "$WORK/def"))"
  elif [[ $status == 200 ]]; then
    # identifier and level are fixed after creation; everything else is updated.
    jq 'del(.identifier, .level)' "$WORK/body" > "$WORK/update"
    status=$(api PUT "/orgs/$ORG/evaluators/custom/$id" "$WORK/update"); [[ $status == 20? ]] || fail "$status" "updating evaluator $id"
    log "evaluator $id updated"
  else
    fail "$status" "reading evaluator $id"
  fi
done

# ── Monitors, one per agent ──
# monitor_evaluators AGENT — the agent's evaluator list for the API (judges get the judge model).
monitor_evaluators() {
  jq --arg agent "$1" --arg model "$JUDGE_MODEL" '
    .agents[$agent].evaluators | map({identifier, displayName,
      config: ((.config // {}) + (if .judge then {model: $model} else {} end))})' "$MONITORS"
}

for agent in $(jq -r '.agents | keys[]' "$MONITORS"); do
  name="${agent}-quality"
  display=$(jq -r --arg a "$agent" '.agents[$a].displayName' "$MONITORS")
  evaluators=$(monitor_evaluators "$agent")
  base="/orgs/$ORG/projects/$PROJECT/agents/$agent/monitors"
  status=$(api GET "$base/$name")
  if [[ $status == 404 ]]; then
    jq -n --arg name "$name" --arg display "$display" --arg env "$ENV" --arg provider "$PROVIDER" \
      --argjson interval "$INTERVAL" --argjson evaluators "$evaluators" '{
        name: $name, displayName: $display, environmentName: $env, type: "future",
        description: "Continuous evaluation of every run (built-in and Longevity Clinic evaluators).",
        intervalMinutes: $interval, samplingRate: 1.0, llmProvider: {providerName: $provider},
        evaluators: $evaluators}' > "$WORK/body"
    status=$(api POST "$base" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating monitor $name"
    log "monitor $name created: $(jq length <<<"$evaluators") evaluators, every $INTERVAL min"
  elif [[ $status == 200 ]]; then
    jq -n --arg display "$display" --arg provider "$PROVIDER" --argjson interval "$INTERVAL" \
      --argjson evaluators "$evaluators" '{displayName: $display, intervalMinutes: $interval,
        samplingRate: 1.0, llmProvider: {providerName: $provider}, evaluators: $evaluators}' > "$WORK/body"
    status=$(api PATCH "$base/$name" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "updating monitor $name"
    log "monitor $name updated"
  else
    fail "$status" "reading monitor $name"
  fi

  if [[ -n "$BACKFILL_HOURS" ]]; then
    review="${agent}-review"
    end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    start=$(date -u -v-"${BACKFILL_HOURS}"H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d "-${BACKFILL_HOURS} hours" +%Y-%m-%dT%H:%M:%SZ)
    # A past monitor runs once on creation; replace the previous review so the window is current.
    status=$(api GET "$base/$review")
    if [[ $status == 200 ]]; then
      api POST "$base/$review/stop" >/dev/null || true
      status=$(api DELETE "$base/$review"); [[ $status == 20? ]] || fail "$status" "deleting the previous review $review"
      for _ in $(seq 1 30); do [[ $(api GET "$base/$review") == 404 ]] && break; sleep 2; done
    fi
    jq -n --arg name "$review" --arg display "${display} — review of the last ${BACKFILL_HOURS}h" --arg env "$ENV" \
      --arg provider "$PROVIDER" --arg start "$start" --arg end "$end" --argjson evaluators "$evaluators" '{
        name: $name, displayName: $display, environmentName: $env, type: "past",
        traceStart: $start, traceEnd: $end, samplingRate: 1.0,
        llmProvider: {providerName: $provider}, evaluators: $evaluators}' > "$WORK/body"
    status=$(api POST "$base" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating review monitor $review"
    log "review $review: traces $start → $end"
  fi
done

cat <<EOF

Evaluation is configured. Scores appear a few minutes after each run (the monitors run every $INTERVAL min).
  Monitors   $CONSOLE/org/$ORG/project/$PROJECT/agents/<agent>/monitors   (agent → Monitors)
  Evaluators $CONSOLE/org/$ORG/evaluators
EOF
