COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help build up watch down ps clean fhir

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Build all stack images
	$(COMPOSE) build

up: ## Build and start the stack (incl. FHIR MCP bridge) in the background
	$(COMPOSE) up -d --build
	./scripts/bootstrap-fhir.sh
	$(COMPOSE) --profile fhir up -d

fhir: ## (Re)mint the FHIR token and (re)start the MCP bridge
	./scripts/bootstrap-fhir.sh
	$(COMPOSE) --profile fhir up -d

watch: ## Start the stack in the foreground and rebuild on change
	$(COMPOSE) up --build --watch

down: ## Stop and remove the stack containers (incl. FHIR MCP bridge)
	$(COMPOSE) --profile fhir down

ps: ## Show stack service status
	$(COMPOSE) --profile fhir ps

clean: ## Stop the stack, remove volumes and the minted token
	$(COMPOSE) --profile fhir down -v
	rm -f .fhir.env
