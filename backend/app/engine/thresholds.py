"""Age-banded vital sign thresholds.

Danger-zone HR/RR limits follow the ESI v4 Implementation Handbook's
age-banded table; a single adult-calibrated model across all ages is a
silent safety risk (Round 2 brief). SpO2 < 92% is danger at any age.
"""

from app.models import PatientIntake, Vitals

# (max_age_months_exclusive, hr_limit, rr_limit)
DANGER_ZONE_BANDS = [
    (3, 180, 50),      # under 3 months
    (36, 160, 40),     # 3 months to 3 years
    (96, 140, 30),     # 3 to 8 years
    (None, 100, 20),   # over 8 years, incl. adults
]

SPO2_DANGER = 92
SPO2_CRITICAL = 85
GERIATRIC_AGE = 65
FEVER_C = 38.0
# Adult-only SBP extremes (pediatric SBP norms vary too much by age for a
# single floor; adult shock-range < 75 is already ESI-1 at decision point A)
SBP_ADULT_AGE = 16
SBP_DANGER_LOW = 90
SBP_CRISIS = 220
# The severe-pain gate in the rules engine reads this
SEVERE_PAIN = 8
# ACOG severe-range blood pressure in pregnancy (severe preeclampsia)
SEVERE_PREECLAMPSIA_SBP = 160


def age_in_months(intake: PatientIntake) -> float:
    if intake.age_months is not None:
        return intake.age_months
    return intake.age_years * 12


def band_limits(intake: PatientIntake) -> tuple[float, float]:
    months = age_in_months(intake)
    for max_months, hr_limit, rr_limit in DANGER_ZONE_BANDS:
        if max_months is None or months < max_months:
            return hr_limit, rr_limit
    raise AssertionError("unreachable")


def vital_limits(intake: PatientIntake) -> dict:
    """The limits this patient's vitals were actually scored against, by age
    band. Published so the console can draw a reading against its real ceiling
    instead of restating an adult range that is wrong for a neonate, and so a
    change to a band cannot leave the two disagreeing."""
    hr_limit, rr_limit = band_limits(intake)
    limits = {
        "hr": {"high": hr_limit},
        "rr": {"high": rr_limit},
        "spo2": {"low": SPO2_DANGER},
        "temp_c": {"high": FEVER_C},
        "pain": {"high": SEVERE_PAIN},
    }
    # Paediatric SBP norms vary too much by age for a single floor, so the gate
    # only applies one to adults and this only publishes one where it does.
    if intake.age_years >= SBP_ADULT_AGE:
        limits["sbp"] = {"low": SBP_DANGER_LOW, "high": SBP_CRISIS}
    return limits


def in_danger_zone(intake: PatientIntake) -> tuple[bool, list[str]]:
    """Return (danger, reasons) for the patient's age band."""
    v: Vitals = intake.vitals
    hr_limit, rr_limit = band_limits(intake)
    reasons = []
    if v.hr is not None and v.hr > hr_limit:
        reasons.append(f"HR {v.hr:.0f} exceeds age-band limit {hr_limit}")
    if v.rr is not None and v.rr > rr_limit:
        reasons.append(f"RR {v.rr:.0f} exceeds age-band limit {rr_limit}")
    if v.spo2 is not None and v.spo2 < SPO2_DANGER:
        reasons.append(f"SpO2 {v.spo2:.0f}% below {SPO2_DANGER}%")
    if v.sbp is not None and intake.age_years >= SBP_ADULT_AGE:
        if v.sbp < SBP_DANGER_LOW:
            reasons.append(f"SBP {v.sbp:.0f} below adult floor {SBP_DANGER_LOW}")
        elif v.sbp >= SBP_CRISIS:
            reasons.append(f"SBP {v.sbp:.0f} in hypertensive-crisis range (>= {SBP_CRISIS})")
    return bool(reasons), reasons
