# Makefile for the apple-healthkit-simulator collector service.
# Docker targets drive docker compose; dev targets drive uv inside the project.

PROJECT := apple-healthkit-simulator
# Service to target for per-service goals (logs/run/shell). Override as the
# stack grows, e.g. `make logs SERVICE=worker`. Whole-stack goals
# (build/up/down/ps) act on every compose service and ignore this.
SERVICE ?= collector
COMPOSE := docker compose
CMD ?= sh

.DEFAULT_GOAL := help

.PHONY: help build up down logs ps run shell sync lock lint format format-check test clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

build: ## Build the collector image
	$(COMPOSE) build

up: ## Build and start the collector in the background
	$(COMPOSE) up -d --build

down: ## Stop and remove the collector containers
	$(COMPOSE) down

logs: ## Follow collector logs
	$(COMPOSE) logs -f $(SERVICE)

ps: ## Show compose service status
	$(COMPOSE) ps

run: ## Run a one-off command in a fresh container: make run CMD="..."
	$(COMPOSE) run --rm $(SERVICE) $(CMD)

shell: ## Open a shell in a fresh collector container
	$(COMPOSE) run --rm $(SERVICE) sh

sync: ## Install dependencies locally with uv
	cd $(PROJECT) && uv sync

lock: ## Update the uv lockfile
	cd $(PROJECT) && uv lock

lint: ## Run ruff lint checks
	cd $(PROJECT) && uv run ruff check .

format: ## Format code with ruff
	cd $(PROJECT) && uv run ruff format .

format-check: ## Check formatting without writing changes
	cd $(PROJECT) && uv run ruff format --check .

test: ## Run the test suite
	cd $(PROJECT) && uv run pytest

clean: ## Stop containers, remove volumes, and clear local caches
	$(COMPOSE) down -v
	rm -rf $(PROJECT)/.ruff_cache $(PROJECT)/.pytest_cache
