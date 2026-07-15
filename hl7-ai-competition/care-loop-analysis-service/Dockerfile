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
