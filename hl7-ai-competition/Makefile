COMPOSE := docker compose

.DEFAULT_GOAL := help

.PHONY: help build up watch down ps clean seed

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Build all stack images
	$(COMPOSE) build

up: ## Build and start the stack, then seed demo data
	$(COMPOSE) up -d --build
	$(MAKE) seed

seed: ## Load demo patient data into apple-healthkit-simulator and fhir-server
	bun scripts/seed/index.ts

watch: ## Start the stack in the foreground and rebuild on change
	$(COMPOSE) up --build --watch

down: ## Stop and remove the stack containers
	$(COMPOSE) down

ps: ## Show stack service status
	$(COMPOSE) ps

clean: ## Stop the stack and remove volumes
	$(COMPOSE) down -v
