#!/usr/bin/env bash
# Build every buildable compose image one at a time.
#
# `make up` runs `docker compose up -d --build`, which builds all images in
# parallel. On a resource-limited Docker (e.g. Docker Desktop defaults, 2 CPU /
# 6 GB), the concurrent Ballerina builds saturate CPU and network and their
# pulls from central.ballerina.io time out ("cannot resolve module ..."). Building
# serially keeps each build within the available resources.
set -euo pipefail

cd "$(dirname "$0")/.."

# Buildable services (those with a `build:` section), deduplicated by target
# image so the shared fhir-server image is not built twice.
services=$(docker compose config --format json \
  | jq -r '.services | to_entries
      | map(select(.value.build != null))
      | unique_by(.value.image)
      | .[].key')

# Base-image and dependency pulls from registries (ghcr.io, central.ballerina.io,
# ...) can time out transiently on constrained networks, so retry each build a
# few times before giving up.
attempts=3

total=$(printf '%s\n' "$services" | grep -c .)
i=0
for svc in $services; do
  i=$((i + 1))
  echo ">> [$i/$total] building $svc"
  n=0
  until docker compose build "$svc"; do
    n=$((n + 1))
    if [ "$n" -ge "$attempts" ]; then
      echo ">> [$i/$total] $svc failed after $attempts attempts" >&2
      exit 1
    fi
    echo ">> [$i/$total] $svc build failed (attempt $n/$attempts), retrying in 10s..." >&2
    sleep 10
  done
  echo ">> [$i/$total] built $svc"
done

echo ">> all $total images built"
