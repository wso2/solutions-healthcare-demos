COMPOSE := docker compose
KIND_CLUSTER := care-loop
KUBE_CONTEXT := kind-$(KIND_CLUSTER)
KCTL := kubectl --context=$(KUBE_CONTEXT)
DP_NS = $(shell $(KCTL) get ns -o name | grep '^namespace/dp-' | head -1 | cut -d/ -f2)

.DEFAULT_GOAL := help

.PHONY: help build up down ps clean seed trigger-vitals forward \
	up-compose down-compose ps-compose clean-compose watch-compose build-compose seed-compose

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up: ## Deploy the full stack to OpenChoreo on a local kind cluster, then seed demo data (see openchoreo/README.md)
	kind get clusters 2>/dev/null | grep -qx "$(KIND_CLUSTER)" || kind create cluster --name $(KIND_CLUSTER) --image kindest/node:v1.32.0
	./openchoreo/install.sh $(KUBE_CONTEXT)
	./openchoreo/deploy-components.sh $(KIND_CLUSTER) $(KUBE_CONTEXT)
	$(KCTL) wait -n $(DP_NS) --for=condition=available --timeout=600s deployment --all
	$(MAKE) seed

down: ## Delete the OpenChoreo kind cluster
	kind delete cluster --name $(KIND_CLUSTER)

ps: ## Show OpenChoreo pod status across all namespaces
	$(KCTL) get pods -A

clean: down ## Alias for down (no persistent volumes to remove outside the cluster itself)

seed: ## Seed demo data into the OpenChoreo stack and run an immediate EHR -> care-loop sync
	./openchoreo/seed.sh $(KUBE_CONTEXT)

trigger-vitals: ## Force an immediate vitals-forward cycle on the OpenChoreo stack
	@$(KCTL) port-forward -n $(DP_NS) svc/apple-healthkit-simulator 18000:8000 >/dev/null 2>&1 & \
	pf=$$!; sleep 3; \
	response=$$(curl -sS -w '\n%{http_code}' -X POST http://localhost:18000/vitals-cron/run-now); \
	kill $$pf 2>/dev/null; \
	body=$$(echo "$$response" | sed '$$d'); \
	status=$$(echo "$$response" | tail -n1); \
	if [ "$$status" = "200" ]; then echo "$$body" | jq .; else echo "request failed (HTTP $$status): $$body"; exit 1; fi

forward: ## Port-forward all OpenChoreo services onto their compose-equivalent host ports (foreground)
	@echo "healthkit:8000 ehr:9090 care-loop-fhir:9091 fhir-mcp:8001 ai:8003 collector:8004 analysis:8005 whatsapp:3000 front-desk:3002"
	@trap 'kill 0' EXIT; \
	$(KCTL) port-forward -n $(DP_NS) svc/apple-healthkit-simulator 8000:8000 & \
	$(KCTL) port-forward -n $(DP_NS) svc/ehr-fhir-server 9090:9090 & \
	$(KCTL) port-forward -n $(DP_NS) svc/care-loop-fhir-server 9091:9090 & \
	$(KCTL) port-forward -n $(DP_NS) svc/fhir-mcp-server 8001:8000 & \
	$(KCTL) port-forward -n $(DP_NS) svc/care-loop-ai-service 8003:8003 & \
	$(KCTL) port-forward -n $(DP_NS) svc/care-loop-collector-service 8004:8004 & \
	$(KCTL) port-forward -n $(DP_NS) svc/care-loop-analysis-service 8005:8005 & \
	$(KCTL) port-forward -n $(DP_NS) svc/whatsapp-simulator 3000:3000 & \
	$(KCTL) port-forward -n $(DP_NS) svc/front-desk-dashboard 3002:3002 & \
	wait

# docker-compose is kept as a fallback/dev path.
build-compose: ## Build all stack images (docker-compose fallback)
	$(COMPOSE) build

up-compose: ## Build and start the stack via docker-compose, then seed demo data (fallback)
	$(COMPOSE) up -d --build
	$(MAKE) seed-compose

seed-compose: ## Seed demo data into the docker-compose stack and restart its fhir-sync (fallback)
	bun scripts/seed/index.ts
	$(COMPOSE) restart fhir-sync

watch-compose: ## Start the stack in the foreground and rebuild on change (docker-compose fallback)
	$(COMPOSE) up --build --watch

down-compose: ## Stop and remove the docker-compose stack containers (fallback)
	$(COMPOSE) down

ps-compose: ## Show docker-compose stack service status (fallback)
	$(COMPOSE) ps

clean-compose: ## Stop the docker-compose stack and remove volumes (fallback)
	$(COMPOSE) down -v
