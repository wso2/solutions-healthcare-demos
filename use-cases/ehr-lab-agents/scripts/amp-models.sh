#!/usr/bin/env bash
# Which model the three agents use, through WSO2 Agent Manager. Each agent has two model configurations in
# Agent Manager — "claude" (anthropic provider, amp-setup.sh) and "openrouter" (openrouter provider,
# amp-openrouter.sh) — each its own LLM proxy with its own key and budget. This points the agents at one:
# it issues each agent a key for that configuration, writes the agent's gateway URL and key into
# secrets.toml, sets modelProvider in config/integration.toml, applies that configuration's budgets and
# restarts the integration. Both gateways stay in place; switching back is the same command.
#
#   ./scripts/amp-models.sh openrouter     # the OpenRouter model in config/integration.toml (openrouterModelName)
#   ./scripts/amp-models.sh openrouter --model z-ai/glm-5.3   # … another OpenRouter model (sets openrouterModelName,
#                                          # adds its price to the gateway's price list)
#   ./scripts/amp-models.sh claude         # Claude Sonnet 4.6 via Anthropic
#   … --no-restart                         # write the settings only (amp-setup.sh uses this)
set -euo pipefail
cd "$(dirname "$0")/.."

API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
ORG=default
ENV=default
PROJECT="${AMP_PROJECT:-longevity-clinic}"
NAMES=(diagnostic-copilot results-analyst care-planner)
SECTIONS=(copilot analyst carePlanner)
DISPLAY=("Diagnostic Copilot" "Results Analysis" "Care Plan")

CONFIG="" RESTART=true MODEL_ID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    claude|openrouter) CONFIG="$1" ;;
    --no-restart) RESTART=false ;;
    --model) MODEL_ID="${2:?--model needs an OpenRouter model id}"; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
  shift
done
[[ -n "$CONFIG" ]] || { echo "usage: $0 claude|openrouter [--no-restart]" >&2; exit 1; }
PROVIDER_SETTING=$([[ $CONFIG == claude ]] && echo anthropic || echo openrouter)
[[ -z "$MODEL_ID" || $CONFIG == openrouter ]] || { echo "--model is for openrouter" >&2; exit 1; }

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
log() { printf '\033[0;34m[amp-models]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-models] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# A restart re-runs an agent step that is in flight (a new, paid model call): refuse while one runs.
if $RESTART && curl -sf -o "$WORK/assessments" http://localhost:9090/api/assessments; then
  busy=$(jq -r '[.[] | select(.stage == "ANALYZING_RESULTS" or .stage == "GENERATING_CARE_PLAN") | .id] | join(", ")' "$WORK/assessments")
  [[ -z "$busy" ]] || die "agents are running for $busy — wait until they finish, then switch"
fi

# Another OpenRouter model: record it, and give the gateway its price so budgets and spend stay right.
if [[ -n "$MODEL_ID" ]]; then
  sed -i.bak "s#^openrouterModelName *= *\".*\"#openrouterModelName = \"$MODEL_ID\"#" config/integration.toml && rm -f config/integration.toml.bak
  ./scripts/amp-openrouter.sh --prices-only
fi

TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=amp:agent:read amp:agent:update amp:agent:api-key-manage amp:llm-provider:read amp:llm-proxy:read" \
  "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || die "could not get an admin token from $THUNDER — is Agent Manager running?"
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -o "$WORK/resp" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN")
  [[ -n "$body" ]] && args+=(-H 'Content-Type: application/json' --data-binary "@$body")
  curl "${args[@]}" "$API$path"
}
fail() { die "$2 failed (HTTP $1): $(head -c 300 "$WORK/resp")"; }

