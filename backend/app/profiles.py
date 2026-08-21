"""Hospital profiles: one config answers the brief's scalability question.

The same assistant flexes from a rural 100-visit ED to an urban 500-visit
trauma center by swapping a YAML file - wait limits, reassessment cadence,
surge thresholds, and deterioration sensitivity are all profile-driven.
"""

from functools import lru_cache

import yaml
from pydantic import BaseModel

from app.config import REPO_ROOT, settings

CONFIG_DIR = REPO_ROOT / "config"


class DeteriorationThresholds(BaseModel):
    hr_rise_pct: float
    sbp_drop_pct: float
    spo2_drop_points: float
    temp_rise_c: float


class HospitalProfile(BaseModel):
    profile_name: str
    visits_per_day: int
    max_wait_min: dict[int, int]  # ESI level -> safe wait before re-assessment due
    reassess_check_interval_min: int
    surge_queue_threshold: int
    deterioration: DeteriorationThresholds


@lru_cache(maxsize=8)
def load_profile(name: str | None = None) -> HospitalProfile:
    name = name or settings.hospital_profile
    path = CONFIG_DIR / f"{name}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"No hospital profile at {path}")
    return HospitalProfile(**yaml.safe_load(path.read_text()))
