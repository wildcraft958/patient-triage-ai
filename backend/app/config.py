from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", REPO_ROOT / "local.env"), extra="ignore"
    )

    llm_region: str = "eu-north-1"
    llm_api_key: str = ""
    # The committed replay cache and every published benchmark were produced
    # with Sonnet 5, and the cache is keyed by model id, so a different
    # default would silently drop demo patients onto the rules-only path.
    llm_model: str = "anthropic.claude-sonnet-5"
    hf_token: str = ""
    hospital_profile: str = "urban_500"
    # en_core_web_lg for full PHI recall; en_core_web_sm for small-RAM hosts
    spacy_model: str = "en_core_web_lg"


settings = Settings()
