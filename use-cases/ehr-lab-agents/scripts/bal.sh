#!/usr/bin/env bash
# Runs the Ballerina CLI from the pinned Docker image, for machines without a local Ballerina 2201.14.1.
# With a local install, use `bal` directly.
#   ./scripts/bal.sh build                      # from inside a package directory
#   ./scripts/bal.sh test
# Dependencies are cached in the `ehr-lab-agents-bal-cache` volume between runs.
set -euo pipefail

BAL_IMAGE="${BAL_IMAGE:-ballerina/ballerina:2201.14.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REL="${PWD#"$ROOT"}"

# A fresh named volume is root-owned; the image runs as `ballerina` (uid 100). Fix it once.
if ! docker volume inspect ehr-lab-agents-bal-cache >/dev/null 2>&1; then
  docker volume create ehr-lab-agents-bal-cache >/dev/null
fi
docker run --rm -u 0 -v ehr-lab-agents-bal-cache:/cache "$BAL_IMAGE" \
  sh -c '[ "$(stat -c %u /cache)" = 100 ] || chown -R 100:1000 /cache'

exec docker run --rm \
  -v "$ROOT":/home/ballerina/demo \
  -v ehr-lab-agents-bal-cache:/home/ballerina/.ballerina \
  --add-host host.docker.internal:host-gateway \
  -e BAL_CONFIG_VAR_DBHOST=host.docker.internal \
  -e BAL_CONFIG_VAR_LABFHIRBASEURL=http://host.docker.internal:8082/fhir/r4 \
  -w "/home/ballerina/demo${REL}" \
  "$BAL_IMAGE" bal "$@"
