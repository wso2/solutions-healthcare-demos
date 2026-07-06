FROM ballerina/ballerina:2201.13.4 AS builder
WORKDIR /home/ballerina/build
COPY --chown=ballerina:ballerina . .
RUN bal build --offline=false

FROM eclipse-temurin:21-jre
WORKDIR /home/ballerina
COPY --from=builder /home/ballerina/build/target/bin/care_loop_collector_service.jar .
EXPOSE 8004
CMD ["java", "-jar", "care_loop_collector_service.jar"]
