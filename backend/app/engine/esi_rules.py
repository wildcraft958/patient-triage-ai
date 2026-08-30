"""Path A: deterministic ESI v4 rules engine.

Follows the four ESI decision points (A: life-saving intervention,
B: high-risk / shouldn't wait, C: resource count, D: danger-zone vitals)
with two deliberate design biases required by the Round 2 brief:
age-banded thresholds, and escalation under uncertainty - missing data
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
    "allergic_reaction": 2,
    "pregnancy_complication": 2,
    "other": 1,
}

# Systemic allergic presentation is ESI-2 minimum (airway risk); localized
# hives without systemic signs belongs under "rash" instead. A pregnancy
# complication (bleeding, preeclampsia signs) is ESI-2 minimum: two patients.
ALWAYS_HIGH_RISK = {"stroke_signs", "breathing_difficulty", "trauma_major",
                    "sepsis_concern", "self_harm", "allergic_reaction",
                    "pregnancy_complication"}

# Categories where a MISS is the dangerous error, so any tier that assigns a
# category may accept them at lower confidence. Chest pain is not in
# ALWAYS_HIGH_RISK (it is high risk conditionally, on age or cardiac
# history) but the missed atypical MI is the classic triage error. One
# taxonomy, imported by every tier - two copies would drift.
MISS_CRITICAL = ALWAYS_HIGH_RISK | {"chest_pain"}


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
        if (intake.complaint_category == "pregnancy_complication"
                and v.sbp is not None
                and v.sbp >= thresholds.SEVERE_PREECLAMPSIA_SBP):
            red_flags.append("possible severe preeclampsia")
            reasons.append(f"B: SBP {v.sbp:.0f} in severe range for pregnancy "
                           f"(>= {thresholds.SEVERE_PREECLAMPSIA_SBP})")
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
    # pain from the vitals panel, or the OLDCARTS severity answer as fallback
    pain = v.pain
    if pain is None and intake.oldcarts is not None:
        pain = intake.oldcarts.severity
    if pain is not None and pain >= thresholds.SEVERE_PAIN:
        red_flags.append("severe pain")
        reasons.append(f"B: severe pain {pain}/10 - escalating rather than waiting")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=_resources(intake))
    reasons.append("B: no high-risk criteria met")

    # --- Decision point D first: danger-zone vitals gate, ALL categories ---
    # Run before the resource count on purpose: measured deranged vitals in a
    # "minor" complaint mean the category is wrong (e.g. anaphylaxis coded as
    # "other"), so the resource shortcut must never bypass this check.
    danger, danger_reasons = thresholds.in_danger_zone(intake)
    if danger:
        reasons.append("D: danger-zone vitals - uptriage to ESI-2 (" +
                       "; ".join(danger_reasons) + ")")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           danger_zone_vitals=True,
                           resources_estimate=_resources(intake))

    # --- Decision point C: expected resources ---
    resources = _resources(intake)
    if intake.age_years >= thresholds.GERIATRIC_AGE and intake.complaint_category == "fever":
        red_flags.append("geriatric fever - sepsis watch")
        reasons.append("C: geriatric fever, broadened workup (sepsis watch)")
    reasons.append(f"C: estimated resources = {resources}")

    # Missing core vitals: escalate 2+-resource patients under uncertainty;
    # for 0/1-resource complaints ESI v4 assigns 4/5 without vitals, so flag
    # for collection instead of escalating every vitals-less sprain to ESI-2.
    missing_core = v.hr is None or v.rr is None or v.spo2 is None
    if missing_core and resources >= 2:
        reasons.append("D: core vitals missing - escalating under uncertainty")
        red_flags.append("incomplete vitals")
        return RulesResult(esi=2, reasons=reasons, red_flags=red_flags,
                           resources_estimate=resources)
    if missing_core:
        reasons.append("D: core vitals not recorded - flagged for collection")
        red_flags.append("vitals not recorded")

    if resources == 0:
        return RulesResult(esi=5, reasons=reasons, red_flags=red_flags,
                           resources_estimate=0)
    if resources == 1:
        return RulesResult(esi=4, reasons=reasons, red_flags=red_flags,
                           resources_estimate=1)

    reasons.append("D: vitals within age-band limits")
    return RulesResult(esi=3, reasons=reasons, red_flags=red_flags,
                       resources_estimate=resources)
