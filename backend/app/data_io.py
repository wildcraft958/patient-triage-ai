import json
from pathlib import Path

from app.config import REPO_ROOT
from app.models import SimPatient

DATA_DIR = REPO_ROOT / "data"

ESI_EVAL_SETS = ["competency_cases", "practice_cases", "test_1", "test_2", "test_3"]


def load_curated_patients() -> list[SimPatient]:
    raw = json.loads((DATA_DIR / "curated_patients.json").read_text())
    return [SimPatient(**record) for record in raw]


def load_esi_eval_cases(sets: list[str] | None = None) -> list[dict]:
    """Standardized ESI scenario cases (ED-Triage-Agent repo, MIT).

    Returns dicts: {set, scenario_number, description, category, vitals}
    where category is the reference ESI level and vitals (when extracted)
    is the structured vital-sign dict for that scenario.
    """
    eval_dir = DATA_DIR / "esi_eval"
    cases = []
    for name in sets or ESI_EVAL_SETS:
        path = eval_dir / f"{name}.json"
        if not path.exists():
            raise FileNotFoundError(
                f"{path} missing - run scripts/fetch_data.py first"
            )
        scenarios = json.loads(path.read_text())
        vitals_path = eval_dir / f"{name}_vital_signs_extracted.json"
        vitals_by_scenario = {}
        if vitals_path.exists():
            for entry in json.loads(vitals_path.read_text()):
                vitals_by_scenario[entry.get("scenario_number")] = entry
        for s in scenarios:
            cases.append({
                "set": name,
                "scenario_number": s["scenario_number"],
                "description": s["description"],
                "category": s["category"],
                "vitals": vitals_by_scenario.get(s["scenario_number"]),
            })
    return cases
