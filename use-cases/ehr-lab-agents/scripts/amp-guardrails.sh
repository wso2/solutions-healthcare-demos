#!/usr/bin/env bash
# PHI guardrail on WSO2 Agent Manager's AI gateway: before any agent request reaches Claude, the gateway
# redacts identifiers (replaced by *****), in the whole request — the history and the FHIR data in tool
# results as well as the latest message. Claude never sees them, so it cannot repeat them either. Agents
# address the EHR by FHIR resource id (Patient/p-…), which is not PHI and is left alone.
#
#   ./scripts/amp-guardrails.sh            # apply (idempotent; after amp-setup.sh)
#   ./scripts/amp-guardrails.sh --verify   # also show what the model saw, through the Copilot's gateway key
#   ./scripts/amp-guardrails.sh --remove   # take the guardrail off again (for a before/after demo)
#   ./scripts/amp-guardrails.sh --provider openrouter   # the same on the OpenRouter provider (amp-openrouter.sh)
#
# Redacted: medical record numbers (MRN-…, ATH-…), SSNs, US phone numbers — structured identifiers a regex
# finds reliably. Not emails: the policy matches on the raw JSON text, and the email pattern can start
# inside an escape sequence ("\nname@host"), leaving an invalid "\*****" that Anthropic rejects
# (ISSUES_TO_REPORT.md D6). Names and addresses need an NER guardrail (the gateway also ships
# aws-bedrock-guardrail and azure-content-safety policies for that).
# Why redact rather than mask-and-restore: restoring depends on the model copying a placeholder exactly,
# and Claude sometimes reformats it ("MRN_0001" without brackets), so the "restored" value is wrong.
set -euo pipefail
cd "$(dirname "$0")/.."

API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
ORG=default
PROVIDER=anthropic
POLICY=pii-masking-regex

MODE=apply
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verify) VERIFY=true ;;
    --remove) MODE=remove ;;
    --provider) PROVIDER="${2:?--provider needs a provider name}"; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
  shift
done
VERIFY="${VERIFY:-false}"

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
log() { printf '\033[0;34m[amp-guardrails]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-guardrails] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=amp:llm-provider:read amp:llm-provider:update amp:llm-provider:deploy amp:llm-provider:configure-guardrail" \
  "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || die "could not get an admin token from $THUNDER"
auth=(-H "Authorization: Bearer $TOKEN")

# The policy version the gateway offers.
VERSION=$(curl -sS "${auth[@]}" "$API/orgs/$ORG/llm-providers/policies?providerId=$PROVIDER" \
  | jq -r --arg p "$POLICY" '[(.policies // .list // .)[]? | select(.name == $p)][0].version // empty')
[[ -n "$VERSION" ]] || die "the gateway does not offer $POLICY"

# jsonPath "" covers the whole request body. Every pattern starts at a word boundary with a digit or an
# uppercase letter, so a match can never begin inside a JSON escape sequence.
jq -n --arg name "$POLICY" --arg version "$VERSION" '{name: $name, version: $version,
  paths: [{path: "/*", methods: ["*"], params: {
    jsonPath: "", redactPII: true,
    customPIIEntities: [
      {piiEntity: "MRN",   piiRegex: "\\b(?:MRN|ATH)-\\d{4,8}\\b"},
      {piiEntity: "SSN",   piiRegex: "\\b\\d{3}-\\d{2}-\\d{4}\\b"},
      {piiEntity: "PHONE", piiRegex: "\\(?\\b\\d{3}\\)?[-. ]\\d{3}[-. ]\\d{4}\\b"}
    ]}}]}' > "$WORK/policy"

# PUT replaces the whole provider, so start from the stored one. `upstream` is left out to keep the stored
# Anthropic key; `gateways` must be present for the change to reach the gateway.
curl -sS "${auth[@]}" "$API/orgs/$ORG/llm-providers/$PROVIDER" -o "$WORK/provider"
jq -e .uuid "$WORK/provider" >/dev/null || die "LLM provider $PROVIDER not found — run ./scripts/amp-setup.sh"
UUID=$(jq -r .uuid "$WORK/provider")   # reads take the handle, updates only the UUID
GATEWAY=$(curl -sS "${auth[@]}" "$API/orgs/$ORG/llm-providers/$UUID/deployments" \
  | jq -r '[.[]? | select(.status == "DEPLOYED")][0].gatewayId // empty')
