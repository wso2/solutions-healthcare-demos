# HAPI FHIR JPA Server for Choreo Deployment
# Uses the official HAPI FHIR Docker image from Docker Hub
# Base image: https://hub.docker.com/r/hapiproject/hapi

FROM hapiproject/hapi:latest

# Add metadata
LABEL maintainer="WSO2 Healthcare"
LABEL description="HAPI FHIR JPA Server for ADT-A01 to FHIR Service"
LABEL version="latest"

# Choreo requires a numeric UID between 10000-20000
# The official HAPI image runs as UID 1000, so we need to switch to a Choreo-compliant UID
# Create a user with a known UID/GID within range 10000-20000.
# This is required by Choreo to run the container as a non-root user.
RUN adduser \
    --disabled-password \
    --gecos "" \
    --home "/nonexistent" \
    --shell "/sbin/nologin" \
    --no-create-home \
    --uid 10014 \
    "choreo"
# Use the above created unprivileged user
USER 10014

# Expose port for FHIR API
EXPOSE 8080

# The official image comes with sensible defaults:
# - FHIR R4 support
# - H2 in-memory database
# - CORS enabled
# - OpenAPI/Swagger UI enabled

# All configuration can be customized via environment variables in Choreo
# See: https://github.com/hapifhir/hapi-fhir-jpaserver-starter#environment-variables
