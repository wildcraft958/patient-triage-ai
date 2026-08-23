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


def test_allergic_reaction_recognized():
    assert classify_category("anaphylaxis after eating peanuts") == "allergic_reaction"
    assert classify_category("swelling after a bee sting") == "allergic_reaction"
    # both categories are high-risk: list order breaks the tie toward the
    # airway presentation, which is the more specific emergency here
    assert classify_category("allergic reaction with wheezing") == "breathing_difficulty"


def test_high_risk_match_beats_benign_match_from_either_pass():
    """Matches resolve by clinical risk tier, not list order: a benign
    keyword like 'hives' must never claim a sentence that also carries a
    high-risk signal, even one only the fuzzy pass can see."""
    assert classify_category("throat closing up, hives, after eating shellfish") \
        == "allergic_reaction"
    assert classify_category("hives everywhere and my tongue is swelling") \
        == "allergic_reaction"
    assert classify_category("rash on arms, throat tightness after peanuts") \
        == "allergic_reaction"
    assert classify_category("allergic reaction, hives everywhere") == "allergic_reaction"
    # benign stays benign when no high-risk signal is present
    assert classify_category("rash on my arm for a week") == "rash"
    assert classify_category("itchy rash after new detergent") == "rash"


def test_pregnancy_complication_outranks_benign_abdominal_pain():
    # the handbook's rule-out-ectopic presentation: benign pass-1 category
    # must not mask the obstetric emergency
    assert classify_category(
        "low abdominal pain for 4 days, this morning she began spotting, "
        "last menstrual period 7 weeks ago, previous ectopic pregnancy") \
        == "pregnancy_complication"


# --- second pass: misspellings, accents, Spanish, Hinglish, synonyms ---

def test_misspelled_anaphylaxis_still_classifies():
    assert classify_category("having an anaphlaxis episode") == "allergic_reaction"
    assert classify_category("looks like anaphalaxis") == "allergic_reaction"


def test_anaphylaxis_synonym_phrases_classify():
    assert classify_category("my throat is closing and my tongue is swelling") \
        == "allergic_reaction"
    # bare tokens never match: sore throats and sprains stay uncategorized
    assert classify_category("my throat is on fire") == "other"
    assert classify_category("swollen ankle after a game") == "other"


def test_filler_words_never_defeat_a_high_risk_phrase():
    """Natural speech inserts fillers inside clinical phrases; a bounded
    bridge over a closed filler list must absorb them."""
    assert classify_category(
        "lips are swelling and I have a headache, took my allergy meds already") \
        == "allergic_reaction"
    assert classify_category("my tongue is really swelling up") == "allergic_reaction"
    assert classify_category("throat keeps closing when I swallow") == "allergic_reaction"
    # only filler tokens may bridge: content words never do
    assert classify_category("throat hurts, closing time at work") == "other"
    assert classify_category("sore throat since closing shift") == "other"


def test_spanish_complaints_classify():
    assert classify_category("dolor en el pecho y sudoracion") == "chest_pain"
    assert classify_category("no puedo respirar bien") == "breathing_difficulty"
    assert classify_category("reacción alérgica grave") == "allergic_reaction"


def test_hinglish_complaints_classify():
    assert classify_category("seene mein dard ho raha hai") == "chest_pain"
    assert classify_category("saans nahi aa rahi") == "breathing_difficulty"
    assert classify_category("tez bukhar hai") == "fever"


def test_pregnancy_complication_needs_context_plus_sign():
    assert classify_category(
        "28 weeks pregnant with a sudden severe headache, vomited twice") \
        == "pregnancy_complication"
    assert classify_category(
        "10 days post partum, heavy bleeding and passing clots") \
        == "pregnancy_complication"
    assert classify_category("preclampsia at last visit, feet swelling") \
        == "pregnancy_complication"
    # pregnancy WITHOUT a complication sign is not an obstetric emergency
    assert classify_category("I think I'm pregnant and scared to tell my mom") \
        == "other"
    assert classify_category("the condom broke and I don't want to get pregnant") \
        == "other"


def test_exact_match_wins_ties_within_a_risk_tier():
    # a pregnant patient whose complaint names chest pain follows the chest
    # pain protocol; pregnancy context alone never reroutes a matched case
    assert classify_category("32 weeks pregnant with chest pain") == "chest_pain"


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