[[ -n "$GATEWAY" ]] || die "LLM provider $PROVIDER is not deployed"
jq --slurpfile policy "$WORK/policy" --arg name "$POLICY" --arg gw "$GATEWAY" --arg mode "$MODE" '
  del(.upstream, .uuid, .status, .createdAt, .updatedAt, .deployments)
  | .gateways = [$gw]
  | .policies = ((.policies // []) | map(select(.name != $name)) + (if $mode == "apply" then $policy else [] end))' \
  "$WORK/provider" > "$WORK/body"
status=$(curl -sS -o "$WORK/resp" -w '%{http_code}' -X PUT "${auth[@]}" -H 'Content-Type: application/json' \
  --data-binary "@$WORK/body" "$API/orgs/$ORG/llm-providers/$UUID")
[[ $status == 20? ]] || die "updating $PROVIDER failed (HTTP $status): $(head -c 400 "$WORK/resp")"
if [[ $MODE == apply ]]; then
  log "$POLICY $VERSION on provider $PROVIDER: MRNs, SSNs and phone numbers redacted before anything reaches the model"
else
  log "$POLICY removed from provider $PROVIDER"
fi
sleep 5   # the gateway picks the change up asynchronously

if $VERIFY; then
  # Ask Claude, through the Copilot's own gateway key, what it actually received.
  KEY=$(awk '/^\[wso2healthcare.ehr_agentic_integration.agentManager.copilot\]/{f=1;next} /^\[/{f=0} f && /^llmApiKey/{gsub(/.*= *"|"$/,"");print;exit}' secrets.toml)
  # The Copilot's own model configuration (its LLM proxy inherits the provider's guardrail).
  URL=$(awk '/^\[wso2healthcare.ehr_agentic_integration.agentManager.copilot\]/{f=1;next} /^\[/{f=0} f && /^llmGatewayUrl/{gsub(/.*= *"|"$/,"");print;exit}' secrets.toml)
  [[ -n "$KEY" && -n "$URL" ]] || die "no gateway key in secrets.toml — run ./scripts/amp-setup.sh"
  ASK="Patient record number MRN-100234, SSN 123-45-6789, phone 617-555-0142. Repeat the record number, the SSN and the phone number exactly as you received them, one per line, nothing else."
  # The agents' active model (config/integration.toml): Claude speaks the Messages API, OpenRouter the OpenAI one.
  if grep -q '^modelProvider *= *"openrouter"' config/integration.toml; then
    MODEL=$(sed -n 's/^openrouterModelName *= *"\(.*\)"/\1/p' config/integration.toml)
    jq -n --arg m "$MODEL" --arg q "$ASK" '{model: $m, max_tokens: 200, messages: [{role: "user", content: $q}]}' > "$WORK/msg"
    # From the host, straight to the gateway with the key in x-api-key (what infra/llm-auth-adapter does).
    URL="http://default-default.gateway.localhost:19080/${URL#http*://*/}"
    printf 'x-api-key: %s\n' "$KEY" > "$WORK/auth"
    curl -sS "$URL/chat/completions" -H @"$WORK/auth" -H 'Content-Type: application/json' --data-binary "@$WORK/msg" -o "$WORK/reply"
    TEXT='.choices[0].message.content // .error.message // .'
  else
    MODEL=claude-sonnet-4-6
    jq -n --arg m "$MODEL" --arg q "$ASK" '{model: $m, max_tokens: 200, messages: [{role: "user", content: $q}]}' > "$WORK/msg"
    curl -sS "$URL/messages" -H "x-api-key: $KEY" -H 'anthropic-version: 2023-06-01' -H 'Content-Type: application/json' \
      --data-binary "@$WORK/msg" -o "$WORK/reply"
    TEXT='.content[0].text // .error.message // .'
  fi
  echo "Sent:   MRN-100234 · SSN 123-45-6789 · 617-555-0142"
  echo "$MODEL repeats what it received:"
  jq -r "$TEXT" "$WORK/reply" | sed 's/^/  /'
  echo "Usage: $(jq -c '.usage // {}' "$WORK/reply")"
fi
