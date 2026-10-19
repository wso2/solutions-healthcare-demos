#!/usr/bin/env bash
# Registers the demo's three agents in WSO2 Agent Manager and wires its three governance features:
#
#   identity    each agent gets an AgentID (OAuth client). The WSO2 FHIR MCP servers (fhir-ehr over the EHR,
#               fhir-lab over the lab) and the PubMed MCP server sit behind MCP proxies secured by AgentID,
#               with a scope per tool group. Roles:
#                 ehr-reader           FHIR read tools, EHR         → Diagnostic Copilot, Results Analysis
#                 lab-reader           FHIR read tools, lab         → Results Analysis
#                 literature-searcher  PubMed search                → all three agents
#                 ehr-writer           FHIR create/update/delete    → nobody (only workflow activities write)
#               The FHIR MCP proxies also run mcp-fhir-deidentify (built in by scripts/amp-gateway.sh): names,
#               addresses, contact details and identifiers are taken out of tool results before an agent
#               sees them (rules: amp/fhir-deidentify.json).
#   AI gateway  an Anthropic provider holds the real Anthropic key; each agent gets its own model
#               configuration (an LLM proxy with its own key and budget — scripts/amp-budgets.sh); the PHI
#               guardrail (scripts/amp-guardrails.sh) redacts identifiers before Claude sees them.
#   monitoring  each agent gets a tracing key; infra/trace-router forwards its runs under it.
#
#   ./scripts/amp-setup.sh                      # after ./scripts/amp-install.sh
#   ./scripts/amp-setup.sh --skip-llm-provider  # everything but the AI gateway (keeps Claude direct)
#   ./scripts/amp-setup.sh --skip-mcp-proxies   # no MCP proxies (agents reach the FHIR MCP servers directly)
#   ./scripts/amp-setup.sh --no-fhir-policy     # FHIR MCP proxies without mcp-fhir-deidentify (before/after demo)
#
# Idempotent: existing objects are kept. Keys and secrets are shown only once by Agent Manager, so each
# run rotates them and rewrites the generated block in secrets.toml and .amp/trace-routes.json (both
# gitignored). Nothing secret is printed. Needs curl and jq (both ship with macOS).
set -euo pipefail
cd "$(dirname "$0")/.."

API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
CONSOLE="${AMP_CONSOLE:-http://console.amp.localhost:8080}"
ORG=default
ENV=default
PROJECT="${AMP_PROJECT:-longevity-clinic}"
# Where Agent Manager's gateway (inside k3d) reaches the demo's FHIR MCP servers: their host ports
# on the colima VM.
MCP_UPSTREAM_HOST="${MCP_UPSTREAM_HOST:-host.k3d.internal}"

SKIP_LLM=false
SKIP_MCP=false
for arg in "$@"; do
  case "$arg" in
    --skip-llm-provider) SKIP_LLM=true ;;
    --skip-mcp-proxies) SKIP_MCP=true ;;
    --no-fhir-policy) NO_FHIR_POLICY=true ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 1 ;;
  esac
done

# The three agents (parallel arrays: macOS bash 3.2 has no associative arrays).
KEYS=(copilot analyst carePlanner)
NAMES=(diagnostic-copilot results-analyst care-planner)
DISPLAY=("Diagnostic Copilot" "Results Analysis" "Care Plan")
ROLES=("Longevity Diagnostic Copilot" "Longevity Lab Results Analyst" "Longevity Care Plan Writer")
DESCRIPTIONS=(
  "Reads the patient record through the FHIR MCP proxy, gives the physician an overview and evaluation, proposes a lab panel."
  "Interprets the lab results against the patient's history (FHIR MCP proxy) once the lab releases them."
  "Writes the clinical note and the patient report from the analysis. Has no EHR access."
)
EHR_READER=(true true false)

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

log() { printf '\033[0;34m[amp-setup]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-setup] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# api METHOD PATH [BODY_FILE] — response body in $WORK/resp, prints the HTTP status.
api() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -o "$WORK/resp" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' --data-binary "@$body" "$API$path"
  else
    curl -sS -o "$WORK/resp" -w '%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN" "$API$path"
  fi
}
field() { jq -r "$1 // empty" "$WORK/resp"; }
# fail STATUS WHAT — stops with the server's message (responses here never echo secrets back).
fail() { die "$2 failed (HTTP $1): $(head -c 400 "$WORK/resp")"; }

for tool in curl jq docker openssl; do command -v "$tool" >/dev/null 2>&1 || die "$tool is required"; done
curl -s -o /dev/null "$CONSOLE" || die "Agent Manager is not reachable at $CONSOLE — run ./scripts/amp-install.sh"

