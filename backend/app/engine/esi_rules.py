"""Path A: deterministic ESI v4 rules engine.

Follows the four ESI decision points (A: life-saving intervention,
B: high-risk / shouldn't wait, C: resource count, D: danger-zone vitals)
with two deliberate design biases required by the Round 2 brief:
age-banded thresholds, and escalation under uncertainty — missing data
never downgrades a patient.
"""

from app.engine import thresholds
from app.models import PatientIntake, RulesResult

# Estimated ED resources (labs, imaging, IV, consult...) per complaint category.
# ESI counts resource *types*; 0 -> ESI-5, 1 -> ESI-4, 2+ -> ESI-3 or above.
BASE_RESOURCES = {
    "medication_refill": 0,
    "minor": 0,
    "rash": 1,
    "sprain": 1,
    "laceration": 1,
    "fever": 1,
    "abdominal_pain": 2,
    "chest_pain": 2,
    "breathing_difficulty": 2,
    "stroke_signs": 2,
    "trauma_major": 2,
    "sepsis_concern": 2,
    "other": 1,
}

ALWAYS_HIGH_RISK = {"stroke_signs", "breathing_difficulty", "trauma_major",
                    "sepsis_concern", "self_harm"}


def _resources(intake: PatientIntake) -> int:
    base = BASE_RESOURCES.get(intake.complaint_category, 1)
    # Geriatric patients with possible infection get a broader workup
    if intake.age_years >= thresholds.GERIATRIC_AGE and intake.complaint_category == "fever":
        base = max(base, 2)
    return base


def score(intake: PatientIntake) -> RulesResult:
    v = intake.vitals
    reasons: list[str] = []
    red_flags: list[str] = []

    # --- Decision point A: immediate life-saving intervention -> ESI-1 ---
    if intake.responsiveness == "unresponsive":
        return RulesResult(esi=1, reasons=["A: unresponsive (AVPU=U)"],
                           red_flags=["unresponsive"])
    if v.spo2 is not None and v.spo2 < thresholds.SPO2_CRITICAL:
        return RulesResult(esi=1, reasons=[f"A: critical hypoxia SpO2 {v.spo2:.0f}%"],
                           red_flags=["critical hypoxia"])
    if v.rr is not None and v.rr < 8:
        return RulesResult(esi=1, reasons=[f"A: hypoventilation RR {v.rr:.0f}"],
                           red_flags=["hypoventilation"])
    if v.sbp is not None and v.sbp < 75 and intake.age_years >= 16:
        return RulesResult(esi=1, reasons=[f"A: shock-range SBP {v.sbp:.0f}"],
                           red_flags=["shock"])
    reasons.append("A: no immediate life-saving intervention required")

    # --- Decision point B: high-risk situation -> ESI-2 ---
    months = thresholds.age_in_months(intake)
    if intake.complaint_category in ALWAYS_HIGH_RISK:
        red_flags.append(intake.complaint_category)
        reasons.append(f"B: high-risk presentation ({intake.complaint_category})")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=_resources(intake))
    if intake.complaint_category == "chest_pain" and (
        intake.age_years >= 35 or "cardiac" in " ".join(intake.conditions).lower()
    ):
        red_flags.append("possible ACS")
        reasons.append("B: high-risk chest pain (age/cardiac history)")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=_resources(intake))
    if intake.responsiveness in ("verbal", "pain"):
        red_flags.append("altered mental status")
        reasons.append("B: new confusion/lethargy (AVPU below alert)")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=_resources(intake))
    if months < 3 and v.temp_c is not None and v.temp_c >= thresholds.FEVER_C:
        red_flags.append("infant fever")
        reasons.append(f"B: fever {v.temp_c:.1f}C in infant under 3 months")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=2)
    if v.pain is not None and v.pain >= 8:
        red_flags.append("severe pain")
        reasons.append(f"B: severe pain {v.pain}/10 — escalating rather than waiting")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=_resources(intake))
    reasons.append("B: no high-risk criteria met")

    # --- Decision point C: expected resources ---
    resources = _resources(intake)
    if intake.age_years >= thresholds.GERIATRIC_AGE and intake.complaint_category == "fever":
        red_flags.append("geriatric fever — sepsis watch")
        reasons.append("C: geriatric fever, broadened workup (sepsis watch)")
    reasons.append(f"C: estimated resources = {resources}")

    if resources == 0:
        return RulesResult(esi=5, reasons=reasons, red_flags=red_flags,
                           resources_estimate=0)
    if resources == 1:
        return RulesResult(esi=4, reasons=reasons, red_flags=red_flags,
                           resources_estimate=1)

    # --- Decision point D: danger-zone vitals gate for multi-resource patients ---
    missing_core = v.hr is None or v.rr is None or v.spo2 is None
    if missing_core:
        reasons.append("D: core vitals missing — escalating under uncertainty")
        red_flags.append("incomplete vitals")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=resources)

    danger, danger_reasons = thresholds.in_danger_zone(intake)
    if danger:
        reasons.append("D: danger-zone vitals — uptriage to ESI-2 (" +
                       "; ".join(danger_reasons) + ")")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           danger_zone_vitals=True, resources_estimate=resources)

    reasons.append("D: vitals within age-band limits")
    return RulesResult(esi=3, reasons=reasons, red_flags=red_flags,
                       resources_estimate=resources)
