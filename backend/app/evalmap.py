"""Map ESI benchmark scenarios (free-text description + extracted vitals)
into structured PatientIntake records so the rules path can score them.

The mapping is deliberately conservative and documented: age comes from the
text, vitals from the benchmark's extraction files (Fahrenheit converted),
complaint category via the intake classifier (app.engine.complaint). Where
age is not stated the adult default (40) is used and marked.
"""

import re

from app.engine.complaint import classify_category  # noqa: F401 (re-export)
from app.models import PatientIntake, Vitals

_AGE_YEARS = re.compile(r"(\d{1,3})[\s-]*(?:year|yr)s?[\s-]*old", re.I)
_AGE_MONTHS = re.compile(r"(\d{1,2})[\s-]*months?[\s-]*old", re.I)
_AGE_WEEKS = re.compile(r"(\d{1,2})[\s-]*weeks?[\s-]*old", re.I)
_AGE_DAYS = re.compile(r"(\d{1,2})[\s-]*days?[\s-]*old", re.I)
_PAIN = re.compile(r"(\d{1,2})\s*(?:/|out of)\s*10", re.I)

DEFAULT_ADULT_AGE = 40


def parse_age(text: str) -> tuple[int, float | None, bool]:
    """Return (age_years, age_months, was_defaulted)."""
    if m := _AGE_YEARS.search(text):
        return int(m.group(1)), None, False
    if m := _AGE_MONTHS.search(text):
        months = float(m.group(1))
        return 0, months, False
    if m := _AGE_WEEKS.search(text):
        return 0, float(m.group(1)) / 4.33, False
    if m := _AGE_DAYS.search(text):
        return 0, float(m.group(1)) / 30.4, False
    return DEFAULT_ADULT_AGE, None, True


def to_celsius(value: float | None, unit: str | None) -> float | None:
    if value is None:
        return None
    if (unit or "").lower().startswith("f") or value > 45:
        return round((value - 32) * 5 / 9, 1)
    return value


def parse_vitals(extracted: dict | None, description: str) -> Vitals:
    v = (extracted or {}).get("vital_signs", {}) or {}
    pain = None
    if m := _PAIN.search(description):
        pain = min(10, int(m.group(1)))
    return Vitals(
        hr=v.get("heart_rate_bpm"),
        rr=v.get("respiratory_rate_bpm"),
        spo2=v.get("oxygen_saturation_percent"),
        sbp=v.get("blood_pressure_systolic_mmhg"),
        temp_c=to_celsius(v.get("temperature_value"), v.get("temperature_unit")),
        pain=pain,
    )


def parse_responsiveness(text: str) -> str:
    lowered = text.lower()
    if "unresponsive" in lowered:
        return "unresponsive"
    if any(w in lowered for w in ["lethargic", "listless", "confused", "disoriented",
                                  "obtunded", "difficult to arouse"]):
        return "verbal"
    return "alert"


def case_to_intake(case: dict) -> tuple[PatientIntake, bool]:
    """Return (intake, age_was_defaulted) for a benchmark case dict."""
    desc = case["description"]
    age_years, age_months, defaulted = parse_age(desc)
    intake = PatientIntake(
        patient_id=f"{case['set']}-{case['scenario_number']}",
        age_years=age_years,
        age_months=age_months,
        chief_complaint=desc,
        complaint_category=classify_category(desc),
        vitals=parse_vitals(case.get("vitals"), desc),
        responsiveness=parse_responsiveness(desc),
        has_history=False,
    )
    return intake, defaulted
