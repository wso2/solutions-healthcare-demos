FROM ghcr.io/wso2/amp-quick-start:v0.18.0

# The quick-start image ships only the docker CLI; add the engine so the
# k3d cluster runs inside this container (docker-in-docker) instead of on
# the host daemon.
USER root
RUN apk add --no-cache docker

COPY entrypoint.sh /amp-entrypoint.sh
ENTRYPOINT ["/bin/bash", "/amp-entrypoint.sh"]
