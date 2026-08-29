"""Full-graph tests with a fake LLM transport (no API calls)."""

import json

from app.agent.graph import triage
from app.models import PatientIntake, Vitals


def fake_transport(esi: int, confidence: float = 0.9):
    def call(system: str, user: str) -> str:
        return json.dumps({
            "esi": esi, "confidence": confidence,
            "reasoning": ["fake reasoning"], "red_flags": [],
        })
    return call


def make_intake(**kw) -> PatientIntake:
    defaults = dict(
        patient_id="G-1", age_years=45,
        chief_complaint="abdominal pain for two days",
        complaint_category="abdominal_pain",
        vitals=Vitals(hr=88, rr=16, spo2=98, temp_c=37.2, sbp=125, pain=5),
    )
    defaults.update(kw)
    return PatientIntake(**defaults)


def test_agreeing_paths_produce_high_confidence():
    state = triage(make_intake(), transport=fake_transport(3))
    fused = state["fused"]
    assert fused.esi == 3 and fused.paths_agree and fused.confidence == "high"


def test_disagreement_escalates_and_flags():
    # rules say ESI-3 (stable multi-resource); fake LLM says ESI-2
    state = triage(make_intake(), transport=fake_transport(2))
    fused = state["fused"]
    assert fused.esi == 2 and fused.clinician_flag and fused.confidence == "low"


def test_phi_is_redacted_before_llm_path():
    seen = {}

    def spying_transport(system: str, user: str) -> str:
        seen["user"] = user
        return json.dumps({"esi": 3, "confidence": 0.9, "reasoning": ["ok"]})

    intake = make_intake(
        chief_complaint="Sunita Devi reports abdominal pain, callback 9876543210"
    )
    state = triage(intake, transport=spying_transport)
    assert "Sunita" not in seen["user"]
    assert "abdominal pain" in seen["user"]
    assert "PERSON" in state["phi_entities_removed"]


def test_history_fields_are_redacted_before_llm_path():
    seen = {}

    def spying_transport(system: str, user: str) -> str:
        seen["user"] = user
        return json.dumps({"esi": 3, "confidence": 0.9, "reasoning": ["ok"]})

    intake = make_intake(
        has_history=True,
        medications=["insulin, prescribed by Dr. Ramesh Kumar"],
        conditions=["type 2 diabetes, followed up in Kolkata"],
    )
    state = triage(intake, transport=spying_transport)
    assert "Ramesh" not in seen["user"]
    assert "Kolkata" not in seen["user"]
    assert "insulin" in seen["user"]
    assert "diabetes" in seen["user"]
    # the stored intake stays untouched - redaction applies to the LLM copy only
    assert "Ramesh Kumar" in intake.medications[0]


def test_oldcarts_enters_the_prompt_only_when_present_and_redacted():
    from app.agent.llm_path import build_user_prompt
    from app.models import Oldcarts
    from app.privacy.redact import redact

    plain = make_intake()
    with_oc = make_intake(oldcarts=Oldcarts(
        onset="started at Ramesh Kumar's shop an hour ago", severity=6))

    # absent OLDCARTS renders nothing: pre-existing cache keys stay identical
    assert "OLDCARTS" not in build_user_prompt(plain, plain.chief_complaint)

    seen = {}

    def spying_transport(system: str, user: str) -> str:
        seen["user"] = user
        return json.dumps({"esi": 3, "confidence": 0.9, "reasoning": ["ok"]})

    triage(with_oc, transport=spying_transport)
    assert "OLDCARTS interview:" in seen["user"]
    assert "severity: 6" in seen["user"]
    assert "Ramesh" not in seen["user"]  # free-text answers pass through Presidio


def test_surge_fast_path_skips_llm_and_uses_rules():
    def exploding_transport(system, user):
        raise AssertionError("LLM must not be called in rules-only mode")

    state = triage(make_intake(), use_llm=False, transport=exploding_transport)
    fused = state["fused"]
    assert fused.esi == 3 and fused.llm is None


def test_malformed_llm_output_falls_back_to_rules():
    state = triage(make_intake(), transport=lambda s, u: "not json at all")
    fused = state["fused"]
    assert fused.esi == 3 and fused.llm is None


def test_display_name_never_reaches_the_reasoning_path():
    """The nurse's screen shows a name, the model never does. Free text is
    protected by redaction; the identity field is protected structurally, by
    never being rendered into the prompt at all - so it cannot leak through a
    recognizer gap, and it cannot move a cached prompt."""
    from app.agent.llm_path import build_user_prompt

    named = make_intake(display_name="M. Chen")
    plain = make_intake()
    assert build_user_prompt(named, named.chief_complaint) == \
        build_user_prompt(plain, plain.chief_complaint)

    seen = {}

    def spying_transport(system: str, user: str) -> str:
        seen["user"] = user
        return json.dumps({"esi": 3, "confidence": 0.9, "reasoning": ["ok"]})

    triage(named, transport=spying_transport)
    assert "Chen" not in seen["user"]