# ── Each agent's gateway URL and a fresh key for the chosen model configuration ──
for i in 0 1 2; do
  name="${NAMES[$i]}"
  base="/orgs/$ORG/projects/$PROJECT/agents/$name/model-configs"
  status=$(api GET "$base"); [[ $status == 200 ]] || fail "$status" "listing $name's model configurations"
  config=$(jq -r --arg c "$CONFIG" '[.configs[]? | select(.name == $c)][0].uuid // empty' "$WORK/resp")
  [[ -n "$config" ]] || die "$name has no '$CONFIG' model configuration — run ./scripts/$([[ $CONFIG == claude ]] && echo amp-setup || echo amp-openrouter).sh"
  status=$(api GET "$base/$config"); [[ $status == 200 ]] || fail "$status" "reading $name's model configuration"
  url=$(jq -r ".envMappings.\"$ENV\".configuration.url // empty" "$WORK/resp")
  [[ -n "$url" ]] || die "no gateway URL in $name's $CONFIG model configuration"
  # The Anthropic client appends /messages to …/v1. The OpenAI-style client appends /chat/completions to the
  # root and sends its key as a Bearer token, so it goes through infra/llm-auth-adapter (same path), which
  # puts the key in x-api-key for the gateway.
  if [[ $CONFIG == claude ]]; then
    url="$url/v1"
  else
    url="${LLM_AUTH_ADAPTER:-http://llm-auth-adapter:8080}/${url#http*://*/}"
  fi
  echo "$url" > "$WORK/url-$i"
  # A fresh key under a new name, after revoking the agent's previous ones. The gateway's key store is
  # indexed by name per proxy and refuses a re-issued key whose name it still holds ("already exists …
  # with a different ID", ISSUES_TO_REPORT.md D15), so a re-used name can leave the agent with a key the
  # gateway never accepted.
  status=$(api GET "$base/$config/environments/$ENV/api-keys"); [[ $status == 200 ]] || fail "$status" "listing $name's model keys"
  for old in $(jq -r --arg n "$name" '[.. | objects | select(.name? and (.name | startswith($n)))] | map(.name) | unique[]' "$WORK/resp"); do
    status=$(api DELETE "$base/$config/environments/$ENV/api-keys/$old"); [[ $status == 20? ]] || fail "$status" "revoking $name's key $old"
  done
  jq -n --arg n "$name-$(date -u +%Y%m%d%H%M%S)" --arg d "${DISPLAY[$i]}" '{name: $n, displayName: $d}' > "$WORK/body"
  status=$(api POST "$base/$config/environments/$ENV/api-keys" "$WORK/body")
  [[ $status == 20? ]] || fail "$status" "issuing $name's $CONFIG key"
  jq -r '.apiKey // empty' "$WORK/resp" | tr -d '\n' > "$WORK/key-$i"
  [[ -s "$WORK/key-$i" ]] || die "no key returned for $name"
done

# ── secrets.toml: replace llmGatewayUrl and llmApiKey in each agent's table (mode 600 kept) ──
python3 - "$WORK" "${SECTIONS[@]}" <<'PY'
import re, sys
work, sections = sys.argv[1], sys.argv[2:]
lines = open("secrets.toml").read().split("\n")
for i, section in enumerate(sections):
    header = f"[wso2healthcare.ehr_agentic_integration.agentManager.{section}]"
    url = open(f"{work}/url-{i}").read().strip()
    key = open(f"{work}/key-{i}").read().strip()
    start = lines.index(header)
    end = next((j for j in range(start + 1, len(lines)) if lines[j].startswith("[")), len(lines))
    for j in range(start + 1, end):
        if re.match(r"\s*llmGatewayUrl\s*=", lines[j]):
            lines[j] = f'llmGatewayUrl = "{url}"'
        elif re.match(r"\s*llmApiKey\s*=", lines[j]):
            lines[j] = f'llmApiKey = "{key}"'
open("secrets.toml", "w").write("\n".join(lines))
PY
chmod 600 secrets.toml

# ── config/integration.toml: the provider the integration builds ──
sed -i.bak "s/^modelProvider *= *\".*\"/modelProvider = \"$PROVIDER_SETTING\"/" config/integration.toml && rm -f config/integration.toml.bak
MODEL=$([[ $CONFIG == claude ]] && sed -n 's/^anthropicModelName *= *"\(.*\)"/\1/p' config/integration.toml \
  || sed -n 's/^openrouterModelName *= *"\(.*\)"/\1/p' config/integration.toml)
log "agents → $CONFIG model configurations ($MODEL), keys issued, secrets.toml and config/integration.toml updated"

# ── The configuration's budgets, and .amp/budgets.json for the portal ──
./scripts/amp-budgets.sh --config "$CONFIG"

if [[ $CONFIG == openrouter ]] && docker compose ps --status running --services 2>/dev/null | grep -qx integration; then
  docker compose up -d llm-auth-adapter >/dev/null 2>&1
fi
if $RESTART && docker compose ps --status running --services 2>/dev/null | grep -qx integration; then
  # Recreated, not just restarted, so a rebuilt image (e.g. the first switch to OpenRouter) is used too.
  docker compose up -d --no-deps --force-recreate integration >/dev/null 2>&1
  log "integration restarting…"
  for _ in $(seq 1 60); do curl -sf http://localhost:9090/api/health >/dev/null && break; sleep 2; done
  curl -sf http://localhost:9090/api/system | jq -r '"integration up: " + .model.provider + " · " + .model.name + (if .model.configured then "" else " (not configured)" end)' \
    | while read -r line; do log "$line"; done
fi