# ── Admin token: client credentials of the platform's API client, with the scopes this script uses ──
SCOPES="amp:environment:read amp:gateway:read amp:project:read amp:project:create
amp:llm-provider-template:read amp:llm-provider:create amp:llm-provider:read amp:llm-provider:update
amp:llm-provider:deploy amp:llm-provider:api-key-manage
amp:agent:create amp:agent:read amp:agent:update amp:agent:api-key-manage amp:agent:token-manage
amp:mcp-server:connect amp:mcp-server:create amp:mcp-server:read amp:mcp-server:update amp:mcp-server:delete
amp:scope:create amp:scope:read amp:scope:update
amp:agent-identity:read amp:agent-identity:create amp:agent-identity:update"
TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=$(echo $SCOPES)" "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || die "could not get an admin token from $THUNDER"

# ── Gateway, environment, AgentID token endpoint ──
status=$(api GET "/orgs/$ORG/gateways"); [[ $status == 200 ]] || fail "$status" "listing gateways"
GATEWAY_ID=$(field '[.gateways[] | select(.gatewayType == "BOTH" or .gatewayType == "EGRESS")][0].uuid')
VHOST=$(field '[.gateways[] | select(.gatewayType == "BOTH" or .gatewayType == "EGRESS")][0].vhost')
[[ -n "$GATEWAY_ID" && -n "$VHOST" ]] || die "no gateway registered in Agent Manager"
status=$(api GET "/orgs/$ORG/environments"); [[ $status == 200 ]] || fail "$status" "listing environments"
ENV_UUID=$(field ".[] | select(.name == \"$ENV\") | .id")
# The environment's AgentID issuer, from the gateway's key manager for it.
status=$(api GET "/orgs/$ORG/identity-providers"); [[ $status == 200 ]] || fail "$status" "reading the AgentID issuer"
ISSUER=$(field "[.list[] | select(.environmentName == \"$ENV\")][0].issuer")
[[ -n "$ISSUER" ]] || die "no AgentID identity provider for environment $ENV"
TOKEN_URL="$ISSUER/oauth2/token"
log "gateway $VHOST · AgentID tokens from $TOKEN_URL"

