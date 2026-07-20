FROM ballerina/ballerina:2201.13.4 AS builder
WORKDIR /home/ballerina/care-loop-common
COPY --chown=ballerina:ballerina care-loop-common/ .
RUN bal pack --offline=false && bal push --repository=local

WORKDIR /home/ballerina/build
COPY --chown=ballerina:ballerina care-loop-ai-service/ .
RUN bal build --offline=false

FROM eclipse-temurin:21-jre
WORKDIR /home/ballerina
COPY --from=builder /home/ballerina/build/target/bin/care_loop_ai_service.jar .
COPY care-loop-ai-service/docker-entrypoint.sh /home/ballerina/docker-entrypoint.sh
RUN chmod +x /home/ballerina/docker-entrypoint.sh
EXPOSE 8003
ENTRYPOINT ["/home/ballerina/docker-entrypoint.sh"]
