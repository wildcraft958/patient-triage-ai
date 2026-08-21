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
    return bool(reasons), reasons
