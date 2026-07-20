#!/bin/bash
# Boot WSO2 Agent Manager (AMP v0.18.0) in docker-in-docker: run dockerd, bring
# up the quick-start k3d cluster, then apply the fixes this stack needs (DNS,
# DNAT, pre-created hook secrets, missing install steps, console OAuth). Every
# step is idempotent so restarts resume the cluster persisted in /var/lib/docker.

set -euo pipefail

CLUSTER=amp-local
NODE=k3d-${CLUSTER}-server-0
QS_HOME=/home/wso2-amp
READY_FILE=/var/run/amp-ready
AMP_VERSION=0.18.0

log() { printf '\n== %s\n' "$*"; }

retry() {
    local n=$1 i; shift
    for i in $(seq 1 "$n"); do
        "$@" && return 0
        echo "attempt $i/$n failed: $1" >&2
        sleep 15
    done
    return 1
}

wait_for_crd() {
    local crd=$1 i
    for i in $(seq 1 60); do
        if kubectl get "crd/$crd" >/dev/null 2>&1; then
            kubectl wait --for condition=established "crd/$crd" --timeout=120s
            return 0
        fi
        sleep 5
    done
    echo "CRD $crd never appeared" >&2
    return 1
}

# Delegate cgroup v2 controllers to child cgroups (the docker:dind evacuation
# dance); without this, nested k3s dies with "failed to find memory cgroup".
setup_cgroups() {
    [ -f /sys/fs/cgroup/cgroup.controllers ] || return 0
    mkdir -p /sys/fs/cgroup/init
    xargs -rn1 </sys/fs/cgroup/cgroup.procs >/sys/fs/cgroup/init/cgroup.procs 2>/dev/null || true
    sed -e 's/ / +/g' -e 's/^/+/' </sys/fs/cgroup/cgroup.controllers >/sys/fs/cgroup/cgroup.subtree_control
}

start_dockerd() {
    setup_cgroups
    docker info >/dev/null 2>&1 && return 0
    log "Starting dockerd"
    rm -f /var/run/docker.pid
    dockerd --host=unix:///var/run/docker.sock >/var/log/dockerd.log 2>&1 &
    local i
    for i in $(seq 1 60); do
        docker info >/dev/null 2>&1 && return 0
        sleep 2
    done
    echo "dockerd did not become ready" >&2
    tail -50 /var/log/dockerd.log >&2 || true
    return 1
}

resume_cluster() {
    k3d cluster list "$CLUSTER" >/dev/null 2>&1 || return 0
    log "Resuming existing k3d cluster"
    k3d cluster start "$CLUSTER" || true
}

run_install() {
    # install.sh is idempotent; let its AMP-chart step fail (we install it below).
    log "Running quick-start install (AMP chart step may fail; handled below)"
    (cd "$QS_HOME" && ./install.sh) || true
}

