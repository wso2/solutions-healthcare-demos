// Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).

// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at

// http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied. See the License for the
// specific language governing permissions and limitations
// under the License.

import ballerina/http;
import ballerina/lang.runtime;
import ballerina/log;

const DEFAULT_MAX_RETRIES = 3;
const decimal DEFAULT_RETRY_DELAY_SECONDS = 0.5;

# Retries a POST call on http:ClientError. Defense-in-depth for startup-ordering races (DNS/connection-refused) between services in the same docker-compose stack, not a substitute for fixing a genuinely misconfigured client (e.g. an HTTP version mismatch).
#
# + 'client - the http:Client to call
# + path - request path
# + body - request body
# + targetType - expected response type
# + maxRetries - total attempts before giving up
# + retryDelaySeconds - delay between attempts
public isolated function postWithRetry(http:Client 'client, string path, json body, typedesc<anydata> targetType,
        int maxRetries = DEFAULT_MAX_RETRIES, decimal retryDelaySeconds = DEFAULT_RETRY_DELAY_SECONDS)
        returns anydata|http:ClientError {
    http:ClientError lastError = error("unreachable");
    foreach int attempt in 0 ..< maxRetries {
        anydata|http:ClientError response = 'client->post(path, body, targetType = targetType);
        if response !is http:ClientError {
            return response;
        }
        lastError = response;
        if attempt < maxRetries - 1 {
            log:printWarn("POST failed, retrying", path = path, attempt = attempt, 'error = response);
            runtime:sleep(retryDelaySeconds);
        }
    }
    return lastError;
}
