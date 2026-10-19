#!/usr/bin/env bash
# OpenRouter in WSO2 Agent Manager, next to the Anthropic gateway (which stays as it is):
#
#   provider "openrouter"        OpenAI-compatible LLM provider, upstream https://openrouter.ai/api/v1; holds the
#                                OpenRouter key; carries the same PHI guardrail as the anthropic provider
#   model config "openrouter"    per agent: its own LLM proxy over that provider, its own key and its own budget
#                                (the agents' "claude" model configurations stay as they are)
#   price list                   the gateway's llm-cost prices for the agent and judge models, from OpenRouter's
#                                catalogue, so budgets and spend work for them too
#
# The judge's provider (openrouter-judge) is made by amp-evaluations.sh (amp/monitors.json → "judge").
# Switch the agents with ./scripts/amp-models.sh openrouter, and back with ./scripts/amp-models.sh claude.
#
#   ./scripts/amp-openrouter.sh                 # after amp-setup.sh; idempotent. Needs openrouterApiKey in secrets.toml.
#   ./scripts/amp-openrouter.sh --prices-only   # only add the models' prices (amp-models.sh --model uses this)
set -euo pipefail
cd "$(dirname "$0")/.."

API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
ORG=default
ENV=default
PROJECT="${AMP_PROJECT:-longevity-clinic}"
PROVIDER=openrouter
UPSTREAM=https://openrouter.ai/api/v1
NAMES=(diagnostic-copilot results-analyst care-planner)
DISPLAY=("Diagnostic Copilot" "Results Analysis" "Care Plan")
AGENT_MODEL=$(sed -n 's/^openrouterModelName *= *"\(.*\)"/\1/p' config/integration.toml)
AGENT_MODEL="${AGENT_MODEL:-deepseek/deepseek-v4.1-flash}"
JUDGE_MODEL=$(jq -r '.judges.openrouter.model' amp/monitors.json)
K8S_NS=default-default
PRICING_CM=api-platform-default-default-gw-gateway-llm-pricing

PRICES_ONLY=false
case "${1:-}" in -h|--help) sed -n '2,17p' "$0"; exit 0 ;; --prices-only) PRICES_ONLY=true ;; "") ;; *) echo "unknown option: $1 (see --help)" >&2; exit 1 ;; esac

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
log() { printf '\033[0;34m[amp-openrouter]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-openrouter] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }
kube() { docker exec -i k3d-amp-local-server-0 kubectl -n "$K8S_NS" "$@"; }

# The key goes from secrets.toml into private temp files (a curl header file and a value for Agent Manager);
# it is never printed or passed on a command line.
sed -n 's/^[[:space:]]*openrouterApiKey[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' secrets.toml | head -1 | tr -d '\n' > "$WORK/key"
[[ -s "$WORK/key" ]] || die "no openrouterApiKey in secrets.toml (see secrets.example.toml)"
printf 'Authorization: Bearer %s\n' "$(cat "$WORK/key")" > "$WORK/auth"
status=$(curl -sS -o "$WORK/resp" -w '%{http_code}' -H @"$WORK/auth" "$UPSTREAM/key")
[[ $status == 200 ]] || die "OpenRouter rejected the key (HTTP $status): $(head -c 200 "$WORK/resp")"
log "OpenRouter key accepted ($(jq -r '.data | "used $" + ((.usage // 0)|tostring) + (if .limit then " of $" + (.limit|tostring) else ", no limit" end)' "$WORK/resp"))"

TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=amp:gateway:read amp:llm-provider:create amp:llm-provider:read amp:llm-provider:update amp:llm-provider:deploy amp:agent:read amp:agent:update amp:llm-proxy:read amp:llm-proxy:update amp:llm-proxy:deploy" \
  "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || die "could not get an admin token from $THUNDER — is Agent Manager running?"
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o "$WORK/resp" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary "@$body")
  curl "${args[@]}" "$API$path"
}
fail() { die "$2 failed (HTTP $1): $(head -c 300 "$WORK/resp")"; }

