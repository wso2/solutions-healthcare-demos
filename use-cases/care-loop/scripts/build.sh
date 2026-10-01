#!/usr/bin/env bash
# Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied. See the License for the
# specific language governing permissions and limitations
# under the License.

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
