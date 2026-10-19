#!/usr/bin/env bash
# Custom gateway for WSO2 Agent Manager: the stock API Platform gateway 1.2.1 — every stock policy at the
# version 1.2.1 ships — plus mcp-fhir-deidentify (gateway/policies/mcp-fhir-deidentify), FHIR-aware
# de-identification of MCP tool results. Once the gateway runs it, Agent Manager lists the policy for MCP
# proxies, and amp-setup.sh attaches it to the two FHIR MCP proxies (config: amp/fhir-deidentify.json).
#
#   ./scripts/amp-gateway.sh             # test, build, load into Agent Manager's cluster, switch (idempotent)
#   ./scripts/amp-gateway.sh --restore   # switch Agent Manager's gateway back to the stock images
#
# How: WSO2's gateway-builder compiles the policy into the policy engine (gateway-runtime image) and adds its
# definition to the gateway-controller image; both are imported into the k3d cluster, and the gateway's Helm
# values (ConfigMap api-platform-default-default-config, reconciled by the gateway operator) point at them —
# including the controller's policy definitions path, which the chart pins to the stock ./default-policies.
# The hash operation's key is generated once into .amp/fhir-hash.key and set as the gateway's
# policy_configurations.mcpfhirdeidentify_v0.hash_key.
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER=amp-local
NS=default-default
VALUES_CM=api-platform-default-default-config
RUNTIME_DEPLOY=api-platform-default-default-gw-gateway-gateway-runtime
CONTROLLER_DEPLOY=api-platform-default-default-gw-gateway-controller
BUILDER=ghcr.io/wso2/api-platform/gateway-builder:1.2.1
YQ=mikefarah/yq:4.44.3
API="${AMP_API:-http://api.amp.localhost:8080/api/v1}"
THUNDER="${AMP_THUNDER:-http://thunder.amp.localhost:8080}"
POLICY_DIR=gateway/policies/mcp-fhir-deidentify

MODE=install
for arg in "$@"; do
  case "$arg" in
    --restore) MODE=restore ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 1 ;;
  esac
done

WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
log() { printf '\033[0;34m[amp-gateway]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-gateway] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }
kc() { docker exec -i "k3d-$CLUSTER-server-0" kubectl "$@"; }
yq() { docker run --rm -i "$YQ" "$@"; }

docker inspect "k3d-$CLUSTER-server-0" >/dev/null 2>&1 || die "Agent Manager's cluster is not running — run ./scripts/amp-install.sh"

image_of() { kc -n "$NS" get deploy "$1" -o jsonpath='{.spec.template.spec.containers[0].image}'; }

# Apply a yq expression to the gateway's Helm values and wait until both deployments run the given images.
switch() {
  local expr="$1" runtime="$2" controller="$3"
  kc -n "$NS" get cm "$VALUES_CM" -o jsonpath='{.data.values\.yaml}' > "$WORK/values.yaml"
  yq "$expr" < "$WORK/values.yaml" > "$WORK/values.new.yaml"
  if cmp -s "$WORK/values.yaml" "$WORK/values.new.yaml"; then
    log "gateway values already up to date"
  else
    jq -Rs '{data: {"values.yaml": .}}' < "$WORK/values.new.yaml" > "$WORK/patch.json"
    kc -n "$NS" patch cm "$VALUES_CM" --type merge --patch-file /dev/stdin < "$WORK/patch.json" >/dev/null
    log "gateway values updated; waiting for the operator to roll the gateway"
  fi
  for _ in $(seq 1 60); do
    [[ "$(image_of "$RUNTIME_DEPLOY")" == "$runtime" && "$(image_of "$CONTROLLER_DEPLOY")" == "$controller" ]] && break
    sleep 5
  done
  [[ "$(image_of "$RUNTIME_DEPLOY")" == "$runtime" ]] || die "the gateway operator did not switch the runtime to $runtime"
  kc -n "$NS" rollout status "deploy/$CONTROLLER_DEPLOY" --timeout=300s >/dev/null
  kc -n "$NS" rollout status "deploy/$RUNTIME_DEPLOY" --timeout=300s >/dev/null
  log "gateway runtime:    $(image_of "$RUNTIME_DEPLOY")"
  log "gateway controller: $(image_of "$CONTROLLER_DEPLOY")"
}

if [[ "$MODE" == restore ]]; then
  switch 'del(.gateway.controller.image) | del(.gateway.gatewayRuntime.image) | del(.gateway.config.policy_configurations.mcpfhirdeidentify_v0)
    | del(.gateway.config.controller.policies.definitions_path)' \
    ghcr.io/wso2/api-platform/gateway-runtime:1.2.1 ghcr.io/wso2/api-platform/gateway-controller:1.2.1
  log "back on the stock gateway — re-run ./scripts/amp-setup.sh so the FHIR MCP proxies drop the policy"
  exit 0
fi

# 1. Test the policy, and validate the demo's configuration against it (Go from the builder image, so
#    nothing needs installing).
log "testing $POLICY_DIR with amp/fhir-deidentify.json"
docker run --rm -v "$PWD/$POLICY_DIR:/src" -v "$PWD/amp/fhir-deidentify.json:/config.json:ro" \
  -e MCP_FHIR_DEIDENTIFY_CONFIG=/config.json -v ehr-lab-gomod:/go/pkg/mod -w /src --entrypoint go "$BUILDER" \
  test -count=1 ./... > "$WORK/test.log" 2>&1 || { cat "$WORK/test.log" >&2; die "policy tests failed"; }

# 2. Build. The tag carries a hash of the policy source, so a changed policy rolls out as a new image.
TAG="1.2.1-fhir-$(cat gateway/build.yaml "$POLICY_DIR"/*.go "$POLICY_DIR"/policy-definition.yaml "$POLICY_DIR"/go.* | shasum | cut -c1-10)"
RUNTIME_IMAGE="ehr-lab/amp-gateway-runtime:$TAG"
CONTROLLER_IMAGE="ehr-lab/amp-gateway-controller:$TAG"
if docker image inspect "$RUNTIME_IMAGE" "$CONTROLLER_IMAGE" >/dev/null 2>&1; then
  log "images $TAG already built"
else
  log "building the gateway with gateway-builder 1.2.1 (first run downloads every policy module, ~5 min)"
  rm -rf gateway/output
  docker run --rm -v "$PWD/gateway:/workspace" -v ehr-lab-gomod:/go/pkg/mod "$BUILDER" -log-format text \
    > "$WORK/build.log" 2>&1 || { tail -30 "$WORK/build.log" >&2; die "gateway-builder failed"; }
  docker build -q -t "$RUNTIME_IMAGE" gateway/output/gateway-runtime >/dev/null
  docker build -q -t "$CONTROLLER_IMAGE" gateway/output/gateway-controller >/dev/null
  log "built $RUNTIME_IMAGE and $CONTROLLER_IMAGE"
fi

# 3. Load into the cluster (no registry involved; pullPolicy IfNotPresent).
log "importing the images into $CLUSTER"
k3d image import -c "$CLUSTER" "$RUNTIME_IMAGE" "$CONTROLLER_IMAGE" > "$WORK/import.log" 2>&1 \
  || { cat "$WORK/import.log" >&2; die "k3d image import failed"; }

# 4. Hash key, generated once.
mkdir -p .amp
if [[ ! -s .amp/fhir-hash.key ]]; then
  (umask 077; openssl rand -hex 32 > .amp/fhir-hash.key)
fi
HASH_KEY="$(cat .amp/fhir-hash.key)"

# 5. Switch.
switch ".gateway.controller.image = {\"repository\": \"ehr-lab/amp-gateway-controller\", \"tag\": \"$TAG\", \"pullPolicy\": \"IfNotPresent\"}
  | .gateway.gatewayRuntime.image = {\"repository\": \"ehr-lab/amp-gateway-runtime\", \"tag\": \"$TAG\", \"pullPolicy\": \"IfNotPresent\"}
  | .gateway.config.policy_configurations.mcpfhirdeidentify_v0.hash_key = \"$HASH_KEY\"
  | .gateway.config.controller.policies.definitions_path = \"/app/policies\"" \
  "$RUNTIME_IMAGE" "$CONTROLLER_IMAGE"

# 6. Agent Manager offers the policy once the gateway reports it.
TOKEN="$(curl -sS -u amp-api-client:amp-api-client-secret -d grant_type=client_credentials \
  --data-urlencode "scope=amp:mcp-server:read" "$THUNDER/oauth2/token" | jq -r '.access_token // empty')"
for _ in $(seq 1 24); do
  VERSION=$(curl -sS -H "Authorization: Bearer $TOKEN" "$API/orgs/default/mcp-proxies/policies" \
    | jq -r '[.list[]? | select(.name == "mcp-fhir-deidentify")][0].version // empty')
  [[ -n "$VERSION" ]] && break
  sleep 5
done
[[ -n "$VERSION" ]] || die "Agent Manager does not list mcp-fhir-deidentify yet (GET /orgs/default/mcp-proxies/policies)"
log "Agent Manager offers mcp-fhir-deidentify $VERSION for MCP proxies — run ./scripts/amp-setup.sh to attach it"
