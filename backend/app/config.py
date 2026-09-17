from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"


class Settings(BaseSettings):
    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "AI Sales Agent"
    api_prefix: str = "/api"
    target_website_url: AnyHttpUrl | None = Field(default=None, validation_alias=AliasChoices("TARGET_WEBSITE_URL", "TARGET_WEBSITE"))

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ai_sales_agent"

    openai_api_key: str | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    gemini_api_key: str | None = None
    gemini_model: str | None = None
    gemini_embedding_model: str | None = None

    calcom_api_key: str | None = None
    calcom_event_type_id: str | None = None
    mailjet_api_key: str | None = None
    mailjet_secret_key: str | None = None
    mailjet_from_email: str | None = None
    mailjet_from_name: str | None = None
    sales_team_email: str | None = None
    sales_reps: list[str] = Field(default_factory=lambda: ["John Smith", "Jane Doe"]) 
    google_service_account_json: str | None = None
    google_sheet_id: str | None = None

    crawl_max_pages: int = 200
    crawl_request_delay: float = Field(default=1.0, validation_alias=AliasChoices("CRAWL_REQUEST_DELAY", "CRAWL_DELAY"))
    crawl_timeout: int = 20
    crawl_user_agent: str = "Mozilla/5.0 (compatible; AISalesAgentBot/0.1; +https://example.com/bot)"
    rag_top_k: int = 5
    rag_similarity_threshold: float = 0.15
    chunk_max_chars: int = 900
    chunk_overlap_chars: int = 120

    log_level: str = Field(default="INFO")
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ]

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def sales_reps_list(self) -> list[str]:
        if isinstance(self.sales_reps, str):
            return [item.strip() for item in self.sales_reps.split(",") if item.strip()]
        return [item.strip() for item in self.sales_reps if item and item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
