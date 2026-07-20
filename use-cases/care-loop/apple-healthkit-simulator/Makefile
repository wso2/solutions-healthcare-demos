.DEFAULT_GOAL := help

.PHONY: help sync lock lint format format-check test clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

sync: ## Install dependencies (including dev) with uv
	uv sync --extra dev

lock: ## Update the uv lockfile
	uv lock

lint: ## Run ruff lint checks
	uv run --extra dev ruff check .

format: ## Format code with ruff
	uv run --extra dev ruff format .

format-check: ## Check formatting without writing changes
	uv run --extra dev ruff format --check .

test: ## Run the test suite
	uv run --extra dev pytest

clean: ## Clear local caches
	rm -rf .ruff_cache .pytest_cache
