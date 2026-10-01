#!/bin/sh
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
