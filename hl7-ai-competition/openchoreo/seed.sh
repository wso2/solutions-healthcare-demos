#!/usr/bin/env bash
# Seeds demo data into the OpenChoreo-deployed stack via temporary port-forwards, then
# restarts fhir-sync so the care-loop store picks the new data up immediately.
set -euo pipefail

KUBE_CONTEXT="${1:?usage: seed.sh <kube-context>}"
KCTL="kubectl --context=${KUBE_CONTEXT}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DP_NS="$(${KCTL} get ns -o name | grep '^namespace/dp-' | head -1 | cut -d/ -f2)"

log() { echo "==> $*"; }

PIDS=()
cleanup() { kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT

log "Port-forwarding apple-healthkit-simulator and ehr-fhir-server"
${KCTL} port-forward -n "${DP_NS}" svc/apple-healthkit-simulator 18000:8000 >/dev/null 2>&1 &
PIDS+=($!)
${KCTL} port-forward -n "${DP_NS}" svc/ehr-fhir-server 19090:9090 >/dev/null 2>&1 &
PIDS+=($!)
sleep 3

log "Seeding demo patients and vitals"
HEALTHKIT_URL="http://localhost:18000" EHR_FHIR_SERVER_URL="http://localhost:19090/fhir/r4" \
  bun "${REPO_ROOT}/scripts/seed/index.ts"

log "Restarting fhir-sync for an immediate EHR -> care-loop sync cycle"
FHIR_SYNC_DEPLOY="$(${KCTL} get deploy -n "${DP_NS}" -o name | grep fhir-sync | cut -d/ -f2)"
${KCTL} rollout restart -n "${DP_NS}" "deployment/${FHIR_SYNC_DEPLOY}"
${KCTL} rollout status -n "${DP_NS}" "deployment/${FHIR_SYNC_DEPLOY}" --timeout=120s

log "Seed complete."
