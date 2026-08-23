from app.agent.fuse import FusedResult, LLMResult, fuse
from app.models import RulesResult
from app.privacy.redact import redact


def rules(esi: int) -> RulesResult:
    return RulesResult(esi=esi, reasons=[f"rules said {esi}"])


def llm(esi: int, confidence: float = 0.9) -> LLMResult:
    return LLMResult(esi=esi, confidence=confidence, reasoning=[f"llm said {esi}"])


# --- FUSE ---

def test_agreement_is_high_confidence_no_flag():
    r = fuse(rules(3), llm(3))
    assert (r.esi, r.confidence, r.paths_agree, r.clinician_flag) == (3, "high", True, False)


def test_agreement_with_low_self_confidence_is_moderate():
    r = fuse(rules(3), llm(3, confidence=0.4))
    assert r.confidence == "moderate"


def test_disagreement_takes_more_acute_and_flags():
    r = fuse(rules(4), llm(2))
    assert (r.esi, r.confidence, r.clinician_flag) == (2, "low", True)


def test_disagreement_never_downgrades_below_rules():
    r = fuse(rules(2), llm(4))
    assert r.esi == 2  # LLM saying "less urgent" cannot downgrade the rules path


def test_llm_unavailable_falls_back_to_rules_only():
    r = fuse(rules(3), None)
    assert r.esi == 3 and r.llm is None
    assert any("Rules-only" in n for n in r.notes)


def test_routes_cover_all_levels():
    for esi in range(1, 6):
        assert fuse(rules(esi), llm(esi)).route


# --- Presidio redaction ---

def test_extended_identifiers_are_redacted():
    r = redact("chest pain, my email is r.kumar@example.com, "
               "license D1234567 posted at https://myblog.example.com")
    assert "example.com" not in r.text.replace("<URL>", "")
    assert "r.kumar" not in r.text
    assert "chest pain" in r.text


def test_clinical_times_and_ages_pass_through():
    # symptom durations and ages are the clinical signal, not identity
    r = redact("crushing chest pain for 45 minutes in an 84-year-old")
    assert "45 minutes" in r.text and "84-year-old" in r.text


def test_redacts_name_and_phone_keeps_clinical_content():
    r = redact("Ramesh Kumar, phone 9876543210, has crushing chest pain")
    assert "Ramesh" not in r.text
    assert "chest pain" in r.text
    assert "PERSON" in r.entities_removed


def test_clinical_text_without_phi_passes_through():
    r = redact("chest tightness and tingling in hands during exam week")
    assert r.text == "chest tightness and tingling in hands during exam week"
