"""POMDP belief core: the belief state is the patient's acuity (a
distribution over ESI 1-5); rechecks are observations that update it."""

import math

from app.agent.fuse import LLMResult, fuse
from app.models import RulesResult, Vitals
from app.monitor import belief as bf


def fused(rules_esi: int, llm_esi: int | None, confidence: float = 0.9):
    rules = RulesResult(esi=rules_esi, reasons=["r"])
    llm = None if llm_esi is None else LLMResult(
        esi=llm_esi, confidence=confidence, reasoning=["l"])
    return fuse(rules, llm)


def test_belief_is_a_probability_distribution():
    b = bf.initial_belief(fused(3, 3))
    assert len(b) == 5
    assert math.isclose(sum(b), 1.0)
    assert all(p > 0 for p in b)


def test_agreement_is_sharper_than_disagreement():
    agree = bf.initial_belief(fused(3, 3))
    disagree = bf.initial_belief(fused(3, 2))
    assert bf.entropy(agree) < bf.entropy(disagree)
    assert max(agree) > max(disagree)


def test_missing_llm_flattens_the_belief():
    dual = bf.initial_belief(fused(3, 3))
    rules_only = bf.initial_belief(fused(3, None))
    assert bf.entropy(rules_only) > bf.entropy(dual)


def test_advance_drifts_mass_toward_acute():
    b = bf.initial_belief(fused(3, 3))
    later = bf.advance(b, minutes=60, hazard_per_hour=0.3)
    assert bf.p_more_acute(later, 3) > bf.p_more_acute(b, 3)
    assert math.isclose(sum(later), 1.0)
    # zero elapsed time changes nothing
    assert bf.advance(b, minutes=0, hazard_per_hour=0.3) == b


def test_esi1_is_absorbing():
    certain_critical = [1.0, 0.0, 0.0, 0.0, 0.0]
    later = bf.advance(certain_critical, minutes=120, hazard_per_hour=0.5)
    assert math.isclose(later[0], 1.0)


def test_worsening_observation_shifts_mass_acute():
    b = bf.initial_belief(fused(3, 3))
    worse = bf.observe(b, "worsening")
    stable = bf.observe(b, "stable")
    assert bf.p_more_acute(worse, 3) > bf.p_more_acute(b, 3)
    assert bf.p_more_acute(stable, 3) < bf.p_more_acute(b, 3)
    assert math.isclose(sum(worse), 1.0) and math.isclose(sum(stable), 1.0)


def test_danger_observation_is_stronger_than_worsening():
    b = bf.initial_belief(fused(3, 3))
    assert bf.p_more_acute(bf.observe(b, "danger"), 3) > \
        bf.p_more_acute(bf.observe(b, "worsening"), 3)


def test_entropy_normalized_to_unit_interval():
    assert math.isclose(bf.entropy([0.2] * 5), 1.0)
    assert bf.entropy([1.0, 0.0, 0.0, 0.0, 0.0]) == 0.0


def test_classify_recheck():
    base = Vitals(hr=90, rr=16, spo2=97, temp_c=37.0, sbp=120)
    assert bf.classify_recheck(base, base, danger=True, worsening=False) == "danger"
    assert bf.classify_recheck(base, base, danger=False, worsening=True) == "worsening"
    improved = Vitals(hr=80, rr=16, spo2=99, temp_c=37.0, sbp=120)
    assert bf.classify_recheck(base, improved, danger=False, worsening=False) == "improving"
    same = Vitals(hr=91, rr=16, spo2=97, temp_c=37.0, sbp=119)
    assert bf.classify_recheck(base, same, danger=False, worsening=False) == "stable"