# ── Models: check both exist, and learn the name OpenRouter answers with (the price list is keyed by it) ──
curl -sS "$UPSTREAM/models" -o "$WORK/catalogue"
for model in "$AGENT_MODEL" "$JUDGE_MODEL"; do
  jq -e --arg m "$model" '.data[] | select(.id == $m)' "$WORK/catalogue" >/dev/null || die "OpenRouter has no model $model"
done
# One tiny completion per model (a few tokens, a fraction of a cent) — the `model` field of the answer is
# what the gateway's llm-cost policy looks up.
: > "$WORK/answered"
for model in "$AGENT_MODEL" "$JUDGE_MODEL"; do
  jq -n --arg m "$model" '{model: $m, max_tokens: 5, messages: [{role: "user", content: "Say OK."}]}' > "$WORK/probe"
  status=$(curl -sS -o "$WORK/resp" -w '%{http_code}' -H @"$WORK/auth" -H 'Content-Type: application/json' \
    --data-binary "@$WORK/probe" "$UPSTREAM/chat/completions")
  [[ $status == 200 ]] || die "$model did not answer (HTTP $status): $(head -c 200 "$WORK/resp")"
  answered=$(jq -r '.model // empty' "$WORK/resp")
  echo "$model ${answered:-$model}" >> "$WORK/answered"
  log "$model answers as ${answered:-$model}"
done

# ── The gateway's price list: add both models (under the requested and the answered name) ──
kube get cm "$PRICING_CM" -o jsonpath='{.data.model_prices\.json}' > "$WORK/prices"
[[ -s "$WORK/prices" ]] || die "cannot read the gateway's price list ($PRICING_CM)"
cp "$WORK/prices" "$WORK/prices.before"
while read -r model answered; do
  jq --slurpfile cat "$WORK/catalogue" --arg m "$model" --arg a "$answered" '
    ($cat[0].data[] | select(.id == $m)) as $c
    | {input_cost_per_token: ($c.pricing.prompt | tonumber), output_cost_per_token: ($c.pricing.completion | tonumber),
       max_input_tokens: $c.context_length, provider: "openai", source: "openrouter.ai/api/v1/models"} as $entry
    | .[$m] = $entry | .[$a] = $entry' "$WORK/prices" > "$WORK/next"
  mv "$WORK/next" "$WORK/prices"
done < "$WORK/answered"
if cmp -s "$WORK/prices" "$WORK/prices.before"; then
  log "price list already has $AGENT_MODEL and $JUDGE_MODEL"
else
  jq -n --rawfile p "$WORK/prices" '{data: {"model_prices.json": $p}}' > "$WORK/patch"
  kube patch cm "$PRICING_CM" --type merge --patch-file /dev/stdin < "$WORK/patch" >/dev/null
  # llm-cost reads the price list when the gateway starts.
  runtime=$(kube get deploy -o name | grep gateway-runtime | head -1)
  kube rollout restart "$runtime" >/dev/null
  kube rollout status "$runtime" --timeout=180s >/dev/null
  log "price list: $AGENT_MODEL and $JUDGE_MODEL added (OpenRouter prices); gateway restarted to load it"
fi
$PRICES_ONLY && exit 0

