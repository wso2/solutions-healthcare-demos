# syntax=docker/dockerfile:1.7
# Builds one Ballerina package of this workspace into a runnable image.
#   docker build --build-arg PACKAGE=ehr_agentic_integration -t ehr-integration .
ARG BAL_IMAGE=ballerina/ballerina:2201.14.1

FROM ${BAL_IMAGE} AS build
ARG PACKAGE
WORKDIR /home/ballerina/src
COPY --chown=ballerina:troupe ${PACKAGE}/ ${PACKAGE}/
WORKDIR /home/ballerina/src/${PACKAGE}
# Central dependencies are cached between builds. The local lock file is dropped so the image
# resolves one consistent graph against the distribution it builds with. The cache is locked:
# compose builds both packages in parallel, and two `bal build`s pulling into one cache corrupt it.
RUN --mount=type=cache,target=/home/ballerina/.ballerina,uid=100,gid=1000,sharing=locked \
    rm -rf target Dependencies.toml && bal build && cp target/bin/${PACKAGE}.jar /home/ballerina/app.jar

FROM ${BAL_IMAGE}
# Not under /home/ballerina: the base image declares it a VOLUME, and compose keeps a container's
# anonymous volumes across recreation, so a jar there would outlive every rebuild.
COPY --from=build /home/ballerina/app.jar /opt/app/app.jar
WORKDIR /opt/app
ENTRYPOINT ["java", "-jar", "/opt/app/app.jar"]
