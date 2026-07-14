#!/bin/sh
# The AMP gateway key (written by amp-init) is required; refuse to boot without it.
set -e

if [ ! -s /amp-shared/gateway.key ]; then
    echo "AMP gateway key not found at /amp-shared/gateway.key; the AI gateway is required. Aborting." >&2
    exit 1
fi
BAL_CONFIG_VAR_OPENAIAPIKEY="$(cat /amp-shared/gateway.key)"
export BAL_CONFIG_VAR_OPENAIAPIKEY

exec java -jar care_loop_ai_service.jar
