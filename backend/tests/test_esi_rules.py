"""Path A - deterministic ESI v4 rules engine.

The cases below encode the brief's mandated behaviors:
- age-banded vital thresholds (pediatric / adult / geriatric divergence)
- escalation bias under uncertainty (missing data never downgrades)
- zero-history patients scoreable from observed data alone
"""

from app.engine.esi_rules import score
from app.models import PatientIntake, Vitals


def make_intake(**kw) -> PatientIntake:
    defaults = dict(
        patient_id="TEST",
        age_years=30,
        chief_complaint="general complaint",
        complaint_category="minor",
        vitals=Vitals(hr=75, rr=14, spo2=98, temp_c=36.8, sbp=120, pain=2),
        has_history=False,
    )
    defaults.update(kw)
    return PatientIntake(**defaults)


# --- Decision point A: immediate life-saving intervention -> ESI-1 ---

def test_unresponsive_is_esi_1():
    r = score(make_intake(responsiveness="unresponsive"))
    assert r.esi == 1


def test_critical_hypoxia_is_esi_1():
    r = score(make_intake(vitals=Vitals(hr=120, rr=30, spo2=84, temp_c=37.0, sbp=100, pain=5)))
    assert r.esi == 1


# --- Decision point B: high-risk presentations -> ESI-2 ---

def test_adult_chest_pain_over_50_is_esi_2():
    r = score(make_intake(age_years=61, chief_complaint="chest pain radiating to left arm",
                          complaint_category="chest_pain"))
    assert r.esi == 2
    assert any("high-risk" in reason.lower() for reason in r.reasons)


def test_stroke_signs_are_esi_2():
    r = score(make_intake(age_years=58, chief_complaint="sudden facial droop and slurred speech",
                          complaint_category="stroke_signs"))
    assert r.esi == 2


def test_severe_pain_with_distress_is_esi_2():
    r = score(make_intake(vitals=Vitals(hr=110, rr=22, spo2=97, temp_c=37.0, sbp=130, pain=9),
                          complaint_category="abdominal_pain"))
    assert r.esi == 2


# --- Age-banded vitals: the SAME vitals must diverge across age bands ---

def test_hr_110_is_danger_for_adult_but_normal_for_child():
    vit = Vitals(hr=110, rr=18, spo2=97, temp_c=37.0, sbp=110, pain=3)
    adult = score(make_intake(age_years=40, vitals=vit, complaint_category="abdominal_pain"))
    child = score(make_intake(age_years=4, vitals=vit, complaint_category="abdominal_pain"))
    assert adult.danger_zone_vitals is True
    assert child.danger_zone_vitals is False
    assert adult.esi < child.esi  # adult escalates, child does not


def test_same_fever_diverges_pediatric_vs_geriatric_vs_adult():
    fever = Vitals(hr=90, rr=16, spo2=97, temp_c=38.5, sbp=120, pain=2)
    neonate = score(make_intake(age_years=0, age_months=0.5, vitals=fever,
                                complaint_category="fever"))
    geriatric = score(make_intake(age_years=75, vitals=fever, complaint_category="fever"))
    adult = score(make_intake(age_years=30, vitals=fever, complaint_category="fever"))
    assert neonate.esi <= 2      # neonate fever is always high risk
    assert geriatric.esi <= 3    # geriatric fever gets a sepsis watch
    assert adult.esi >= 4        # otherwise-well adult with low-grade fever waits
    assert geriatric.esi < adult.esi


# --- Decision point C/D: resources and danger-zone uptriage ---

def test_no_resources_is_esi_5():
    r = score(make_intake(complaint_category="medication_refill"))
    assert r.esi == 5


def test_one_resource_is_esi_4():
    r = score(make_intake(chief_complaint="simple laceration needing sutures",
                          complaint_category="laceration"))
    assert r.esi == 4


def test_multi_resource_stable_vitals_is_esi_3():
    r = score(make_intake(age_years=45, chief_complaint="abdominal pain 2 days",
                          complaint_category="abdominal_pain",
                          vitals=Vitals(hr=88, rr=16, spo2=98, temp_c=37.2, sbp=125, pain=5)))
    assert r.esi == 3


def test_multi_resource_with_danger_vitals_uptriages_to_2():
    r = score(make_intake(age_years=45, complaint_category="abdominal_pain",
                          vitals=Vitals(hr=118, rr=24, spo2=91, temp_c=38.9, sbp=95, pain=6)))
    assert r.esi == 2
    assert r.danger_zone_vitals is True


# --- Escalation bias: uncertainty never downgrades ---

def test_missing_vitals_on_multi_resource_complaint_escalates():
    r = score(make_intake(age_years=45, complaint_category="abdominal_pain", vitals=Vitals()))
    assert r.esi <= 2
    assert any("missing" in reason.lower() for reason in r.reasons)


def test_zero_history_patient_scores_from_observed_data():
    r = score(make_intake(has_history=False, complaint_category="chest_pain", age_years=61))
    assert 1 <= r.esi <= 5


# --- Danger-zone vitals must escalate EVERY category, not just 2+-resource ---

def test_deranged_vitals_escalate_single_resource_category():
    # anaphylaxis mis-coded as "other": HR 120 / SBP 80 must not sit at ESI-4
    r = score(make_intake(age_years=25, chief_complaint="feels unwell after bee sting",
                          complaint_category="other",
                          vitals=Vitals(hr=120, rr=22, spo2=95, temp_c=37.0, sbp=80, pain=4)))
    assert r.esi == 2
    assert r.danger_zone_vitals is True


def test_adult_hypotension_sbp_80_is_danger():
    r = score(make_intake(age_years=50, complaint_category="abdominal_pain",
                          vitals=Vitals(hr=90, rr=16, spo2=97, temp_c=37.0, sbp=80, pain=4)))
    assert r.esi == 2
    assert any("SBP" in reason for reason in r.reasons)


def test_hypertensive_crisis_sbp_220_is_danger():
    r = score(make_intake(age_years=55, chief_complaint="severe headache",
                          complaint_category="other",
                          vitals=Vitals(hr=88, rr=16, spo2=98, temp_c=36.9, sbp=225, pain=6)))
    assert r.esi == 2
    assert r.danger_zone_vitals is True


def test_child_sbp_below_adult_floor_is_not_flagged():
    # pediatric SBP norms differ; the SBP checks are adult-only by design
    r = score(make_intake(age_years=5, complaint_category="abdominal_pain",
                          vitals=Vitals(hr=100, rr=22, spo2=98, temp_c=37.0, sbp=85, pain=3)))
    assert r.danger_zone_vitals is False


def test_hives_with_normal_vitals_stays_esi_4():
    r = score(make_intake(age_years=28, chief_complaint="itchy hives on arms",
                          complaint_category="rash"))
    assert r.esi == 4


def test_missing_vitals_on_single_resource_flags_without_escalation():
    r = score(make_intake(age_years=30, complaint_category="laceration", vitals=Vitals()))
    assert r.esi == 4
    assert "vitals not recorded" in r.red_flags
    refill = score(make_intake(complaint_category="medication_refill", vitals=Vitals()))
    assert refill.esi == 5
    assert "vitals not recorded" in refill.red_flags


def test_allergic_reaction_category_is_high_risk():
    r = score(make_intake(age_years=25, chief_complaint="allergic reaction, lip swelling",
                          complaint_category="allergic_reaction"))
    assert r.esi == 2
    assert r.resources_estimate >= 2
