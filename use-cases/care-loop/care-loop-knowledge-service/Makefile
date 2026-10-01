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

.DEFAULT_GOAL := help

.PHONY: help sync lock lint format format-check test ingest run clean

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

ingest: ## Build the Chroma vector store from corpus/snapshot (needs OPENAI_API_KEY, or EMBED=local)
	uv run --extra ingest python scripts/ingest.py

run: ## Run the MCP server locally (streamable-http on /mcp)
	uv run python -m app.server

clean: ## Clear local caches
	rm -rf .ruff_cache .pytest_cache
