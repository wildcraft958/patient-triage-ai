from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=REPO_ROOT / ".env", extra="ignore")

    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    hf_token: str = ""
    hospital_profile: str = "urban_500"


settings = Settings()
