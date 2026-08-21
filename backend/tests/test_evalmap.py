from app.evalmap import (
    case_to_intake,
    classify_category,
    parse_age,
    parse_responsiveness,
    to_celsius,
)


def test_age_parsing_years_months_weeks():
    assert parse_age("A 45-year-old male") == (45, None, False)
    years, months, defaulted = parse_age("An 8-month-old presents with fever")
    assert (years, months, defaulted) == (0, 8.0, False)
    years, months, defaulted = parse_age("a 3-week-old infant")
    assert years == 0 and 0.5 < months < 0.8 and not defaulted


def test_age_defaults_to_adult_when_unstated():
    years, months, defaulted = parse_age("Patient with a headache")
    assert years == 40 and defaulted


def test_category_first_match_wins():
    assert classify_category("crushing chest pain and short of breath") == "breathing_difficulty"
    assert classify_category("crushing chest pain radiating") == "chest_pain"
    assert classify_category("needs a prescription refill") == "medication_refill"
    assert classify_category("stubbed toe") == "other"


def test_fahrenheit_converted():
    assert to_celsius(101.3, "F") == 38.5
    assert to_celsius(101.3, None) == 38.5  # heuristic: >45 must be Fahrenheit
    assert to_celsius(38.5, "C") == 38.5


def test_responsiveness_from_text():
    assert parse_responsiveness("found unresponsive at home") == "unresponsive"
    assert parse_responsiveness("appears listless, skin hot") == "verbal"
    assert parse_responsiveness("alert and oriented") == "alert"


def test_full_case_maps():
    case = {
        "set": "test_1", "scenario_number": 1, "category": 2,
        "description": "An 8-month-old presents with fever, cough, and vomiting. "
                       "The baby appears listless, skin hot and moist.",
        "vitals": {"scenario_number": 1, "vital_signs": {
            "heart_rate_bpm": 170, "respiratory_rate_bpm": 44,
            "oxygen_saturation_percent": 97, "blood_pressure_systolic_mmhg": None,
            "temperature_value": 102.2, "temperature_unit": "F"}},
    }
    intake, defaulted = case_to_intake(case)
    assert not defaulted
    assert intake.age_months == 8.0
    assert intake.complaint_category == "fever"
    assert intake.responsiveness == "verbal"
    assert intake.vitals.temp_c == 39.0
    assert intake.vitals.hr == 170
