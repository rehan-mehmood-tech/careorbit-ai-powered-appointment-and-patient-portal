from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=Path(__file__).parents[1] / ".env", extra="ignore")

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    firebase_project_id: str = "careorbit-ai-power-healthcare"
    allowed_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    checkpoint_db: str = "./data/checkpoints.sqlite"
    prompt_version: str = "careorbit-intake-v1"
    request_timeout_seconds: float = Field(default=25, ge=5, le=60)

    @property
    def origins(self) -> list[str]:
        return [value.strip() for value in self.allowed_origins.split(",") if value.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
