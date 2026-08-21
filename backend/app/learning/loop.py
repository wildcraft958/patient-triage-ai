"""The override-reward learning loop.

Every clinician action becomes a reward signal (the experience-repository
pattern from Doctor-R1). Rewards are asymmetric exactly like the brief's
cost structure: an under-triage override (clinician says MORE acute - the
dangerous miss) costs 5x an over-triage one.

The online learner is deliberately conservative: a calibration table over
(complaint category x age band) cells whose learned adjustment can ONLY
escalate - the RL layer cannot break the escalation-safety invariant by
construction. Full policy optimization (GRPO per Doctor-R1) is the Round 3
path once override volume exists.
"""

import json
from pathlib import Path

from app.engine.thresholds import GERIATRIC_AGE, age_in_months
from app.models import PatientIntake

UNDER_TRIAGE_PENALTY = -1.0  # per level: clinician escalated our recommendation
OVER_TRIAGE_PENALTY = -0.2   # per level: clinician downgraded it
ACCEPT_REWARD = 1.0

LEARN_RATE = 0.4
ESCALATE_THRESHOLD = 0.5


def compute_reward(recommended_esi: int, clinician_esi: int | None) -> float:
    if clinician_esi is None:  # accepted as recommended
        return ACCEPT_REWARD
    diff = recommended_esi - clinician_esi
    if diff > 0:  # clinician chose a more acute level: we under-triaged
        return UNDER_TRIAGE_PENALTY * diff
    return OVER_TRIAGE_PENALTY * -diff


def age_band(intake: PatientIntake) -> str:
    months = age_in_months(intake)
    if months < 36:
        return "infant_toddler"
    if months < 96:
        return "child"
    if intake.age_years >= GERIATRIC_AGE:
        return "geriatric"
    return "adult"


class CalibrationTable:
    def __init__(self, path: Path | None = None):
        self.path = path
        self.cells: dict[str, float] = {}
        if path is not None and Path(path).exists():
            self.cells = json.loads(Path(path).read_text())

    @staticmethod
    def _key(category: str, band: str) -> str:
        return f"{category}|{band}"

    def record(self, category: str, band: str, under_triage: bool) -> None:
        key = self._key(category, band)
        signal = self.cells.get(key, 0.0)
        target = 1.0 if under_triage else 0.0
        self.cells[key] = (1 - LEARN_RATE) * signal + LEARN_RATE * target

    def adjustment(self, category: str, band: str) -> int:
        """0 or 1 extra level of acuity. Never negative: learning can
        escalate a cell but can never teach the system to downgrade."""
        return 1 if self.cells.get(self._key(category, band), 0.0) >= ESCALATE_THRESHOLD else 0

    def apply(self, category: str, band: str, esi: int) -> int:
        return max(1, esi - self.adjustment(category, band))

    def save(self) -> None:
        if self.path is None:
            raise ValueError("CalibrationTable has no path to save to")
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        Path(self.path).write_text(json.dumps(self.cells, indent=1))
