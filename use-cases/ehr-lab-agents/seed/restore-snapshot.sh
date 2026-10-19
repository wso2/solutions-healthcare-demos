#!/usr/bin/env bash
# Restores the demo's saved state from seed/snapshot/: the two FHIR stores (EHR and lab), the integration's
# database (assessments, agent memory, longevity records) and Temporal's history, so finished
# assessments still open in the portal with their workflow view.
#
#   seed/restore-snapshot.sh              # restore seed/snapshot/
#   seed/restore-snapshot.sh <dir>        # restore another snapshot taken with scripts/snapshot.sh
#
# Everything except Postgres is stopped first: the FHIR servers and Temporal create tables on
# start, and a restore under a running writer would interleave with it. Restoring replaces the
# current contents of those databases.
set -euo pipefail
cd "$(dirname "$0")/.."

SNAPSHOT="${1:-seed/snapshot}"
DATABASES=(fhir_ehr fhir_lab longevity temporal temporal_visibility)
psql() { docker compose exec -T postgres psql -U demo -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

for db in "${DATABASES[@]}"; do
  [[ -f "$SNAPSHOT/$db.dump" ]] || { echo "missing $SNAPSHOT/$db.dump" >&2; exit 1; }
done

echo "Stopping everything except Postgres..."
docker compose stop portal integration lab-simulator temporal-ui temporal \
  fhir-mcp-ehr fhir-mcp-lab toxiproxy fhir-ehr fhir-lab >/dev/null 2>&1 || true
docker compose up -d --wait postgres >/dev/null

for db in "${DATABASES[@]}"; do
  # Drop and recreate rather than pg_restore --clean, so objects the snapshot does not know about
  # (a newer server version's extra tables) cannot survive the restore.
  psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid()" >/dev/null
  psql -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
  docker compose exec -T postgres pg_restore -U demo -d "$db" --no-owner --no-acl --exit-on-error < "$SNAPSHOT/$db.dump"
  printf '  restored %-20s\n' "$db"
done

echo "Snapshot restored from $SNAPSHOT."
