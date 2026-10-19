#!/usr/bin/env bash
# Per-agent AI budgets in WSO2 Agent Manager. Each agent reaches Claude through its own model configuration
# — an LLM proxy over the shared anthropic provider, created by amp-setup.sh and shown on the agent's page in
# the console — and that proxy's policies cap what this one agent may spend, independently of the others:
#
#   llm-cost-based-ratelimit   US$ per day     (llm-cost prices each response from the gateway's price list)
#   token-based-ratelimit      tokens per hour (input + output)
#
# Over budget, the gateway answers 429; the agent's workflow step retries, then pauses for operations to
# retry (once the budget is raised) or stop. Budgets: amp/budgets.json.
#
#   ./scripts/amp-budgets.sh                           # apply amp/budgets.json (idempotent; amp-setup.sh runs it)
#   ./scripts/amp-budgets.sh --exhaust care-planner    # demo: shrink one agent's budget to $0.0001 — its next
#                                                      # model call is refused (run without flags to restore)
#   ./scripts/amp-budgets.sh --off                     # no budgets
#
# Also writes .amp/budgets.json (the budgets in force) and .amp/model-prices.json (the gateway's prices for
# the model in use), which the trace router uses to show spend against budget.
set -euo pipefail
cd "$(dirname "$0")/.."

API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
ORG=default
PROJECT=longevity-clinic
CONFIG_NAME=claude
NAMES=(diagnostic-copilot results-analyst care-planner)

MODE=apply
EXHAUST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --exhaust) MODE=exhaust; EXHAUST="${2:-}"; shift ;;
    --off) MODE=off ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
  shift
done
if [[ $MODE == exhaust && ! " ${NAMES[*]} " == *" $EXHAUST "* ]]; then
  echo "--exhaust needs one of: ${NAMES[*]}" >&2; exit 1
fi

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
log() { printf '\033[0;34m[amp-budgets]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-budgets] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=amp:agent:read amp:agent:update amp:llm-provider:read amp:llm-proxy:read amp:llm-proxy:update amp:llm-proxy:deploy" \
  "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || die "could not get an admin token from $THUNDER"
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o "$WORK/resp" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary "@$body")
  curl "${args[@]}" "$API$path"
}

# The rate-limit and cost policy versions this gateway offers.
[[ $(api GET "/orgs/$ORG/llm-providers/policies") == 200 ]] || die "cannot list gateway policies"
version_of() { jq -r --arg p "$1" '[(.list // .policies // .)[]? | select(.name == $p)][0].version // empty' "$WORK/resp"; }
V_COST=$(version_of llm-cost); V_BUDGET=$(version_of llm-cost-based-ratelimit); V_TOKENS=$(version_of token-based-ratelimit)
[[ -n "$V_COST" && -n "$V_BUDGET" && -n "$V_TOKENS" ]] || die "the gateway does not offer llm-cost, llm-cost-based-ratelimit and token-based-ratelimit"

[[ $(api GET "/orgs/$ORG/projects/$PROJECT/llm-proxies?limit=100") == 200 ]] || die "cannot list LLM proxies"
cp "$WORK/resp" "$WORK/proxies"

