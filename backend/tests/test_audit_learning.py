"""Audit trail (legal-grade override records) and the override-reward
learning loop (asymmetric rewards, escalate-only calibration)."""

import pytest
from pydantic import ValidationError

from app.audit.log import AuditLog, OverrideRecord
from app.learning.loop import CalibrationTable, compute_reward, compute_reward_vector


# --- audit ---

def test_events_append_and_read_back_in_order():
    log = AuditLog(path=":memory:")
    log.log("triage", "P1", sim_min=0, payload={"esi": 3, "confidence": "high"})
    log.log("override", "P1", sim_min=12, payload={"original_esi": 3, "new_esi": 2})
    events = log.events_for("P1")
    assert [e["event_type"] for e in events] == ["triage", "override"]
    assert events[0]["payload"]["esi"] == 3
    assert events[1]["sim_min"] == 12


def test_override_record_requires_all_legal_fields():
    OverrideRecord(original_esi=3, new_esi=2, clinician_id="RN-07",
                   reason="patient looks septic", sim_min=12)
    with pytest.raises(ValidationError):
        OverrideRecord(original_esi=3, new_esi=2, clinician_id="RN-07",
                       reason="", sim_min=12)  # empty reason is not a reason
    with pytest.raises(ValidationError):
        OverrideRecord(original_esi=3, new_esi=2, reason="x", sim_min=12)  # no clinician


# --- reward: asymmetric by design (under-triage costs 5x over-triage) ---

def test_acceptance_rewards_positive():
    assert compute_reward(recommended_esi=3, clinician_esi=None) == 1.0


def test_under_triage_override_penalized_hard():
    assert compute_reward(recommended_esi=3, clinician_esi=2) == -1.0
    assert compute_reward(recommended_esi=4, clinician_esi=2) == -2.0


def test_over_triage_override_penalized_lightly():
    assert compute_reward(recommended_esi=3, clinician_esi=4) == pytest.approx(-0.2)


# --- multi-axis reward structure (the five ResidencyRL axes) ---

def test_reward_vector_acceptance():
    v = compute_reward_vector(recommended_esi=3, clinician_esi=None, dual_chain=True)
    assert v.diagnostic_accuracy == 1.0
    assert v.safety == 0.0 and v.management_quality == 0.0
    assert v.communication == 1.0 and v.documentation == 1.0
    assert v.total == 1.0  # preserves the scalar semantics


def test_reward_vector_under_triage_dominated_by_safety_axis():
    v = compute_reward_vector(recommended_esi=4, clinician_esi=2, dual_chain=True)
    assert v.safety == -2.0
    assert v.management_quality == 0.0
    assert v.diagnostic_accuracy == pytest.approx(-0.5)
    assert v.total == -2.0
    assert abs(v.safety) > abs(v.management_quality)


def test_reward_vector_over_triage_hits_management_axis():
    v = compute_reward_vector(recommended_esi=3, clinician_esi=4, dual_chain=True)
    assert v.management_quality == pytest.approx(-0.2)
    assert v.safety == 0.0
    assert v.total == pytest.approx(-0.2)


def test_reward_vector_communication_axis_scores_the_explanation():
    dual = compute_reward_vector(recommended_esi=3, clinician_esi=None, dual_chain=True)
    rules_only = compute_reward_vector(recommended_esi=3, clinician_esi=None,
                                       dual_chain=False)
    assert dual.communication > rules_only.communication
    assert rules_only.total < dual.total  # the axis prices the scalar too


def test_documentation_axis_prices_the_scalar():
    documented = compute_reward_vector(recommended_esi=3, clinician_esi=4,
                                       dual_chain=True, documented=True)
    undocumented = compute_reward_vector(recommended_esi=3, clinician_esi=4,
                                         dual_chain=True, documented=False)
    assert undocumented.documentation < documented.documentation
    assert undocumented.total < documented.total


def test_safety_axis_dominates_all_soft_axes():
    # the sloppiest over-triage still outscores the cleanest under-triage
    sloppy_over = compute_reward_vector(recommended_esi=3, clinician_esi=4,
                                        dual_chain=False, documented=False)
    clean_under = compute_reward_vector(recommended_esi=3, clinician_esi=2,
                                        dual_chain=True, documented=True)
    assert clean_under.total < sloppy_over.total


# --- calibration: learns to escalate, can never downgrade ---

def test_repeated_under_triage_overrides_teach_escalation():
    table = CalibrationTable()
    assert table.adjustment("abdominal_pain", "geriatric") == 0
    table.record("abdominal_pain", "geriatric", under_triage=True)
    table.record("abdominal_pain", "geriatric", under_triage=True)
    assert table.adjustment("abdominal_pain", "geriatric") == 1


def test_acceptances_decay_the_signal():
    table = CalibrationTable()
    table.record("fever", "adult", under_triage=True)
    table.record("fever", "adult", under_triage=True)
    assert table.adjustment("fever", "adult") == 1
    for _ in range(6):
        table.record("fever", "adult", under_triage=False)
    assert table.adjustment("fever", "adult") == 0


def test_adjustment_only_escalates():
    table = CalibrationTable()
    for _ in range(10):
        table.record("sprain", "adult", under_triage=False)
    assert table.adjustment("sprain", "adult") == 0  # never negative


def test_applying_adjustment_floors_at_esi_1():
    table = CalibrationTable()
    table.record("chest_pain", "adult", under_triage=True)
    table.record("chest_pain", "adult", under_triage=True)
    assert table.apply("chest_pain", "adult", esi=3) == 2
    assert table.apply("chest_pain", "adult", esi=1) == 1


def test_table_roundtrips_through_json(tmp_path):
    path = tmp_path / "calibration.json"
    table = CalibrationTable(path=path)
    table.record("fever", "geriatric", under_triage=True)
    table.record("fever", "geriatric", under_triage=True)
    table.save()
    reloaded = CalibrationTable(path=path)
    assert reloaded.adjustment("fever", "geriatric") == 1
