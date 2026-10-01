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

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the care-loop-heart-risk-service."""

    # protected_namespaces=() silences pydantic's warning that model_path shadows its reserved "model_" prefix.
    model_config = SettingsConfigDict(
        env_prefix="HEART_RISK_",
        env_file=".env",
        extra="ignore",
        protected_namespaces=(),
    )

    app_name: str = "care-loop-heart-risk-service"
    model_path: Path = Path("models/heart_watch_model_nb.onnx")
    metrics_path: Path = Path("models/metrics_nb.json")
    preprocessing_path: Path = Path("models/preprocessing_nb.json")
    threshold: float = 0.5


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
