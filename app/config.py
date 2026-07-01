"""Application configuration loaded from environment variables."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings. All values are overridable via environment variables."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    cache_ttl_sec: int = 300
    rate_limit_per_min: int = 60
    allowed_origins: list[str] = ["https://word-float.example"]
    http_timeout_sec: float = 10.0
    log_level: str = "INFO"

    # How long the stale-while-error fallback retains the last good payload.
    stale_ttl_sec: int = 60 * 60 * 24  # 24h

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a comma-separated string (env var) or a real list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
