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

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the apple-healthkit-simulator."""

    model_config = SettingsConfigDict(env_prefix="HEALTHKIT_", env_file=".env", extra="ignore")

    app_name: str = "apple-healthkit-simulator"
    database_url: str = "sqlite:///./data/healthkit.db"
    echo_sql: bool = False
    vitals_target_url: str | None = None
    vitals_forward_interval_hours: float = 1


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