fix_cluster_dns() {
    log "Fixing cluster DNS"
    local gw node_ip
    gw=$(docker network inspect "k3d-$CLUSTER" -f '{{(index .IPAM.Config 0).Gateway}}')
    node_ip=$(docker inspect "$NODE" -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
    kubectl get cm coredns -n kube-system -o jsonpath='{.data.Corefile}' > /tmp/Corefile
    # Pods have no IPv6 egress on an IPv6-first LAN; suppress AAAA answers.
    sed -i "s#forward . /etc/resolv.conf#forward . $gw#" /tmp/Corefile
    grep -q "template IN AAAA" /tmp/Corefile || sed -i \
        "s#    hosts /etc/coredns/NodeHosts {#    template IN AAAA . {\n      rcode NOERROR\n    }\n    hosts /etc/coredns/NodeHosts {#" \
        /tmp/Corefile
    kubectl create cm coredns -n kube-system \
        --from-file=Corefile=/tmp/Corefile \
        --from-literal=NodeHosts="$node_ip $NODE
$gw host.k3d.internal" \
        --dry-run=client -o yaml | kubectl apply -f -
    kubectl rollout restart deployment/coredns -n kube-system
    kubectl rollout status deployment/coredns -n kube-system --timeout=120s
    apply_dns_dnat
}

apply_dns_dnat() {
    # kube-proxy ClusterIP DNAT is broken here; DNAT the kube-dns VIP to the CoreDNS pod.
    local cip
    cip=$(kubectl get pod -n kube-system -l k8s-app=kube-dns -o jsonpath='{.items[0].status.podIP}')
    docker exec "$NODE" sh -c "
        iptables -t nat -S PREROUTING | grep '10\\.43\\.0\\.10/32' | sed 's/^-A/-D/' | while read -r r; do iptables -t nat \$r; done
        iptables -t nat -I PREROUTING 1 -d 10.43.0.10/32 -p udp --dport 53 -j DNAT --to-destination $cip:53
        iptables -t nat -I PREROUTING 1 -d 10.43.0.10/32 -p tcp --dport 53 -j DNAT --to-destination $cip:53"
    echo "DNS DNAT -> $cip"
}

apply_gateway_dnat() {
    # gateway-runtime is a ClusterIP with no node binding; DNAT node:22893 to its pod.
    local pip
    pip=$(kubectl get pod -n openchoreo-data-plane -l app.kubernetes.io/component=gateway-runtime \
        -o jsonpath='{.items[0].status.podIP}' 2>/dev/null) || return 0
    [ -n "$pip" ] || return 0
    docker exec "$NODE" sh -c "
        iptables -t nat -S PREROUTING | grep -- '--dport 22893' | grep 'j DNAT' | sed 's/^-A/-D/' | while read -r r; do iptables -t nat \$r; done 2>/dev/null
        iptables -t nat -I PREROUTING 1 -p tcp --dport 22893 -j DNAT --to-destination $pip:22893"
    echo "Gateway DNAT -> $pip:22893"
}

precreate_amp_secrets() {
    log "Pre-creating AMP hook secrets"
    # Pre-create the hook secrets so the egress-dependent hook jobs can be stripped.
    kubectl create ns wso2-amp --dry-run=client -o yaml | kubectl apply -f - >/dev/null
    if ! kubectl get secret amp-jwt-keys -n wso2-amp >/dev/null 2>&1; then
        mkdir -p /tmp/keys && cd /tmp/keys
        openssl genrsa -out private.pem 4096 2>/dev/null
        openssl rsa -in private.pem -pubout -out public.pem 2>/dev/null
        local ts
        ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        printf '{\n "keys": [\n  {\n   "kid": "key-1",\n   "algorithm": "RS256",\n   "publicKeyPath": "/app/keys/public.pem",\n   "description": "JWT signing key generated by bootstrap",\n   "createdAt": "%s"\n  }\n ]\n}\n' "$ts" > public-keys-config.json
        kubectl create secret generic amp-jwt-keys -n wso2-amp \
            --from-file=private.pem --from-file=public.pem --from-file=public-keys-config.json
        kubectl annotate secret amp-jwt-keys -n wso2-amp \
            amp.wso2.com/keys-version=1 amp.wso2.com/key-id=key-1 \
            "amp.wso2.com/generated-at=$ts" --overwrite
        cd /
    fi
    if ! kubectl get secret amp-tls-certs -n wso2-amp >/dev/null 2>&1; then
        mkdir -p /tmp/keys && cd /tmp/keys
        openssl genrsa -out key.pem 2048 2>/dev/null
        openssl req -new -x509 -sha256 -key key.pem -out cert.pem -days 365 \
            -subj "/C=US/O=Agent Manager Dev" \
            -addext "keyUsage=critical,digitalSignature,keyEncipherment" \
            -addext "extendedKeyUsage=serverAuth" \
            -addext "subjectAltName=DNS:localhost,DNS:amp-api.wso2-amp.svc.cluster.local,DNS:amp-api.wso2-amp.svc,DNS:amp-api,DNS:amp-api-gateway-manager.wso2-amp.svc.cluster.local,IP:127.0.0.1,IP:::1"
        kubectl create secret generic amp-tls-certs -n wso2-amp --from-file=cert.pem --from-file=key.pem
        cd /
    fi
}

# install.sh Step 11 (skipped by the failing quick-start): the gateway-operator
# provides the gateway.api-platform.wso2.com CRDs the gateway extension needs.
install_gateway_operator() {
    helm status gateway-operator -n openchoreo-data-plane >/dev/null 2>&1 || \
        helm install gateway-operator \
            oci://ghcr.io/wso2/api-platform/helm-charts/gateway-operator \
            -n openchoreo-data-plane --timeout 600s --version 0.7.0 \
            --set logging.level=debug \
            --set gatewayApi.installStandardCRDs=false \
            --set gateway.helm.chartVersion=1.1.0 || return 1
    kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: wso2-api-platform-gateway-module
rules:
  - apiGroups: ["gateway.api-platform.wso2.com"]
    resources: ["restapis", "apigateways"]
    verbs: ["*"]
  - apiGroups: ["gateway.kgateway.dev"]
    resources: ["backends"]
    verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: wso2-api-platform-gateway-module
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: wso2-api-platform-gateway-module
subjects:
  - kind: ServiceAccount
    name: cluster-agent-dataplane
    namespace: openchoreo-data-plane
EOF
}

# install.sh Step 10 sub-install (skipped): the traces-opensearch chart ships the
# OTel collector that receives agent traces; without it ingest has no backing pod.
install_observability_traces() {
    helm status observability-traces-opensearch -n openchoreo-observability-plane >/dev/null 2>&1 || \
        helm upgrade --install observability-traces-opensearch \
            oci://ghcr.io/openchoreo/helm-charts/observability-tracing-opensearch \
            --create-namespace --namespace openchoreo-observability-plane \
            --version 0.4.1 \
            --set openSearch.enabled=false \
            --set openSearchSetup.openSearchSecretName="opensearch-admin-credentials" \
            --set opentelemetry-collector.configMap.existingName="amp-opentelemetry-collector-config" \
            --timeout 10m
}

# Observer authorizes trace queries on the client_id claim, not sub; without this
# the console traces view 403s. (install.sh Step 10 does the same patch.)
patch_observer_auth() {
    local ns=openchoreo-observability-plane
    kubectl get cm observer-auth-config -n "$ns" >/dev/null 2>&1 || return 0
    kubectl get cm observer-auth-config -n "$ns" -o yaml \
        | sed -E "s/claim:[[:space:]]*['\"]?sub['\"]?/claim: client_id/g" \
        | kubectl apply --server-side --field-manager=helm --force-conflicts -f - >/dev/null
    kubectl rollout restart deployment/observer -n "$ns" >/dev/null 2>&1 || true
}

# LOCAL-DEMO ONLY: drop the otel route's jwt-auth so the externally-run collector
# can post traces (an external agent can't mint the required identity token).
disable_otel_trace_auth() {
    local rn=api-platform-default-default-otel-restapi
    kubectl get restapi "$rn" -n openchoreo-data-plane >/dev/null 2>&1 || return 0
    kubectl patch restapi "$rn" -n openchoreo-data-plane --type=json \
        -p '[{"op":"replace","path":"/spec/policies","value":[]}]'
}

install_amp_chart() {
    log "Installing AMP chart (hook jobs stripped)"
    # install.sh's own AMP step leaves a "failed" release (its hook jobs need
    # egress), so only skip on a genuinely deployed release; otherwise clear the
    # failed one and install with the hook jobs stripped and secrets pre-created.
    if helm status amp -n wso2-amp 2>/dev/null | grep -q '^STATUS: deployed$'; then
        echo "amp release present"
    else
        helm uninstall amp -n wso2-amp >/dev/null 2>&1 || true
        rm -rf /tmp/chart && mkdir -p /tmp/chart
        helm pull oci://ghcr.io/wso2/wso2-agent-manager --version "$AMP_VERSION" --untar -d /tmp/chart
        rm -f /tmp/chart/wso2-agent-manager/templates/jobs/jwt-keys-generation-job.yaml \
              /tmp/chart/wso2-agent-manager/templates/jobs/tls-certs-job.yaml
        # instrumentationUrl is browser-side; 22893 is published to the host.
        helm install amp /tmp/chart/wso2-agent-manager -n wso2-amp --create-namespace \
            --timeout 1800s --set console.config.instrumentationUrl=http://localhost:22893/otel
    fi
    # Remaining install extensions are idempotent through install-helpers.
    (
        cd "$QS_HOME"
        # shellcheck disable=SC1091
        source ./install-helpers.sh
        retry 3 install_platform_resources_extension
        retry 3 install_observability_extension
        retry 3 install_observability_traces
        retry 3 install_evaluation_extension
        # Gateway extension needs the operator CRDs (step 11) and thunder (step 12).
        retry 3 install_amp_thunder_extension
        retry 3 install_gateway_operator
        wait_for_crd apigateways.gateway.api-platform.wso2.com
        wait_for_crd restapis.gateway.api-platform.wso2.com
        # Non-fatal: a slow/failed gateway-extension bootstrap must not crash-loop the whole container (the gateway runtime and routes may already be up); main() still reaches the ready file and the DNAT reconcile loop.
        retry 1 install_gateway_extension || log "gateway extension did not converge; continuing"
        retry 5 kubectl apply -f "https://raw.githubusercontent.com/wso2/agent-manager/amp/v${AMP_VERSION}/deployments/values/otel-collector-rest-api.yaml" || true
        # Drop the jwt-auth the gateway extension puts on the otel route (local demo).
        disable_otel_trace_auth || true
    )
}

fix_console_port() {
    log "Aligning console OAuth with host port 13000"
    kubectl patch cm amp-console -n wso2-amp --type merge -p \
        '{"data":{"SIGN_IN_REDIRECT_URL":"http://localhost:13000/login","SIGN_OUT_REDIRECT_URL":"http://localhost:13000/login"}}'
    kubectl rollout restart deploy/amp-console -n wso2-amp
    local sec tok app_id i
    sec=$(kubectl get secret amp-api -n wso2-amp -o jsonpath='{.data.thunder-client-secret}' | base64 -d)
    tok=""
    for i in $(seq 1 30); do
        tok=$(curl -s -m 20 -H "Host: thunder.amp.localhost" -u "amp-system-client:$sec" \
            -d "grant_type=client_credentials&scope=system" http://localhost:8080/oauth2/token \
            | jq -r '.access_token // empty' 2>/dev/null) && [ -n "$tok" ] && break
        echo "waiting for thunder token endpoint ($i/30)"; sleep 10
    done
    [ -n "$tok" ] || { echo "could not obtain thunder token" >&2; return 1; }
    app_id=$(curl -s -m 20 -H "Host: thunder.amp.localhost" -H "Authorization: Bearer $tok" \
        http://localhost:8080/applications \
        | jq -r '.applications[] | select(.name=="AMP Console") | .id')
    [ -n "$app_id" ] || { echo "AMP Console app not found in thunder" >&2; return 1; }
    curl -s -m 20 -H "Host: thunder.amp.localhost" -H "Authorization: Bearer $tok" \
        "http://localhost:8080/applications/$app_id" \
        | jq '(.inboundAuthConfig[] | select(.type=="oauth2") | .config.redirectUris) |=
              ((. // []) + ["http://localhost:13000/login","http://localhost:3000/login"] | unique)' \
        > /tmp/console-app.json
    curl -s -m 20 -X PUT -H "Host: thunder.amp.localhost" -H "Authorization: Bearer $tok" \
        -H "Content-Type: application/json" "http://localhost:8080/applications/$app_id" \
        -d @/tmp/console-app.json -o /dev/null
    rm -f /tmp/console-app.json
    # Thunder namespace/configmap names vary across ports; find them.
    local tns tcm
    tns=$(kubectl get deploy -A --no-headers 2>/dev/null | awk 'tolower($0) ~ /thunder/ {print $1; exit}')
    if [ -z "$tns" ]; then
        echo "no thunder deployment found; skipping CORS patch" >&2
        return 0
    fi
    tcm=$(kubectl get cm -n "$tns" -o name | grep -i 'thunder.*extension' | head -1)
    [ -n "$tcm" ] || tcm=$(kubectl get cm -n "$tns" -o name | grep -i thunder | head -1)
    if [ -z "$tcm" ]; then
        echo "no thunder configmap found in $tns; skipping CORS patch" >&2
        return 0
    fi
    kubectl get "$tcm" -n "$tns" -o json \
        | jq '.data |= with_entries(
                if (.value | contains("allowed_origins") and (contains("http://localhost:13000") | not))
                then .value |= sub("allowed_origins:\n    - \"http://localhost:3000\"";
                                   "allowed_origins:\n    - \"http://localhost:3000\"\n    - \"http://localhost:13000\"")
                else . end)
              | del(.metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.managedFields)' \
        > /tmp/thunder-cm.json
    kubectl apply -f /tmp/thunder-cm.json
    rm -f /tmp/thunder-cm.json
    kubectl rollout restart deploy -n "$tns"
}

main() {
    rm -f "$READY_FILE"
    export HOME=/root
    start_dockerd
    resume_cluster
    run_install
    fix_cluster_dns
    precreate_amp_secrets
    install_amp_chart
    # Console OAuth alignment is best-effort; a failure must not block the ready file.
    fix_console_port || log "console OAuth alignment failed (non-fatal); dashboard login redirect may need a manual fix"
    patch_observer_auth || log "observer-auth patch failed (non-fatal); console traces view may 403"
    apply_gateway_dnat
    touch "$READY_FILE"
    log "AMP ready. Console: http://localhost:13000 (admin/admin)."
    # Reconcile the DNATs (pod IPs change on restart) and the otel-route auth
    # (a controller re-adds the jwt-auth policy the external collector can't satisfy).
    while docker info >/dev/null 2>&1; do
        apply_dns_dnat >/dev/null 2>&1 || true
        apply_gateway_dnat >/dev/null 2>&1 || true
        disable_otel_trace_auth >/dev/null 2>&1 || true
        sleep 30
    done
    echo "dockerd exited" >&2
    exit 1
}

main "$@"
