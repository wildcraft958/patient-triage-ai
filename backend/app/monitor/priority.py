"""Reassessment priority: the policy over the acuity belief state - which
waiting patient, if reassessed now, most reduces our risk?

    priority = deterioration_risk x time_since_last_assessment
             x acuity_uncertainty x esi_severity_weight

The four factors are the pitched formula, computed from the POMDP belief
(app.monitor.belief): acuity_uncertainty is the belief's normalized entropy
(seeded by Path A/B disagreement), deterioration_risk is the hazard read
from category prior plus vitals trajectory (with a positive floor - a stable
patient never scores zero), and the product is squashed to [0, 1]. Scores at
or above the profile's reassess_now_threshold surface as REASSESS NOW.
"""

import math

from app.monitor.belief import entropy, initial_belief
from app.profiles import HospitalProfile

CATEGORY_RISK = {
    "sepsis_concern": 0.50,
    "breathing_difficulty": 0.45,
    "chest_pain": 0.40,
    "allergic_reaction": 0.40,
    "fever": 0.35,
    "abdominal_pain": 0.30,
    "stroke_signs": 0.40,
    "trauma_major": 0.35,
}
DEFAULT_CATEGORY_RISK = 0.15

SEVERITY_WEIGHT = {1: 3.0, 2: 2.0, 3: 1.5, 4: 1.0, 5: 0.7}

SQUASH_K = 1.7  # maps the raw product onto [0, 1)


def _field(entry, name, default=None):
    if isinstance(entry, dict):
        return entry.get(name, default)
    return getattr(entry, name, default)


def deterioration_risk(entry) -> float:
    """Hazard estimate: complaint-category prior plus vitals trajectory.
    Also used as the belief transition rate while the patient waits."""
    intake = _field(entry, "intake")
    history = _field(entry, "vitals_history")
    score = CATEGORY_RISK.get(intake.complaint_category, DEFAULT_CATEGORY_RISK)
    if len(history) >= 2:
        (_, first), (_, last) = history[0], history[-1]
        if first.hr and last.hr and last.hr > first.hr:
            score += min(0.3, (last.hr - first.hr) / first.hr * 2)
        if first.sbp and last.sbp and last.sbp < first.sbp:
            score += min(0.3, (first.sbp - last.sbp) / first.sbp * 2)
        if first.spo2 and last.spo2 and last.spo2 < first.spo2:
            score += min(0.2, (first.spo2 - last.spo2) * 0.05)
        if first.temp_c and last.temp_c and last.temp_c > first.temp_c:
            score += min(0.2, (last.temp_c - first.temp_c) * 0.2)
    return min(1.0, score)


def wait_pressure(minutes_waiting: float, max_wait_min: float) -> float:
    return min(2.0, minutes_waiting / max_wait_min)


def acuity_uncertainty(belief: list[float]) -> float:
    """1 + normalized belief entropy: dual-path disagreement seeds a flatter
    belief, so disagreement and entropy are the same uncertainty signal."""
    return 1.0 + entropy(belief)


def action_for(priority: float, profile: HospitalProfile) -> str:
    return "REASSESS NOW" if priority >= profile.reassess_now_threshold else "Monitor"


def reassessment_priority(entry, now_min: float, profile: HospitalProfile) -> float:
    fused = _field(entry, "fused")
    belief = _field(entry, "belief") or initial_belief(fused)
    waited = now_min - _field(entry, "last_assessed_min")
    max_wait = profile.max_wait_min.get(fused.esi, profile.max_wait_min[2])
    raw = (
        deterioration_risk(entry)
        * wait_pressure(waited, max_wait)
        * acuity_uncertainty(belief)
        * SEVERITY_WEIGHT.get(fused.esi, 1.0)
    )
    return round(1.0 - math.exp(-SQUASH_K * raw), 3)
