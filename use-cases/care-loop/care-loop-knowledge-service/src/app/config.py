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

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the care-loop-knowledge-service."""

    model_config = SettingsConfigDict(
        env_prefix="KNOWLEDGE_",
        env_file=".env",
        extra="ignore",
    )

    app_name: str = "care-loop-knowledge-service"

    # MCP transport (streamable-http). Matches the wso2/fhir-mcp-server the stack already consumes.
    host: str = "0.0.0.0"  # container listens on all interfaces behind the compose network
    port: int = 8000

    # Vector store.
    chroma_path: Path = Path("data/chroma")
    collection: str = "hfref"

    # Query-time embedding.
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_provider: Literal["openai", "local"] = "openai"
    local_embedding_model: str = "BAAI/bge-small-en-v1.5"

    # Retrieval.
    default_k: int = 4


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
