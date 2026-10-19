#!/usr/bin/env bash
# Saves the demo's current state as a snapshot that seed/restore-snapshot.sh (and scripts/up.sh)
# can bring back: every FHIR store, the integration's database and Temporal's history.
#
#   ./scripts/snapshot.sh                 # overwrite seed/snapshot/ (the committed seed)
#   ./scripts/snapshot.sh <dir>           # save somewhere else
#
# Writers are stopped for the dump so the stores agree with each other (an assessment in the
# integration's database matches its workflow in Temporal and its orders in the FHIR servers),
# then started again. Dumps are checked for API keys before they are kept.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${1:-seed/snapshot}"
DATABASES=(fhir_ehr fhir_lab longevity temporal temporal_visibility)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

docker compose stop portal integration lab-simulator temporal-ui temporal \
  fhir-mcp-ehr fhir-mcp-lab toxiproxy fhir-ehr fhir-lab >/dev/null

for db in "${DATABASES[@]}"; do
  docker compose exec -T postgres pg_dump -U demo -Fc -Z 9 --no-owner --no-acl -d "$db" > "$TMP/$db.dump"
  if docker compose exec -T postgres pg_restore -f - < "$TMP/$db.dump" | grep -qE 'sk-ant-|x-api-key|x-amp-api-key'; then
    echo "$db contains something that looks like an API key — snapshot not saved" >&2
    docker compose up -d >/dev/null
    exit 1
  fi
  printf '  dumped %-20s %s\n' "$db" "$(du -h "$TMP/$db.dump" | cut -f1)"
done

mkdir -p "$OUT"
mv "$TMP"/*.dump "$OUT"/
docker compose up -d >/dev/null
echo "Snapshot saved to $OUT; the stack is starting again."