echo '{}' > "$WORK/in-force"
for name in "${NAMES[@]}"; do
  usd=$(jq -r --arg n "$name" '.agents[$n].usdPerDay' amp/budgets.json)
  tokens=$(jq -r --arg n "$name" '.agents[$n].tokensPerHour' amp/budgets.json)
  [[ $MODE == exhaust && $name == "$EXHAUST" ]] && usd=0.0001

  [[ $(api GET "/orgs/$ORG/projects/$PROJECT/agents/$name/model-configs") == 200 ]] || die "cannot read $name's model configurations"
  config=$(jq -r --arg c "$CONFIG_NAME" '[.configs[]? | select(.name == $c)][0].uuid // empty' "$WORK/resp")
  [[ -n "$config" ]] || die "$name has no '$CONFIG_NAME' model configuration — run ./scripts/amp-setup.sh"
  [[ $(api GET "/orgs/$ORG/projects/$PROJECT/agents/$name/model-configs/$config") == 200 ]] || die "cannot read $name's model configuration"
  proxy_uuid=$(jq -r '.envMappings.default.configuration.proxyUuid // empty' "$WORK/resp")

  # Agent Manager creates the proxy with an "API-Key" header; the Anthropic client sends x-api-key. The
  # proxy is read and updated by name (with providerUuid in the body), and the change is deployed by the
  # model-configuration update below (ISSUES_TO_REPORT.md D9).
  proxy=$(jq -r --arg u "$proxy_uuid" '[.proxies[]? | select(.uuid == $u)][0].configuration.name // empty' "$WORK/proxies")
  [[ -n "$proxy" ]] || die "cannot find $name's LLM proxy"
  [[ $(api GET "/orgs/$ORG/projects/$PROJECT/llm-proxies/$proxy") == 200 ]] || die "cannot read $name's LLM proxy"
  if [[ $(jq -r '.configuration.security.apiKey.key // empty' "$WORK/resp") != x-api-key ]]; then
    jq '{providerUuid, description, configuration: (.configuration | .security = {enabled: true, apiKey: {enabled: true, key: "x-api-key", in: "header"}})}' \
      "$WORK/resp" > "$WORK/body"
    status=$(api PUT "/orgs/$ORG/projects/$PROJECT/llm-proxies/$proxy" "$WORK/body")
    [[ $status == 200 ]] || die "updating $name's LLM proxy (HTTP $status): $(head -c 200 "$WORK/resp")"
  fi

  # llm-cost runs first in the response phase (response policies run in reverse order), so it is listed last.
  # The proxy does not inherit the provider's 300 s timeout (it defaults to 60 s, too short for the agents'
  # long structured answers), so it is set here too.
  jq -n --arg mode "$MODE" --argjson usd "$usd" --argjson tokens "$tokens" \
    --arg vc "$V_COST" --arg vb "$V_BUDGET" --arg vt "$V_TOKENS" '
    def path(p): [{path: "/*", methods: ["*"], params: p}];
    {envMappings: {default: {providerName: "anthropic", configuration: {
      resilience: {timeout: "300s", idleTimeout: "300s"},
      policies: (if $mode == "off" then [] else [
      {name: "llm-cost-based-ratelimit", version: $vb, paths: path({budgetLimits: [{amount: $usd, duration: "24h"}]})},
      {name: "token-based-ratelimit", version: $vt, paths: path({totalTokenLimits: [{count: $tokens, duration: "1h"}]})},
      {name: "llm-cost", version: $vc, paths: path({})}
    ] end)}}}}' > "$WORK/body"
  status=$(api PUT "/orgs/$ORG/projects/$PROJECT/agents/$name/model-configs/$config" "$WORK/body")
  [[ $status == 200 ]] || die "updating $name's model configuration (HTTP $status): $(head -c 200 "$WORK/resp")"

  if [[ $MODE == off ]]; then
    log "$name: no budget"
  else
    log "$name: \$$usd per day, $tokens tokens per hour"
    jq --arg n "$name" --argjson usd "$usd" --argjson tokens "$tokens" --arg ex "$([[ $name == "$EXHAUST" ]] && echo true || echo false)" \
      '.[$n] = {usdPerDay: $usd, tokensPerHour: $tokens, exhausted: ($ex == "true")}' "$WORK/in-force" > "$WORK/next"
    mv "$WORK/next" "$WORK/in-force"
  fi
done

mkdir -p .amp
cp "$WORK/in-force" .amp/budgets.json

# The gateway's prices for the model the agents use, so spend shown in the portal matches what it enforces.
MODEL=$(sed -n 's/^anthropicModelName *= *"\(.*\)"/\1/p' config/integration.toml)
docker exec -i k3d-amp-local-server-0 kubectl -n default-default get cm api-platform-default-default-gw-gateway-llm-pricing \
  -o jsonpath='{.data.model_prices\.json}' | jq --arg m "$MODEL" '{($m): .[$m]}' > .amp/model-prices.json
chmod 644 .amp/budgets.json .amp/model-prices.json   # read by the trace router (runs as nobody); no secrets
log "prices for $MODEL from the gateway: \$$(jq -r --arg m "$MODEL" '.[$m].input_cost_per_token * 1000000' .amp/model-prices.json)/M input, \$$(jq -r --arg m "$MODEL" '.[$m].output_cost_per_token * 1000000' .amp/model-prices.json)/M output tokens"
[[ $MODE == exhaust ]] && log "$EXHAUST's next model call will be refused (429) — run ./scripts/amp-budgets.sh to restore"
exit 0