# ── The provider ──
# Its security header is the one the agents' proxies use when they call it internally with Agent Manager's
# own key (x-api-key, as on the anthropic provider); the agents' Bearer keys are checked on their proxies.
api GET "/orgs/$ORG/gateways" >/dev/null
GATEWAY_ID=$(jq -r '[.gateways[] | select(.gatewayType == "BOTH" or .gatewayType == "EGRESS")][0].uuid' "$WORK/resp")
model_name=$(jq -r --arg m "$AGENT_MODEL" '.data[] | select(.id == $m) | .name' "$WORK/catalogue")
jq -n --rawfile key "$WORK/key" --arg gw "$GATEWAY_ID" --arg id "$PROVIDER" --arg url "$UPSTREAM" \
  --arg model "$AGENT_MODEL" --arg modelName "$model_name" '{
  id: $id, name: "OpenRouter", version: "v1.0", context: ("/" + $id), template: "openai",
  description: "OpenRouter (OpenAI-compatible) for the Longevity Clinic agents. Each agent has its own gateway key; the OpenRouter key stays here.",
  upstream: {main: {url: $url, auth: {type: "api-key", header: "Authorization", value: ("Bearer " + $key)}}},
  resilience: {timeout: "300s", idleTimeout: "300s"},
  accessControl: {mode: "allow_all", exceptions: []},
  security: {enabled: true, apiKey: {enabled: true, key: "x-api-key", in: "header"}},
  modelProviders: [{id: "openrouter", name: "OpenRouter", models: [{id: $model, name: $modelName}]}],
  gateways: [$gw]}' > "$WORK/body"
status=$(api GET "/orgs/$ORG/llm-providers/$PROVIDER")
if [[ $status == 404 ]]; then
  status=$(api POST "/orgs/$ORG/llm-providers" "$WORK/body"); verb=created
elif [[ $status == 200 ]]; then
  uuid=$(jq -r .uuid "$WORK/resp")
  # Keep the policies already on it (the guardrail); updates take the UUID (D5).
  jq --slurpfile cur "$WORK/resp" '.policies = ($cur[0].policies // [])' "$WORK/body" > "$WORK/update"
  status=$(api PUT "/orgs/$ORG/llm-providers/$uuid" "$WORK/update"); verb=updated
else
  fail "$status" "reading LLM provider $PROVIDER"
fi
rm -f "$WORK/body" "$WORK/update"
[[ $status == 20? ]] || fail "$status" "saving LLM provider $PROVIDER"
PROVIDER_UUID=$(jq -r .uuid "$WORK/resp")
deployed=""
for _ in $(seq 1 60); do
  api GET "/orgs/$ORG/llm-providers/$PROVIDER_UUID/deployments" >/dev/null
  deployed=$(jq -r --arg gw "$GATEWAY_ID" '[.[]? | select(.gatewayId == $gw and .status == "DEPLOYED")][0].deploymentId // empty' "$WORK/resp")
  [[ -n "$deployed" ]] && break
  sleep 3
done
[[ -n "$deployed" ]] || die "LLM provider $PROVIDER is not deployed to the gateway"
log "LLM provider $PROVIDER $verb and deployed ($AGENT_MODEL)"

# ── The PHI guardrail, as on the anthropic provider ──
./scripts/amp-guardrails.sh --provider "$PROVIDER"

# ── Per-agent model configurations ──
for i in 0 1 2; do
  name="${NAMES[$i]}"
  base="/orgs/$ORG/projects/$PROJECT/agents/$name/model-configs"
  status=$(api GET "$base"); [[ $status == 200 ]] || fail "$status" "listing $name's model configurations"
  if jq -e '[.configs[]? | select(.name == "openrouter")] | length > 0' "$WORK/resp" >/dev/null; then
    log "$name: model configuration openrouter exists"
    continue
  fi
  jq -n --arg d "OpenRouter ($AGENT_MODEL) for ${DISPLAY[$i]}, through the AI gateway with its own budget" --arg env "$ENV" \
    --arg p "$PROVIDER" '{name: "openrouter", description: $d, type: "llm",
      envMappings: {($env): {providerName: $p, configuration: {policies: []}}}}' > "$WORK/body"
  status=$(api POST "$base" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating $name's openrouter model configuration"
  log "$name: model configuration openrouter created"
done

# ── Budgets (and the proxies' key header) on the new model configurations ──
./scripts/amp-budgets.sh --config openrouter

cat <<EOF

OpenRouter is set up in Agent Manager next to Anthropic. Nothing changed for the agents yet:
  switch them        ./scripts/amp-models.sh openrouter     (back: ./scripts/amp-models.sh claude)
  judge evaluations  ./scripts/amp-evaluations.sh            (amp/monitors.json → "judge": "openrouter")
EOF
