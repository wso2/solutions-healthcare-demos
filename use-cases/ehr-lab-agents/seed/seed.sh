#!/usr/bin/env bash
# Loads the demo data into the FHIR servers. Safe to re-run: every entry is a PUT with a fixed id.
#
#   seed/ehr/  the clinic's EHR: directory + one bundle per patient (Synthea + storyline)
#   seed/lab-seed.json  the reference lab's own organization (orders arrive through the integration)
#
# Regenerate ehr/ with seed/synthea/generate.sh.
set -euo pipefail

EHR_URL="${EHR_URL:-http://localhost:8081/fhir/r4}"
LAB_URL="${LAB_URL:-http://localhost:8082/fhir/r4}"
DIR="$(cd "$(dirname "$0")" && pwd)"
RESPONSE="$(mktemp)"
trap 'rm -f "$RESPONSE"' EXIT

wait_ready() {
  local base="${1%/fhir/r4}"
  for _ in $(seq 1 90); do
    curl -fsS "$base/health/ready" >/dev/null 2>&1 && return 0
    sleep 2
  done
  echo "FHIR server at $1 did not become ready" >&2
  exit 1
}

post_bundle() {
  local url="$1" file="$2" label="$3"
  local status
  status=$(curl -sS -o "$RESPONSE" -w '%{http_code}' -X POST "$url" \
    -H 'Content-Type: application/fhir+json' --data-binary "@$file")
  if [[ "$status" != 200 ]]; then
    echo "$label: $(basename "$file") failed (HTTP $status)" >&2
    head -c 2000 "$RESPONSE" >&2
    exit 1
  fi
  printf '  %-34s %5s entries\n' "$(basename "$file")" "$(grep -o '"status"' "$RESPONSE" | wc -l | tr -d ' ')"
}

load_ehr() {
  local url="$1" dir="$2" label="$3"
  echo "$label ($url)"
  for file in "$dir"/*.json; do
    post_bundle "$url" "$file" "$label"
  done
}

wait_ready "$EHR_URL"
wait_ready "$LAB_URL"
load_ehr "$EHR_URL" "$DIR/ehr" "EHR"
echo "Lab ($LAB_URL)"
post_bundle "$LAB_URL" "$DIR/lab-seed.json" "Lab"
