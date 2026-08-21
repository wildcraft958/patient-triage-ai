from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", REPO_ROOT / "local.env"), extra="ignore"
    )

    llm_region: str = "eu-north-1"
    llm_api_key: str = ""
    llm_model: str = "anthropic.claude-haiku-4-5"
    hf_token: str = ""
    hospital_profile: str = "urban_500"


settings = Settings()
