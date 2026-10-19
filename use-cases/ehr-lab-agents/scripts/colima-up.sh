#!/usr/bin/env bash
# Starts (or creates) the colima VM that runs the whole demo: the docker-compose stack and the
# Agent Manager k3d cluster. Sized for both; AMP's docs recommend vz + rosetta + a network address.
#
#   ./scripts/colima-up.sh
#
# Override with COLIMA_PROFILE / COLIMA_CPU / COLIMA_MEMORY. Resizing an existing VM can break the
# k3d cluster inside it, so the size only applies when the profile is first created.
set -euo pipefail

PROFILE="${COLIMA_PROFILE:-agent-manager}"
CPU="${COLIMA_CPU:-6}"
MEMORY="${COLIMA_MEMORY:-14}"
DISK="${COLIMA_DISK:-120}"

command -v colima >/dev/null 2>&1 || { echo "colima is required: brew install colima docker docker-compose" >&2; exit 1; }

if colima status --profile "$PROFILE" >/dev/null 2>&1; then
  echo "colima profile '$PROFILE' is running"
else
  colima start --profile "$PROFILE" --vm-type=vz --vz-rosetta --network-address \
    --cpu "$CPU" --memory "$MEMORY" --disk "$DISK"
fi
docker context use "colima-${PROFILE}" >/dev/null
docker info --format 'docker: {{.Name}} · {{.NCPU}} CPUs · {{.MemTotal}} bytes'
