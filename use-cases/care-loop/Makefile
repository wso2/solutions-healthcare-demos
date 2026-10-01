# Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com).
#
# WSO2 LLC. licenses this file to you under the Apache License,
# Version 2.0 (the "License"); you may not use this file except
# in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied. See the License for the
# specific language governing permissions and limitations
# under the License.

COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help build build-serial up up-serial watch down ps clean seed trigger-vitals

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Build all stack images
	$(COMPOSE) build

build-serial: ## Build stack images one at a time (use on resource-limited Docker where parallel builds time out)
	bash scripts/build.sh

up: ## Build and start the stack, then seed demo data
	$(COMPOSE) up -d --build
	$(MAKE) seed

up-serial: ## Like `up`, but build images serially first (use when `make up` fails pulling deps, e.g. Docker Desktop on macOS)
	$(MAKE) build-serial
	$(COMPOSE) up -d
	$(MAKE) seed

seed: ## Load demo patient data into apple-healthkit-simulator and ehr-fhir-server, then sync it into care-loop-fhir-server
	bun scripts/seed/index.ts
	$(COMPOSE) restart fhir-sync

watch: ## Start the stack in the foreground and rebuild on change
	$(COMPOSE) up --build --watch

down: ## Stop and remove the stack containers
	$(COMPOSE) down

ps: ## Show stack service status
	$(COMPOSE) ps

clean: ## Stop the stack and remove volumes
	$(COMPOSE) down -v

trigger-vitals: ## Force an immediate vitals-forward cycle instead of waiting for the automatic one
	@response=$$(curl -sS -w '\n%{http_code}' -X POST http://localhost:8000/vitals-cron/run-now); \
	body=$$(echo "$$response" | sed '$$d'); \
	status=$$(echo "$$response" | tail -n1); \
	if [ "$$status" = "200" ]; then echo "$$body" | jq .; else echo "request failed (HTTP $$status): $$body"; exit 1; fi
