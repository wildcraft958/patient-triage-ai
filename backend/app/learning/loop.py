"""The override-reward learning loop.

Every clinician action becomes an experience tuple with a multi-axis reward
(the ResidencyRL reward structure: diagnostic accuracy, management quality,
communication, documentation, safety), stored in the audit trail as the
experience repository (Doctor-R1 pattern). The scalar total is asymmetric
exactly like the brief's cost structure: an under-triage override (clinician
says MORE acute - the dangerous miss) costs 5x an over-triage one.

Two learners consume the repository: the conservative online calibration
table below (escalate-only by construction), and the batch GRPO optimizer in
app.learning.grpo that recomputes the same table from group-relative
advantages over the logged experience.
"""

import json
from pathlib import Path

from pydantic import BaseModel

from app.engine.thresholds import GERIATRIC_AGE, age_in_months
from app.models import PatientIntake

UNDER_TRIAGE_PENALTY = -1.0  # per level: clinician escalated our recommendation
OVER_TRIAGE_PENALTY = -0.2   # per level: clinician downgraded it
ACCEPT_REWARD = 1.0
ACCURACY_PENALTY = -0.25     # per level of distance, direction-blind
# soft-axis weights: the maximum combined deduction (0.2) equals exactly one
# level of over-triage, so the safety axis keeps its 5x-per-level dominance
COMMUNICATION_WEIGHT = 0.1
DOCUMENTATION_WEIGHT = 0.1

LEARN_RATE = 0.4
ESCALATE_THRESHOLD = 0.5


class RewardVector(BaseModel):
    """The five ResidencyRL reward axes, scored per triage episode.

    All five axes price the scalar `total`. safety dominates by design
    (5x management_quality per level, and 5x the maximum combined soft-axis
    deduction), so the calibration policy optimizes worst-case safety, not
    average accuracy. communication and documentation deduct from a perfect
    score: an unexplained recommendation or an incomplete clinician record
    is a worse episode even when the level was right."""

    diagnostic_accuracy: float  # agreement with the clinician's final level
    management_quality: float   # resource stewardship: over-triage cost
    communication: float        # was the recommendation explained (both chains?)
    documentation: float        # was the clinician action legally complete
    safety: float               # under-triage cost, the dominant axis

    @property
    def total(self) -> float:
        if self.safety == 0.0 and self.management_quality == 0.0:
            base = ACCEPT_REWARD * self.diagnostic_accuracy
        else:
            base = self.safety + self.management_quality
        return (base
                + COMMUNICATION_WEIGHT * (self.communication - 1.0)
                + DOCUMENTATION_WEIGHT * (self.documentation - 1.0))


def compute_reward_vector(recommended_esi: int, clinician_esi: int | None,
                          dual_chain: bool, documented: bool = True) -> RewardVector:
    diff = 0 if clinician_esi is None else recommended_esi - clinician_esi
    return RewardVector(
        diagnostic_accuracy=1.0 if diff == 0 else ACCURACY_PENALTY * abs(diff),
        management_quality=OVER_TRIAGE_PENALTY * -diff if diff < 0 else 0.0,
        communication=1.0 if dual_chain else 0.5,
        documentation=1.0 if documented else 0.0,
        safety=UNDER_TRIAGE_PENALTY * diff if diff > 0 else 0.0,
    )


def compute_reward(recommended_esi: int, clinician_esi: int | None) -> float:
    return compute_reward_vector(recommended_esi, clinician_esi,
                                 dual_chain=True).total


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
