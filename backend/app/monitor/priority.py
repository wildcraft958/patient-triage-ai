"""Reassessment priority: which waiting patient should the nurse check next?

The POMDP information-gain idea applied to triage - 

    priority = deterioration_risk x wait_pressure x acuity_uncertainty x severity

deterioration_risk reads the vitals trajectory (rising HR, falling SBP/SpO2,
climbing temp) plus a complaint-category prior; wait_pressure is time since
last assessment over the profile's per-ESI safe limit; uncertainty is raised
when the two scoring paths disagreed at triage; severity weights high acuity.
"""

from app.profiles import HospitalProfile

CATEGORY_RISK = {
    "sepsis_concern": 0.50,
    "breathing_difficulty": 0.45,
    "chest_pain": 0.40,
    "fever": 0.35,
    "abdominal_pain": 0.30,
    "stroke_signs": 0.40,
    "trauma_major": 0.35,
}
DEFAULT_CATEGORY_RISK = 0.15

SEVERITY_WEIGHT = {1: 3.0, 2: 2.0, 3: 1.5, 4: 1.0, 5: 0.7}


def _field(entry, name):
    return entry[name] if isinstance(entry, dict) else getattr(entry, name)


def deterioration_risk(entry) -> float:
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


def acuity_uncertainty(fused) -> float:
    factor = 1.0
    if not fused.paths_agree:
        factor += 0.3
    if fused.confidence == "low":
        factor += 0.2
    return factor


def reassessment_priority(entry, now_min: float, profile: HospitalProfile) -> float:
    fused = _field(entry, "fused")
    waited = now_min - _field(entry, "last_assessed_min")
    max_wait = profile.max_wait_min.get(fused.esi, profile.max_wait_min[2])
    return (
        deterioration_risk(entry)
        * wait_pressure(waited, max_wait)
        * acuity_uncertainty(fused)
        * SEVERITY_WEIGHT.get(fused.esi, 1.0)
    )
