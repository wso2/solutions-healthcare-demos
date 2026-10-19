#!/usr/bin/env bash
# Installs WSO2 Agent Manager (AMP) on a local k3d cluster `amp-local`, inside the same colima VM
# as the demo stack. Idempotent: AMP's installer skips what is already there, so re-running is safe.
#
#   ./scripts/amp-install.sh            # ~15-20 minutes on first run
#
# The installer runs in AMP's own quick-start container (the release's tested toolchain: bash 5,
# k3d, kubectl, helm), so the host needs only colima and docker. Running the release's
# k3d-install.sh on the host instead fails on macOS: its install.sh needs bash 4+ and macOS ships
# 3.2. Afterwards run ./scripts/amp-setup.sh to register the demo's agents.
set -euo pipefail

AMP_VERSION="${AMP_VERSION:-1.0.0}"
COLIMA_PROFILE="${COLIMA_PROFILE:-agent-manager}"
IMAGE="ghcr.io/wso2/amp-quick-start:v${AMP_VERSION}"

log() { printf '\033[0;34m[amp-install]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[amp-install] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is required (brew install colima docker docker-compose)"

# AMP and the demo share one VM: the demo's containers reach AMP's gateway through the VM, and
# one VM is one thing to start before a demo.
if [[ "$(docker context show)" != "colima-${COLIMA_PROFILE}" ]]; then
  die "docker is not pointed at colima profile '${COLIMA_PROFILE}' — run ./scripts/colima-up.sh first"
fi

log "Installing Agent Manager ${AMP_VERSION} with ${IMAGE}"
# The image's entrypoint grants its user the docker socket's group, then opens an interactive
# shell; the last line is swapped for one that runs the installer instead. `su -c` does not read
# the image's profile, which is what puts /usr/local/bin (k3d, kubectl, helm) on PATH.
# K3D_FIX_DNS=0: k3d's DNS fix points the node at the Docker host gateway, which resolves nothing
# on colima (AMP's own installers set the same).
docker run --rm --name amp-quick-start \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --network=host \
  --entrypoint /bin/bash \
  "$IMAGE" \
  -c 'sed -i "s|^exec su - wso2-amp\$|exec su - wso2-amp -c \"PATH=/usr/local/bin:\\\$PATH K3D_FIX_DNS=0 ./install.sh\"|" /entrypoint.sh && exec /entrypoint.sh'
