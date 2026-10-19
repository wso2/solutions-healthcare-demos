#!/usr/bin/env bash
# Returns the demo to a clean slate: drops every data volume (both FHIR servers, Temporal history,
# agent memory, assessments), starts the stack again and reloads the seed patients.
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose down -v --remove-orphans
docker compose up -d --build
./seed/seed.sh

echo "Waiting for the integration API..."
until curl -sf http://localhost:9090/api/health >/dev/null; do sleep 2; done
echo "Ready: portal http://localhost:5173 · API http://localhost:9090/api · Temporal UI http://localhost:8233"
