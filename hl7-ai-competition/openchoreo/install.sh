#!/usr/bin/env bash
# Idempotent installer for OpenChoreo (control plane + data plane) on an existing kube context. See README.md.
set -euo pipefail

KUBE_CONTEXT="${1:-$(kubectl config current-context)}"
KCTL="kubectl --context=${KUBE_CONTEXT}"
HELM="helm --kube-context=${KUBE_CONTEXT}"
RELEASE_REF="release-v1.1"
RAW_BASE="https://raw.githubusercontent.com/openchoreo/openchoreo/${RELEASE_REF}"

log() { echo "==> $*"; }

# raw.githubusercontent.com 429-rate-limits anonymous requests, so fetch once with manual backoff.
fetch_raw() {
  local url="$1" dest="$2" attempt
  for attempt in 1 2 3 4 5; do
    if curl -sf -o "${dest}" "${url}"; then
      return 0
    fi
    log "Fetch failed (attempt ${attempt}/5) for ${url}, retrying after backoff"
    sleep $((attempt * 15))
  done
  log "ERROR: failed to fetch ${url} after 5 attempts"
  return 1
}

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

log "Using kube context: ${KUBE_CONTEXT}"

log "Verifying kube context is reachable"
${KCTL} cluster-info >/dev/null

log "Installing Gateway API CRDs (v1.4.1)"
${KCTL} apply --server-side \
  -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.1/experimental-install.yaml

log "Installing cert-manager v1.19.4"
${HELM} upgrade --install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --version v1.19.4 \
  --set crds.enabled=true \
  --wait --timeout 180s

log "Installing External Secrets Operator v2.0.1"
${HELM} upgrade --install external-secrets oci://ghcr.io/external-secrets/charts/external-secrets \
  --namespace external-secrets \
  --create-namespace \
  --version 2.0.1 \
  --set installCRDs=true \
  --wait --timeout 180s

log "Installing kgateway CRDs v2.2.1"
${HELM} upgrade --install kgateway-crds oci://cr.kgateway.dev/kgateway-dev/charts/kgateway-crds \
  --create-namespace --namespace openchoreo-control-plane \
  --version v2.2.1

log "Installing kgateway controller v2.2.1"
${HELM} upgrade --install kgateway oci://cr.kgateway.dev/kgateway-dev/charts/kgateway \
  --namespace openchoreo-control-plane --create-namespace \
  --version v2.2.1 \
  --set controller.extraEnv.KGW_ENABLE_GATEWAY_API_EXPERIMENTAL_FEATURES=true

# The blocks below are required on top of the charts (else nothing can deploy); per install/k3d/single-cluster/README.md, minus optional Thunder/workflow/observability.
log "Creating backstage-secrets (placeholder dev values, matches upstream single-cluster guide)"
${KCTL} create namespace openchoreo-control-plane --dry-run=client -o yaml | ${KCTL} apply -f -
${KCTL} create secret generic backstage-secrets \
  -n openchoreo-control-plane \
  --from-literal=backend-secret="$(head -c 32 /dev/urandom | base64)" \
  --from-literal=client-secret="backstage-portal-secret" \
  --from-literal=jenkins-api-key="placeholder-not-in-use" \
  --dry-run=client -o yaml | ${KCTL} apply -f -

log "Installing OpenBao v0.25.6 and configuring Kubernetes auth + ClusterSecretStore"
fetch_raw "${RAW_BASE}/install/prerequisites/openbao/setup.sh" "${WORKDIR}/openbao-setup.sh"
chmod +x "${WORKDIR}/openbao-setup.sh"
"${WORKDIR}/openbao-setup.sh" --dev --seed-dev-secrets --kube-context "${KUBE_CONTEXT}"

log "Installing OpenChoreo control plane v1.1.1"
fetch_raw "${RAW_BASE}/install/k3d/single-cluster/values-cp.yaml" "${WORKDIR}/values-cp.yaml"
${HELM} upgrade --install openchoreo-control-plane oci://ghcr.io/openchoreo/helm-charts/openchoreo-control-plane \
  --version 1.1.1 \
  --namespace openchoreo-control-plane \
  --create-namespace \
  --values "${WORKDIR}/values-cp.yaml"

log "Waiting for control plane deployments to become available"
${KCTL} wait -n openchoreo-control-plane --for=condition=available --timeout=300s deployment --all

log "Extracting cluster-gateway CA into a ConfigMap (control plane)"
${KCTL} wait -n openchoreo-control-plane --for=condition=Ready certificate/cluster-gateway-ca --timeout=120s
${KCTL} get secret cluster-gateway-ca -n openchoreo-control-plane \
  -o jsonpath='{.data.ca\.crt}' | base64 -d | \
  ${KCTL} create configmap cluster-gateway-ca \
    --from-file=ca.crt=/dev/stdin \
    -n openchoreo-control-plane \
    --dry-run=client -o yaml | ${KCTL} apply -f -

log "Applying default OpenChoreo resources (ClusterComponentTypes, Project, Environment, DeploymentPipeline)"
fetch_raw "${RAW_BASE}/samples/getting-started/all.yaml" "${WORKDIR}/getting-started-all.yaml"
${KCTL} apply -f "${WORKDIR}/getting-started-all.yaml"
${KCTL} label namespace default openchoreo.dev/control-plane=true --overwrite

log "Setting up data plane namespace and cluster-gateway CA ConfigMap"
${KCTL} create namespace openchoreo-data-plane --dry-run=client -o yaml | ${KCTL} apply -f -
CA_CRT="$(${KCTL} get configmap cluster-gateway-ca -n openchoreo-control-plane -o jsonpath='{.data.ca\.crt}')"
${KCTL} create configmap cluster-gateway-ca \
  --from-literal=ca.crt="${CA_CRT}" \
  -n openchoreo-data-plane \
  --dry-run=client -o yaml | ${KCTL} apply -f -

log "Installing OpenChoreo data plane v1.1.1"
fetch_raw "${RAW_BASE}/install/k3d/single-cluster/values-dp.yaml" "${WORKDIR}/values-dp.yaml"
${HELM} upgrade --install openchoreo-data-plane oci://ghcr.io/openchoreo/helm-charts/openchoreo-data-plane \
  --version 1.1.1 \
  --namespace openchoreo-data-plane \
  --create-namespace \
  --values "${WORKDIR}/values-dp.yaml"

log "Waiting for cluster-agent-tls certificate before registering the data plane"
${KCTL} wait -n openchoreo-data-plane --for=condition=Ready certificate/cluster-agent-dataplane-tls --timeout=180s

log "Registering data plane as ClusterDataPlane/default"
AGENT_CA="$(${KCTL} get secret cluster-agent-tls -n openchoreo-data-plane -o jsonpath='{.data.ca\.crt}' | base64 -d)"
${KCTL} apply -f - <<EOF
apiVersion: openchoreo.dev/v1alpha1
kind: ClusterDataPlane
metadata:
  name: default
spec:
  planeID: default
  clusterAgent:
    clientCA:
      value: |
$(echo "${AGENT_CA}" | sed 's/^/        /')
  secretStoreRef:
    name: default
  gateway:
    ingress:
      external:
        http:
          host: openchoreoapis.localhost
          listenerName: http
          port: 19080
        name: gateway-default
        namespace: openchoreo-data-plane
EOF

log "OpenChoreo control plane and data plane installed against context ${KUBE_CONTEXT}"
