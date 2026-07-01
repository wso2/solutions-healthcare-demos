from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings for the apple-healthkit-simulator."""

    model_config = SettingsConfigDict(env_prefix="HEALTHKIT_", env_file=".env", extra="ignore")

    app_name: str = "apple-healthkit-simulator"
    database_url: str = "sqlite:///./data/healthkit.db"
    echo_sql: bool = False
    vitals_target_url: str | None = None
    vitals_forward_interval_hours: int = 1


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
