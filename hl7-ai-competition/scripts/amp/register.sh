#!/bin/sh
# Register the Care Loop resources in AMP: an LLM provider per configured key
# (OpenAI and/or Anthropic), deployed to the gateway and published to the
# catalog, plus a gateway API key per provider written to /amp-shared. Idempotent.

set -eu

API=${AMP_API_URL:-http://amp:9000}
THUNDER=${AMP_THUNDER_URL:-http://amp:8080}
GATEWAY=${AMP_GATEWAY_URL:-http://amp:22893}
SHARED_DIR=${AMP_SHARED_DIR:-/amp-shared}
CURL="curl -s -m 30 --connect-timeout 5"
SCOPES="amp:org:view amp:llm-provider:read amp:llm-provider:create amp:llm-provider:update amp:llm-provider:deploy amp:llm-provider:api-key-manage amp:gateway:read amp:project:read amp:agent:view amp:agent:read amp:agent:create"

log() { printf '\n== %s\n' "$*"; }

[ -n "${OPENAI_API_KEY:-}" ] || [ -n "${ANTHROPIC_API_KEY:-}" ] || {
    echo "Neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is set; add at least one to hl7-ai-competition/.env" >&2
    exit 1
}

token() {
    $CURL -f -H "Host: thunder.amp.localhost" -u amp-api-client:amp-api-client-secret \
        --data-urlencode "grant_type=client_credentials" \
        --data-urlencode "scope=$SCOPES" \
        "$THUNDER/oauth2/token" | jq -r '.access_token // empty'
}

log "Waiting for the AMP API"
TOK=""
i=0
while [ $i -lt 60 ]; do
    TOK=$(token || true)
    [ -n "$TOK" ] && break
    i=$((i + 1))
    sleep 5
done
[ -n "$TOK" ] || { echo "could not obtain an AMP API token" >&2; exit 1; }

GW_ID=$($CURL -f -H "Authorization: Bearer $TOK" "$API/api/v1/orgs/default/gateways" \
    | jq -r '.gateways[0].uuid')
[ -n "$GW_ID" ] && [ "$GW_ID" != "null" ] || { echo "no gateway found" >&2; exit 1; }
log "Gateway: $GW_ID"

provider_uuid() {
    id=$1
    $CURL -f -H "Authorization: Bearer $TOK" "$API/api/v1/orgs/default/llm-providers" \
        | jq -r --arg id "$id" '.providers[]? | select(.id == $id) | .uuid'
}

# Registers, deploys, and publishes one LLM provider, then mints (or reuses) its gateway key.
#
# $1 id            - provider handle (also used as the gateway context path and key filename)
# $2 display_name   - human-readable name shown in the console
# $3 template       - AMP provider template id (see GET .../llm-provider-templates)
# $4 upstream_url   - real upstream base URL AMP calls on your behalf
# $5 auth_header    - upstream auth header name (from the template's metadata.auth.header)
# $6 auth_value     - upstream auth header value (e.g. "Bearer $KEY", or just "$KEY")
register_provider() {
    id=$1 display_name=$2 template=$3 upstream_url=$4 auth_header=$5 auth_value=$6
    key_file="$SHARED_DIR/$id-gateway.key"

    provider_body() {
        jq -n --arg id "$id" --arg name "$display_name" --arg template "$template" \
            --arg url "$upstream_url" --arg header "$auth_header" --arg value "$auth_value" '{
            id: $id, name: $name, template: $template,
            context: ("/" + $id), version: "v1",
            accessControl: {mode: "allow_all"},
            security: {enabled: true, apiKey: {enabled: true, key: "API-Key", in: "header"}},
            upstream: {main: {url: $url, auth: {type: "api-key", header: $header, value: $value}}}
        }'
    }

    log "LLM provider $id"
    PROVIDER_UUID=$(provider_uuid "$id")
    if [ -z "$PROVIDER_UUID" ]; then
        $CURL -f -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
            "$API/api/v1/orgs/default/llm-providers" -d "$(provider_body)" >/dev/null
        PROVIDER_UUID=$(provider_uuid "$id")
    fi
    [ -n "$PROVIDER_UUID" ] || { echo "provider creation failed for $id" >&2; exit 1; }

    # PUT the full object every run so a rotated key or changed config is reapplied.
    $CURL -f -X PUT -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
        "$API/api/v1/orgs/default/llm-providers/$PROVIDER_UUID" -d "$(provider_body)" >/dev/null

    # Deploy body must be exactly these fields; the decoder rejects extras.
    $CURL -f -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
        "$API/api/v1/orgs/default/llm-providers/$PROVIDER_UUID/deployments" \
        -d "$(jq -n --arg gw "$GW_ID" --arg name "init-$(date +%s)" \
            '{name: $name, base: "current", gatewayId: $gw}')" >/dev/null
    log "Provider $id deployed"

    # Publish to the catalog (artifacts.in_catalog); without it the console view stays empty.
    $CURL -f -X PUT -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
        "$API/api/v1/orgs/default/llm-providers/$PROVIDER_UUID/catalog" \
        -d '{"inCatalog":true}' >/dev/null
    log "Provider $id published to catalog"

    if key_valid "$key_file" "$id"; then
        log "Existing gateway key for $id still accepted; keeping it"
    else
        log "Minting gateway API key for $id"
        GW_KEY=$($CURL -f -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
            "$API/api/v1/orgs/default/llm-providers/$PROVIDER_UUID/api-keys" \
            -d "$(jq -n --arg gw "$GW_ID" --arg name "$id-$(date +%s)" \
                '{name: $name, gatewayId: $gw}')" | jq -r '.apiKey // empty')
        [ -n "$GW_KEY" ] || { echo "gateway key minting failed for $id" >&2; exit 1; }
        umask 077
        printf '%s' "$GW_KEY" > "$key_file"
        log "Gateway key written to $key_file"
    fi
}

key_valid() {
    key_file=$1 id=$2
    [ -s "$key_file" ] || return 1
    code=$($CURL -o /dev/null -w '%{http_code}' -H "API-Key: $(cat "$key_file")" \
        "$GATEWAY/$id/models" || echo 000)
    case "$code" in
        401|403|000) return 1 ;;
        *) return 0 ;;
    esac
}

