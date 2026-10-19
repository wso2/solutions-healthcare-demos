#!/usr/bin/env bash
# One command from a fresh clone to a running demo, on colima.
#
#   ./scripts/up.sh                  # start; on first run, load the saved demo state (seed/snapshot)
#   ./scripts/up.sh --restore        # throw away the current data and load seed/snapshot again
#   ./scripts/up.sh --clean          # throw away the current data and load only the seed patients
#   ./scripts/up.sh --with-amp       # also install WSO2 Agent Manager, register the agents, add the PHI
#                                    # guardrail and the evaluation monitors
#
# First run needs: colima, docker, docker-compose (brew install colima docker docker-compose), and
# an Anthropic key in secrets.toml (copied from secrets.example.toml). --with-amp needs nothing more
# (Agent Manager installs from its own container). Later runs keep the demo's data; nothing is reseeded.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE=keep
WITH_AMP=false
for arg in "$@"; do
  case "$arg" in
    --restore) MODE=restore ;;
    --clean) MODE=clean ;;
    --with-amp) WITH_AMP=true ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 1 ;;
  esac
done

if [[ ! -f secrets.toml ]]; then
  cp secrets.example.toml secrets.toml
  chmod 600 secrets.toml
  echo "Created secrets.toml — put your Anthropic API key in it, then run this again." >&2
  exit 1
fi
if grep -q 'sk-ant-\.\.\.' secrets.toml; then
  echo "secrets.toml still has the placeholder key — add your Anthropic API key first." >&2
  exit 1
fi

./scripts/colima-up.sh
mkdir -p .amp   # Agent Manager credentials land here (amp-setup.sh); the trace router mounts it

echo "Building images..."
docker compose build --quiet

docker compose up -d --wait postgres >/dev/null
first_run=false
if [[ -z "$(docker compose exec -T postgres psql -U demo -d postgres -Atc \
    "SELECT 1 FROM pg_database WHERE datname = 'temporal'")" ]]; then
  first_run=true
fi

case "$MODE" in
  clean)
    ./scripts/reset.sh
    ;;
  restore)
    ./seed/restore-snapshot.sh
    ;;
  keep)
    if $first_run; then
      echo "First run — loading the saved demo state."
      ./seed/restore-snapshot.sh
    else
      echo "Keeping the existing demo data (use --restore or --clean to replace it)."
    fi
    ;;
esac

docker compose up -d
echo "Waiting for the integration API..."
until curl -sf http://localhost:9090/api/health >/dev/null; do sleep 2; done

if $WITH_AMP; then
  ./scripts/amp-install.sh
  ./scripts/amp-setup.sh
  ./scripts/amp-guardrails.sh
  ./scripts/amp-evaluations.sh
fi

cat <<'EOF'

Ready.
  Portal         http://localhost:5173
  Temporal UI    http://localhost:8233
  Integration    http://localhost:9090/api/system
EOF
if k3d cluster list 2>/dev/null | grep -q '^amp-local '; then
  echo "  Agent Manager  http://console.amp.localhost:8080   (admin / admin)"
fi