# ── Project ──
status=$(api GET "/orgs/$ORG/projects/$PROJECT")
if [[ $status == 404 ]]; then
  jq -n --arg name "$PROJECT" '{name: $name, displayName: "Longevity Clinic", deploymentPipeline: "default",
    description: "EHR + Lab agentic integration: Diagnostic Copilot, Results Analysis and Care Plan agents"}' > "$WORK/body"
  status=$(api POST "/orgs/$ORG/projects" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating project $PROJECT"
  log "project $PROJECT created"
elif [[ $status != 200 ]]; then fail "$status" "reading project $PROJECT"; fi

# ── AI gateway: the Anthropic provider (holds the real key) ──
PROVIDER_UUID=""
status=$(api GET "/orgs/$ORG/llm-providers/anthropic")
if [[ $status == 200 ]]; then
  PROVIDER_UUID=$(field .uuid)
  log "LLM provider anthropic exists"
elif ! $SKIP_LLM; then
  # The key goes from secrets.toml into a private temp file and on to Agent Manager; it is never printed.
  sed -n 's/^[[:space:]]*anthropicApiKey[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' secrets.toml | head -1 > "$WORK/anthropic-key"
  [[ -s "$WORK/anthropic-key" ]] || die "no anthropicApiKey in secrets.toml"
  jq -n --rawfile key "$WORK/anthropic-key" --arg gw "$GATEWAY_ID" '{
    id: "anthropic", name: "Anthropic", version: "v1.0", context: "/anthropic", template: "anthropic",
    description: "Claude for the Longevity Clinic agents. Each agent has its own gateway key; the Anthropic key stays here.",
    upstream: {main: {url: "https://api.anthropic.com", auth: {type: "api-key", header: "x-api-key", value: ($key | rtrimstr("\n"))}}},
    resilience: {timeout: "300s", idleTimeout: "300s"},
    accessControl: {mode: "allow_all", exceptions: []},
    security: {enabled: true, apiKey: {enabled: true, key: "x-api-key", in: "header"}},
    modelProviders: [{id: "anthropic", name: "Anthropic", models: [{id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6"}]}],
    gateways: [$gw]}' > "$WORK/body"
  rm -f "$WORK/anthropic-key"
  status=$(api POST "/orgs/$ORG/llm-providers" "$WORK/body")
  rm -f "$WORK/body"
  [[ $status == 20? ]] || fail "$status" "creating the Anthropic LLM provider"
  PROVIDER_UUID=$(field .uuid)
  log "LLM provider anthropic created — waiting for the gateway to deploy it"
fi
if [[ -n "$PROVIDER_UUID" ]]; then
  # The provider's own `status` is its lifecycle state; its deployment to the gateway is tracked apart.
  deployed=""
  for _ in $(seq 1 60); do
    api GET "/orgs/$ORG/llm-providers/$PROVIDER_UUID/deployments" >/dev/null
    deployed=$(jq -r --arg gw "$GATEWAY_ID" '[.[]? | select(.gatewayId == $gw and .status == "DEPLOYED")][0].deploymentId // empty' "$WORK/resp")
    [[ -n "$deployed" ]] && break
    sleep 3
  done
  [[ -n "$deployed" ]] || die "the Anthropic provider is not deployed to the gateway"
  log "LLM provider anthropic deployed at $VHOST/anthropic"
fi
if [[ -z "$PROVIDER_UUID" ]]; then
  log "skipping the AI gateway (--skip-llm-provider): agents keep calling Claude directly"
fi

# The data-plane route in front of the gateway caps every request at 30s (hard-coded in AMP 1.0.0's
# gateway-extension chart), which cuts off Claude calls that take minutes no matter what the provider's
# resilience.timeout says. Raise it on the route itself; Helm does not reconcile it back.
ROUTE_NS=openchoreo-data-plane
ROUTE=$(docker exec k3d-amp-local-server-0 kubectl get httproute -n "$ROUTE_NS" -o json 2>/dev/null \
  | jq -r --arg host "${VHOST#http://}" '[.items[] | select((.spec.hostnames // []) | index($host | sub(":[0-9]+$"; "")))][0].metadata.name // empty')
if [[ -n "$ROUTE" ]]; then
  docker exec k3d-amp-local-server-0 kubectl patch httproute "$ROUTE" -n "$ROUTE_NS" --type=json \
    -p '[{"op":"replace","path":"/spec/rules/0/timeouts/request","value":"300s"}]' >/dev/null
  log "gateway route $ROUTE: request timeout 300s"
else
  log "WARNING: gateway route not found — Claude calls over 30s will time out at the gateway"
fi

# ── Agents ──
for i in 0 1 2; do
  name="${NAMES[$i]}"
  status=$(api GET "/orgs/$ORG/projects/$PROJECT/agents/$name")
  if [[ $status == 404 ]]; then
    jq -n --arg name "$name" --arg display "${DISPLAY[$i]}" --arg desc "${DESCRIPTIONS[$i]}" '{name: $name,
      displayName: $display, description: $desc, provisioning: {type: "external"},
      agentType: {type: "external-agent-api", subType: "custom-api"}}' > "$WORK/body"
    status=$(api POST "/orgs/$ORG/projects/$PROJECT/agents" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "registering $name"
    log "agent $name registered"
  elif [[ $status != 200 ]]; then fail "$status" "reading agent $name"; fi
done

# ── MCP proxies in front of the WSO2 FHIR MCP servers, secured by AgentID ──
# Agent Manager proxies only upstreams with a public address, so its gateway reaches the FHIR MCP
# servers through a Cloudflare quick tunnel and a gatekeeper that admits only requests carrying the
# tunnel key (see infra/mcp-gatekeeper). The key is generated once; the tunnel URL changes whenever
# the tunnel restarts, so every run points the proxies at the current one.
MCP_EHRS=()
TUNNEL_URL=""
if ! $SKIP_MCP; then
  MCP_EHRS=(0 1 2)   # indexes into PROXY_* below
  mkdir -p .amp
  if [[ ! -s .amp/tunnel.env ]]; then
    (umask 077; echo "MCP_TUNNEL_KEY=$(openssl rand -hex 32)" > .amp/tunnel.env)
  fi
  TUNNEL_KEY=$(sed -n 's/^MCP_TUNNEL_KEY=//p' .amp/tunnel.env)
  docker compose --profile amp-tunnel up -d mcp-gatekeeper mcp-tunnel >/dev/null 2>&1
  tunnel_url() {
    for _ in $(seq 1 30); do
      TUNNEL_URL=$(docker compose --profile amp-tunnel logs mcp-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
      [[ -n "$TUNNEL_URL" ]] && return 0
      sleep 2
    done
    die "the Cloudflare tunnel did not come up (docker compose --profile amp-tunnel logs mcp-tunnel)"
  }
  # The tunnel must refuse callers without the key, and let Agent Manager's key through.
  tunnel_rejects_anonymous() {
    for _ in $(seq 1 15); do
      open=$(curl -s -o /dev/null -w '%{http_code}' "$TUNNEL_URL/ehr/mcp/" || true)
      [[ $open == 401 ]] && return 0
      sleep 2
    done
    return 1
  }
  tunnel_url
  # A quick tunnel's hostname can lapse while the container keeps running: restart it for a new one.
  if ! tunnel_rejects_anonymous; then
    log "tunnel $TUNNEL_URL is not answering — restarting it for a new URL"
    docker compose --profile amp-tunnel up -d --force-recreate mcp-tunnel >/dev/null 2>&1
    sleep 5
    tunnel_url
    tunnel_rejects_anonymous || true
  fi
  [[ $open == 401 ]] || die "the tunnel does not reject unauthenticated calls (HTTP $open) — not using it"
  keyed=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Tunnel-Key: $TUNNEL_KEY" "$TUNNEL_URL/ehr/mcp/" || true)
  [[ $keyed != 401 && $keyed != 000 && $keyed != 5* ]] || die "the tunnel does not reach the FHIR MCP server (HTTP $keyed)"
  log "tunnel $TUNNEL_URL (gatekeeper: 401 without key, $keyed with it)"
fi
# The three MCP proxies: handle, path behind the gatekeeper, tools, and scopes (action=tool,tool;…).
PROXY_HANDLES=(fhir-ehr fhir-lab pubmed)
PROXY_PATHS=(ehr/mcp/ lab/mcp/ pubmed/mcp)
PROXY_NAMES=("FHIR MCP — EHR" "FHIR MCP — Lab" "PubMed")
PROXY_TOOLS=("get_capabilities search read create update delete" "get_capabilities search read create update delete" "search_pubmed get_abstract")
PROXY_SCOPES=("read=get_capabilities,search,read;write=create,update,delete" "read=get_capabilities,search,read;write=create,update,delete" "search=search_pubmed,get_abstract")
PROXY_DESCRIPTIONS=(
  "WSO2 FHIR MCP server for the clinic's EHR. AgentID roles decide which tools an agent may call."
  "WSO2 FHIR MCP server for the reference lab's FHIR records. AgentID roles decide which tools an agent may call."
  "Literature search (NCBI E-utilities) for the agents. Holds no patient data."
)
# FHIR de-identification on the two FHIR MCP proxies (EHR and lab) (mcp-fhir-deidentify, config amp/fhir-deidentify.json),
# when the gateway offers it — it does once ./scripts/amp-gateway.sh has built it into the gateway.
FHIR_POLICY='[]'
if [[ ${#MCP_EHRS[@]} -gt 0 ]] && ! ${NO_FHIR_POLICY:-false}; then
  status=$(api GET "/orgs/$ORG/mcp-proxies/policies"); [[ $status == 200 ]] || fail "$status" "listing MCP policies"
  version=$(jq -r '[.list[]? | select(.name == "mcp-fhir-deidentify")][0].version // empty' "$WORK/resp")
  if [[ -n "$version" ]]; then
    FHIR_POLICY=$(jq -c --arg v "$version" '[{name: "mcp-fhir-deidentify", version: $v, params: .}]' amp/fhir-deidentify.json)
    log "FHIR MCP proxies get mcp-fhir-deidentify $version (amp/fhir-deidentify.json)"
  else
    log "the gateway does not offer mcp-fhir-deidentify — run ./scripts/amp-gateway.sh to add it"
  fi
fi
for j in ${MCP_EHRS[@]+"${MCP_EHRS[@]}"}; do
  handle="${PROXY_HANDLES[$j]}"
  tools_json=$(printf '%s\n' ${PROXY_TOOLS[$j]} | jq -R '{name: .}' | jq -s .)
  policies='[]'; [[ $handle == fhir-* ]] && policies="$FHIR_POLICY"
  jq -n --arg id "$handle" --arg name "${PROXY_NAMES[$j]}" --arg desc "${PROXY_DESCRIPTIONS[$j]}" \
    --arg url "$TUNNEL_URL/${PROXY_PATHS[$j]}" --arg key "$TUNNEL_KEY" --arg env "$ENV_UUID" --argjson tools "$tools_json" \
    --argjson policies "$policies" '{
    id: $id, name: $name, version: "v1.0", context: ("/" + $id), mcpSpecVersion: "2025-06-18", description: $desc,
    endpoints: [{id: "primary", name: "primary",
      upstream: {main: {url: $url, auth: {type: "api-key", header: "X-Tunnel-Key", value: $key}}},
      resilience: {timeout: "120s", idleTimeout: "120s"},
      capabilities: {tools: $tools},
      policies: $policies,
      security: {enabled: true, identity: {enabled: true}},
      environments: [{environmentUuid: $env}]}]}' > "$WORK/body"
  status=$(api GET "/orgs/$ORG/mcp-proxies/$handle")
  if [[ $status == 404 ]]; then
    status=$(api POST "/orgs/$ORG/mcp-proxies" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating MCP proxy $handle"
    log "MCP proxy $handle created"
  elif [[ $status == 200 ]]; then
    status=$(api PUT "/orgs/$ORG/mcp-proxies/$handle" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "updating MCP proxy $handle"
    log "MCP proxy $handle pointed at the current tunnel"
  else fail "$status" "reading MCP proxy $handle"; fi
  rm -f "$WORK/body"
  # Every tool sits under a scope: a tool no scope covers is open to any authenticated agent.
  status=$(api GET "/orgs/$ORG/mcp-proxies/$handle/scopes"); [[ $status == 200 ]] || fail "$status" "listing scopes of $handle"
  existing=$(jq -r '.. | objects | select(has("action")) | .action' "$WORK/resp" | sort -u)
  IFS=';' read -r -a scope_defs <<<"${PROXY_SCOPES[$j]}"
  for def in "${scope_defs[@]}"; do
    action="${def%%=*}"; tools="${def#*=}"
    jq -n --arg action "$action" --arg tools "$tools" --arg proxy "$handle" '{action: $action,
      description: ($proxy + " " + $action), tools: ($tools | split(","))}' > "$WORK/body"
    if grep -qx "$action" <<<"$existing"; then
      status=$(api PUT "/orgs/$ORG/mcp-proxies/$handle/scopes/$action" "$WORK/body")
    else
      status=$(api POST "/orgs/$ORG/mcp-proxies/$handle/scopes" "$WORK/body")
    fi
    [[ $status == 20? || $status == 409 ]] || fail "$status" "setting scope $handle:$action"
  done
  for _ in $(seq 1 40); do
    api GET "/orgs/$ORG/mcp-proxies/$handle" >/dev/null
    [[ "$(field '.endpoints[0].environments[0].deploymentStatus')" == Deployed ]] && break
    sleep 3
  done
  log "MCP proxy $handle: $(field '.endpoints[0].environments[0].deploymentStatus') at $VHOST/$handle/mcp"
done

# ── AgentID: identities, the fhir-reader role, and its assignments ──
for i in 0 1 2; do
  name="${NAMES[$i]}"
  for _ in $(seq 1 60); do
    api GET "/orgs/$ORG/projects/$PROJECT/agents/$name/identities?environment=$ENV" >/dev/null
    state=$(field '.[0].status')
    [[ $state == completed || $state == failed ]] && break
    sleep 3
  done
  if [[ $state == failed ]]; then
    jq -n --arg env "$ENV" '{environment: $env}' > "$WORK/body"
    api POST "/orgs/$ORG/projects/$PROJECT/agents/$name/identities/retry" "$WORK/body" >/dev/null
    die "AgentID provisioning failed for $name — retry requested; run this script again in a minute"
  fi
  [[ $state == completed ]] || die "AgentID for $name is still '$state'"
  field '.[0].clientId' > "$WORK/client-id-$i"
  field '.[0].agentId' > "$WORK/agent-id-$i"
  # The only way to read an external agent's secret is to issue a new one.
  jq -n --arg env "$ENV" '{environment: $env}' > "$WORK/body"
  status=$(api POST "/orgs/$ORG/projects/$PROJECT/agents/$name/identities" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "issuing $name's AgentID secret"
  field .clientSecret > "$WORK/client-secret-$i"
  [[ -s "$WORK/client-secret-$i" ]] || die "no AgentID secret returned for $name"
done
log "AgentIDs issued: ${NAMES[*]}"

# Roles carry scopes; agents get roles. Run after the proxies exist, since their scopes are what roles grant.
# (ROLE|scopes|agent indexes)
ROLE_DEFS=(
  "ehr-reader|fhir-ehr:read|0 1|Read tools of the EHR's FHIR MCP proxy"
  "lab-reader|fhir-lab:read|1|Read tools of the lab's FHIR MCP proxy"
  "literature-searcher|pubmed:search|0 1 2|Search the literature through the PubMed MCP proxy"
  "ehr-writer|fhir-ehr:write fhir-lab:write||Change EHR or lab records — assigned to no agent: only workflow activities write"
)
if ! $SKIP_MCP; then
ROLE_PATH="/orgs/$ORG/environments/$ENV/agent-identities/roles"
for def in "${ROLE_DEFS[@]}"; do
  IFS='|' read -r role scopes members description <<<"$def"
  status=$(api GET "$ROLE_PATH?limit=100"); [[ $status == 200 ]] || fail "$status" "listing AgentID roles"
  role_id=$(field "[.roles[] | select(.name == \"$role\")][0].id")
  jq -n --arg name "$role" --arg desc "$description" --arg scopes "$scopes" \
    '{name: $name, description: $desc, scopes: ($scopes | split(" "))}' > "$WORK/body"
  if [[ -z "$role_id" ]]; then
    status=$(api POST "$ROLE_PATH" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating role $role"
    role_id=$(field .id)
  else
    status=$(api PUT "$ROLE_PATH/$role_id" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "updating role $role"
  fi
  # Make the role's members exactly the listed agents (a presenter may have changed them in the console).
  api GET "$ROLE_PATH/$role_id/assignments" >/dev/null || true
  assigned=$(jq -r '.. | objects | select(has("id")) | .id' "$WORK/resp" 2>/dev/null | sort -u || true)
  wanted=""; names=""
  for i in $members; do wanted+="$(cat "$WORK/agent-id-$i")"$'\n'; names+="${NAMES[$i]} "; done
  add="[]"; remove="[]"
  for id in $(printf '%s' "$wanted"); do grep -qx "$id" <<<"$assigned" || add=$(jq -c --arg id "$id" '. + [{id: $id, type: "agent"}]' <<<"$add"); done
  for i in 0 1 2; do
    id=$(cat "$WORK/agent-id-$i")
    if grep -qx "$id" <<<"$assigned" && ! grep -qx "$id" <<<"$wanted"; then
      remove=$(jq -c --arg id "$id" '. + [{id: $id, type: "agent"}]' <<<"$remove")
    fi
  done
  if [[ "$add" != "[]" ]]; then
    jq -n --argjson a "$add" '{assignments: $a}' > "$WORK/body"
    status=$(api POST "$ROLE_PATH/$role_id/assignments/add" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "assigning $role"
  fi
  if [[ "$remove" != "[]" ]]; then
    jq -n --argjson a "$remove" '{assignments: $a}' > "$WORK/body"
    status=$(api POST "$ROLE_PATH/$role_id/assignments/remove" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "unassigning $role"
  fi
  log "role $role [$scopes] → ${names:-no agent}"
done
# The proxies of the two-EHR layout, replaced by fhir-ehr and fhir-lab. Removed once no role grants them.
# Leftovers only: a failure is reported, never fatal, so the settings below are always written.
for old in fhir-cerner fhir-athena; do
  status=$(api GET "/orgs/$ORG/mcp-proxies/$old")
  [[ $status == 200 ]] || continue
  status=$(api DELETE "/orgs/$ORG/mcp-proxies/$old")
  if [[ $status == 20? ]]; then
    log "MCP proxy $old removed (replaced by fhir-ehr and fhir-lab)"
  else
    log "could not remove the old MCP proxy $old (HTTP $status: $(head -c 200 "$WORK/resp")) — delete it in the console"
  fi
done
fi

# ── Per-agent model configurations (own gateway URL, key and budget) and tracing keys ──
# Each agent reaches Claude through its own model configuration: an LLM proxy over the anthropic provider
# that inherits the provider's guardrails and carries the agent's budget (scripts/amp-budgets.sh). Its key
# identifies the agent at the gateway, so spend and limits are per agent.
for i in 0 1 2; do
  name="${NAMES[$i]}"
  : > "$WORK/llm-key-$i"
  : > "$WORK/llm-url-$i"
  if [[ -n "$PROVIDER_UUID" ]]; then
    base="/orgs/$ORG/projects/$PROJECT/agents/$name/model-configs"
    status=$(api GET "$base"); [[ $status == 200 ]] || fail "$status" "listing $name's model configurations"
    config=$(field '[.configs[]? | select(.name == "claude")][0].uuid // empty')
    if [[ -z "$config" ]]; then
      jq -n --arg d "Claude for ${DISPLAY[$i]}, through the AI gateway with its own budget" --arg env "$ENV" \
        '{name: "claude", description: $d, type: "llm",
          envMappings: {($env): {providerName: "anthropic", configuration: {policies: []}}}}' > "$WORK/body"
      status=$(api POST "$base" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "creating $name's model configuration"
      config=$(field .uuid)
      log "$name: model configuration created"
    fi
    status=$(api GET "$base/$config"); [[ $status == 200 ]] || fail "$status" "reading $name's model configuration"
    url=$(field ".envMappings.\"$ENV\".configuration.url // empty")
    [[ -n "$url" ]] || die "no gateway URL in $name's model configuration"
    echo "$url/v1" > "$WORK/llm-url-$i"
    status=$(api GET "$base/$config/environments/$ENV/api-keys"); [[ $status == 200 ]] || fail "$status" "listing $name's model keys"
    jq -n --arg n "$name" --arg d "${DISPLAY[$i]}" '{name: $n, displayName: $d}' > "$WORK/body"
    if jq -e --arg n "$name" '.. | objects | select(.name? == $n)' "$WORK/resp" >/dev/null; then
      status=$(api PUT "$base/$config/environments/$ENV/api-keys/$name" "$WORK/body")
    else
      status=$(api POST "$base/$config/environments/$ENV/api-keys" "$WORK/body")
    fi
    [[ $status == 20? ]] || fail "$status" "issuing $name's model key"
    field .apiKey > "$WORK/llm-key-$i"
    [[ -s "$WORK/llm-key-$i" ]] || die "no model key returned for $name"
  fi
  jq -n '{expires_in: "8760h"}' > "$WORK/body"
  status=$(api POST "/orgs/$ORG/projects/$PROJECT/agents/$name/token?environment=$ENV" "$WORK/body"); [[ $status == 20? ]] || fail "$status" "issuing $name's tracing key"
  field .token > "$WORK/trace-key-$i"
done
log "gateway keys: $([[ -n "$PROVIDER_UUID" ]] && echo issued || echo 'none (no LLM provider)') · tracing keys: issued"

# ── Write the integration's settings (secrets.toml block) and the trace router's routes ──
jq -n \
  --argjson mcp "$($SKIP_MCP && echo false || echo true)" --arg vhost "$VHOST" --arg tokenUrl "$TOKEN_URL" --arg console "$CONSOLE" --arg project "$PROJECT" \
  --arg llm "$([[ -n "$PROVIDER_UUID" ]] && echo "$VHOST/anthropic/v1")" \
  --rawfile c0 "$WORK/client-id-0" --rawfile c1 "$WORK/client-id-1" --rawfile c2 "$WORK/client-id-2" \
  --rawfile s0 "$WORK/client-secret-0" --rawfile s1 "$WORK/client-secret-1" --rawfile s2 "$WORK/client-secret-2" \
  --rawfile l0 "$WORK/llm-key-0" --rawfile l1 "$WORK/llm-key-1" --rawfile l2 "$WORK/llm-key-2" \
  --rawfile u0 "$WORK/llm-url-0" --rawfile u1 "$WORK/llm-url-1" --rawfile u2 "$WORK/llm-url-2" \
  --rawfile t0 "$WORK/trace-key-0" --rawfile t1 "$WORK/trace-key-1" --rawfile t2 "$WORK/trace-key-2" \
  --arg n0 "${NAMES[0]}" --arg n1 "${NAMES[1]}" --arg n2 "${NAMES[2]}" \
  --arg d0 "${DISPLAY[0]}" --arg d1 "${DISPLAY[1]}" --arg d2 "${DISPLAY[2]}" \
  --arg r0 "${ROLES[0]}" --arg r1 "${ROLES[1]}" --arg r2 "${ROLES[2]}" '
  def t: rtrimstr("\n");
  def ehrReader: {ehr: ["fhir-ehr:read"], pubmed: ["pubmed:search"]};
  {
    agentManager: {
      enabled: true, consoleUrl: $console, orgName: "default", projectName: $project,
      llmGatewayUrl: $llm, tokenUrl: $tokenUrl,
      mcpProxyUrls: (if $mcp then {ehr: ($vhost + "/fhir-ehr/mcp"), lab: ($vhost + "/fhir-lab/mcp"),
        pubmed: ($vhost + "/pubmed/mcp")} else {} end),
      copilot: {name: $n0, displayName: $d0, llmGatewayUrl: ($u0|t), llmApiKey: ($l0|t), clientId: ($c0|t), clientSecret: ($s0|t),
        mcpScopes: ehrReader, roles: ["ehr-reader", "literature-searcher"]},
      analyst: {name: $n1, displayName: $d1, llmGatewayUrl: ($u1|t), llmApiKey: ($l1|t), clientId: ($c1|t), clientSecret: ($s1|t),
        mcpScopes: (ehrReader + {lab: ["fhir-lab:read"]}), roles: ["ehr-reader", "lab-reader", "literature-searcher"]},
      carePlanner: {name: $n2, displayName: $d2, llmGatewayUrl: ($u2|t), llmApiKey: ($l2|t), clientId: ($c2|t), clientSecret: ($s2|t),
        mcpScopes: {pubmed: ["pubmed:search"]}, roles: ["literature-searcher"]}
    },
    routes: {
      endpoint: ($vhost + "/otel/v1/traces"),
      agents: {($r0): {agent: $n0, apiKey: ($t0|t)}, ($r1): {agent: $n1, apiKey: ($t1|t)}, ($r2): {agent: $n2, apiKey: ($t2|t)}}
    }
  }' > "$WORK/settings.json"

mkdir -p .amp
umask 077
jq '.routes' "$WORK/settings.json" > .amp/trace-routes.json
# The trace router runs as `nobody`; the file holds only tracing keys and stays out of git.
chmod 644 .amp/trace-routes.json

# Replace the generated block at the end of secrets.toml (the integration's config; mode 600).
BEGIN="# >>> generated by scripts/amp-setup.sh — re-run it instead of editing"
END="# <<< generated by scripts/amp-setup.sh"
awk -v b="$BEGIN" -v e="$END" '$0 == b {skip = 1} !skip {print} $0 == e {skip = 0}' secrets.toml > "$WORK/secrets.toml"
jq -r --arg b "$BEGIN" --arg e "$END" '
  def q: tojson;
  def arr: "[" + (map(q) | join(", ")) + "]";
  .agentManager as $m |
  [$b,
   "[wso2healthcare.ehr_agentic_integration.agentManager]",
   "enabled = true",
   "consoleUrl = \($m.consoleUrl | q)", "orgName = \($m.orgName | q)", "projectName = \($m.projectName | q)",
   "llmGatewayUrl = \($m.llmGatewayUrl | q)", "tokenUrl = \($m.tokenUrl | q)",
   "",
   "[wso2healthcare.ehr_agentic_integration.agentManager.mcpProxyUrls]",
   ($m.mcpProxyUrls | to_entries[] | "\(.key) = \(.value | q)"),
   (["copilot", "analyst", "carePlanner"][] as $k | $m[$k] as $a |
     "", "[wso2healthcare.ehr_agentic_integration.agentManager.\($k)]",
     "name = \($a.name | q)", "displayName = \($a.displayName | q)",
     "llmGatewayUrl = \($a.llmGatewayUrl | q)", "llmApiKey = \($a.llmApiKey | q)",
     "clientId = \($a.clientId | q)", "clientSecret = \($a.clientSecret | q)", "roles = \($a.roles | arr)",
     "", "[wso2healthcare.ehr_agentic_integration.agentManager.\($k).mcpScopes]",
     ($a.mcpScopes | to_entries[] | "\(.key) = \(.value | arr)")),
   $e] | .[]' "$WORK/settings.json" >> "$WORK/secrets.toml"
cat "$WORK/secrets.toml" > secrets.toml
chmod 600 secrets.toml
log "wrote the agentManager block in secrets.toml and .amp/trace-routes.json"

# ── Per-agent budgets on the model configurations (amp/budgets.json) ──
if [[ -n "$PROVIDER_UUID" ]]; then
  ./scripts/amp-budgets.sh
fi
# The block above holds the agents' Claude keys; when the agents run on OpenRouter (amp-models.sh), point
# them back at their OpenRouter model configurations.
if grep -q '^modelProvider *= *"openrouter"' config/integration.toml; then
  ./scripts/amp-models.sh openrouter --no-restart
fi

# ── Apply: the integration reads its config at start; the router re-reads routes on every flush ──
if docker compose ps --status running --services 2>/dev/null | grep -qx integration; then
  docker compose restart integration >/dev/null
  log "integration restarting with Agent Manager settings…"
  for _ in $(seq 1 60); do curl -sf http://localhost:9090/api/health >/dev/null && break; sleep 2; done
fi

cat <<EOF

Agent Manager is governing the agents.
  Console        $CONSOLE   (admin / admin) → project "Longevity Clinic"
  Agents         ${NAMES[*]}
  AI gateway     $([[ -n "$PROVIDER_UUID" ]] && echo "provider 'anthropic'; each agent has its own model configuration, key and budget (amp/budgets.json)" || echo "not set up — agents call Claude directly")
  MCP proxies    $($SKIP_MCP && echo "not set up — agents reach the MCP servers directly" || echo "$VHOST/{fhir-ehr,fhir-lab,pubmed}/mcp (AgentID; roles ehr-reader, lab-reader, literature-searcher, ehr-writer)")
  FHIR policy    $([[ "$FHIR_POLICY" != '[]' ]] && echo "mcp-fhir-deidentify on fhir-ehr and fhir-lab (amp/fhir-deidentify.json)" || echo "not attached (./scripts/amp-gateway.sh adds it to the gateway)")
  Traces         $CONSOLE/org/$ORG/project/$PROJECT/agents/<agent>/environment/$ENV/observability/traces
EOF