if [ -n "${OPENAI_API_KEY:-}" ]; then
    register_provider careloop-openai "Care Loop OpenAI" openai \
        "https://api.openai.com/v1" "Authorization" "Bearer $OPENAI_API_KEY"
else
    log "OPENAI_API_KEY not set; skipping the careloop-openai provider"
fi

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
    register_provider careloop-anthropic "Care Loop Anthropic (OpenAI-compatible)" openai \
        "https://api.anthropic.com/v1" "Authorization" "Bearer $ANTHROPIC_API_KEY"
else
    log "ANTHROPIC_API_KEY not set; skipping the careloop-anthropic provider"
fi

# Register the external agent so its traces are visible in the console, then
# resolve the OpenChoreo identity UUIDs and generate the otel-collector config
# that stamps them on spans (the collector is shell-less, so it can't read a
# runtime env file; a generated config is the injection point).
log "External agent careloop-ai-service"
AGENTS="$API/api/v1/orgs/default/projects/default/agents"
if [ -z "$($CURL -H "Authorization: Bearer $TOK" "$AGENTS" | jq -r '.agents[]? | select(.name=="careloop-ai-service") | .name')" ]; then
    $CURL -f -X POST -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" "$AGENTS" \
        -d '{"name":"careloop-ai-service","displayName":"Care Loop AI Service","description":"External Care Loop agent","provisioning":{"type":"external"},"agentType":{"type":"agent-api","subType":"custom-api"}}' >/dev/null 2>&1 || true
fi

log "Resolving OpenChoreo identity for trace scoping"
PROJECT_UID=$($CURL -H "Authorization: Bearer $TOK" "$API/api/v1/orgs/default/projects/default" | jq -r '.uuid // empty' 2>/dev/null || true)
ENV_UID=$($CURL -H "Authorization: Bearer $TOK" "$API/api/v1/orgs/default/environments" | jq -r '(.environments? // .) | .[]? | select(.name=="default") | .id' 2>/dev/null || true)
COMPONENT_UID=""
i=0
while [ $i -lt 12 ]; do
    COMPONENT_UID=$($CURL -H "Authorization: Bearer $TOK" "$AGENTS/careloop-ai-service" | jq -r '.uuid // empty' 2>/dev/null || true)
    [ -n "$COMPONENT_UID" ] && break
    i=$((i + 1)); sleep 5
done
[ -n "$COMPONENT_UID" ] || echo "warning: agent uuid unresolved; traces may not scope to the agent" >&2

cat > "$SHARED_DIR/otelcol-config.yaml" <<EOF
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
processors:
  resource/openchoreo:
    attributes:
      - {key: openchoreo.dev/project-uid, value: "$PROJECT_UID", action: upsert}
      - {key: openchoreo.dev/component-uid, value: "$COMPONENT_UID", action: upsert}
      - {key: openchoreo.dev/environment-uid, value: "$ENV_UID", action: upsert}
      - {key: openchoreo.dev/namespace, value: "default", action: upsert}
exporters:
  otlphttp/amp:
    endpoint: "$GATEWAY/otel"
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [resource/openchoreo]
      exporters: [otlphttp/amp]
EOF
chmod 644 "$SHARED_DIR/otelcol-config.yaml"
log "Wrote otel-collector config to $SHARED_DIR/otelcol-config.yaml"

log "Registration complete"
