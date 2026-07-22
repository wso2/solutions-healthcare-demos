#!/bin/sh
# The AI gateway is required: all LLM traffic routes through AMP. Inject the minted gateway keys (written to amp-shared by amp-init) as Ballerina config, and refuse to boot without at least one.
set -e

found=0
if [ -s /amp-shared/careloop-openai-gateway.key ]; then
    BAL_CONFIG_VAR_OPENAIAPIKEY="$(cat /amp-shared/careloop-openai-gateway.key)"
    export BAL_CONFIG_VAR_OPENAIAPIKEY
    found=1
fi
if [ -s /amp-shared/careloop-anthropic-gateway.key ]; then
    BAL_CONFIG_VAR_ANTHROPICAPIKEY="$(cat /amp-shared/careloop-anthropic-gateway.key)"
    export BAL_CONFIG_VAR_ANTHROPICAPIKEY
    found=1
fi
if [ "$found" -eq 0 ]; then
    echo "No AMP gateway key found in /amp-shared; the AI gateway is required. Aborting." >&2
    exit 1
fi

exec java -jar care_loop_ai_service.jar
