# HAPI FHIR JPA Server for Choreo Deployment
# Uses the official HAPI FHIR Docker image from Docker Hub
# Base image: https://hub.docker.com/r/hapiproject/hapi

FROM hapiproject/hapi:latest

# Add metadata
LABEL maintainer="WSO2 Healthcare"
LABEL description="HAPI FHIR JPA Server for ADT-A01 to FHIR Service"
LABEL version="latest"

# The official image comes with sensible defaults:
# - FHIR R4 support
# - H2 in-memory database
# - Exposes port 8080
# - Runs as non-root user (hapi)
# - CORS enabled
# - OpenAPI/Swagger UI enabled

# All configuration can be customized via environment variables in Choreo
# See: https://github.com/hapifhir/hapi-fhir-jpaserver-starter#environment-variables
