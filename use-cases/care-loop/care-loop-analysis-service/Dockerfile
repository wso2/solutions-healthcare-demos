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

FROM ballerina/ballerina:2201.13.4 AS builder
WORKDIR /home/ballerina/care-loop-common
COPY --chown=ballerina:ballerina care-loop-common/ .
RUN bal pack --offline=false && bal push --repository=local

WORKDIR /home/ballerina/build
COPY --chown=ballerina:ballerina care-loop-analysis-service/ .
RUN bal build --offline=false

FROM eclipse-temurin:21-jre
WORKDIR /home/ballerina
COPY --from=builder /home/ballerina/build/target/bin/care_loop_analysis_service.jar .
EXPOSE 8005
CMD ["java", "-jar", "care_loop_analysis_service.jar"]
