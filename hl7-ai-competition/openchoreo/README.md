# OpenChoreo deployment

The primary way to run the Care Loop demo. `make up` creates a local kind
cluster (`care-loop`), installs the OpenChoreo platform, deploys all 14
components, and seeds demo data. docker-compose remains as a fallback via
the `*-compose` targets.

## Prerequisites

Docker, `helm` 3.12+, `kubectl` v1.32+, `kind` (node image pinned to
`kindest/node:v1.32.0` - OpenChoreo's CRDs need Kubernetes 1.32+), `bun`,
and the local gitignored `Config.toml` of care-loop-ai-service,
care-loop-collector-service and care-loop-analysis-service (the same files
docker-compose mounts; the ai-service one carries the real `openAiApiKey`,
never committed).

## Usage

```bash
make up             # cluster + platform + all components + seed
make seed           # (re)seed demo data and trigger an immediate EHR -> care-loop sync
make trigger-vitals # force a vitals-forward cycle instead of waiting for the cron
make forward        # port-forward every service onto its compose-equivalent host port
make ps / make down
```

## What the scripts do

`install.sh` installs the platform onto the given kube context: Gateway API
CRDs v1.4.1, cert-manager v1.19.4, External Secrets Operator v2.0.1,
kgateway v2.2.1, OpenBao v0.25.6, then the OpenChoreo control- and
data-plane charts v1.1.1 plus the seeded default resources. Idempotent;
pinned values come from github.com/openchoreo/openchoreo (release-v1.1).

`deploy-components.sh` builds every service image, loads each into the kind
cluster's containerd (no registry), pushes the local config files into
OpenBao, and applies every component manifest - including `fhir-sync`
(hourly EHR -> care-loop sync worker) and the nginx read-only proxy that
fhir-mcp-server and front-desk-dashboard use for care-loop store reads
(GET/HEAD only).

## Configuration

Config files are never duplicated in manifests. Each Workload references a
`SecretReference` via `files[].valueFrom.secretKeyRef`; the deploy script
pushes the actual local file (the Config.tomls, the proxy's nginx.conf)
into OpenBao, and OpenChoreo renders it as an ExternalSecret-synced
Kubernetes Secret mounted into the pod.

Per-environment overrides (`resources` for the JVM services - the seeded
ComponentType's 256Mi default is too small for them) are declared as
ReleaseBinding documents inside each component.yaml;
`Component.spec.parameters` does not reach the rendered Deployment in
OpenChoreo v1.1.

Storage is ephemeral: if the healthkit simulator or a postgres pod
restarts, re-run `make seed` (and restart the corresponding FHIR server if
its database was recreated, since it creates its tables at startup).

## OpenChoreo MCP server (optional, local development)

The control-plane API serves MCP at `/mcp`. The documented auth needs
Thunder (OIDC), which this install omits, so auth is switched off - local
kind cluster only, never on a shared deployment:

```bash
helm --kube-context kind-care-loop upgrade openchoreo-control-plane \
  oci://ghcr.io/openchoreo/helm-charts/openchoreo-control-plane --version 1.1.1 \
  -n openchoreo-control-plane --reuse-values --set security.enabled=false
kubectl --context kind-care-loop port-forward \
  -n openchoreo-control-plane svc/openchoreo-api 18080:8080 &
claude mcp add --transport http openchoreo-cp http://localhost:18080/mcp
```

The observability MCP server (`openchoreo-obs`) needs the observability
plane, which is not installed.
