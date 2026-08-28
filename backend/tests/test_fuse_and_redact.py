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
    r = redact("chest pain after a fall; passport 987654321, "
               "driver license D1234567, IBAN GB33BUKB20201555555555, "
               "email r.kumar@example.com, notes at https://myblog.example.com")
    assert set(r.entities_removed) >= {"US_PASSPORT", "US_DRIVER_LICENSE",
                                       "IBAN_CODE", "EMAIL_ADDRESS", "URL"}
    for identifier in ["987654321", "D1234567", "GB33BUKB20201555555555",
                       "r.kumar", "myblog.example.com"]:
        assert identifier not in r.text
    assert "chest pain" in r.text


def test_a_bare_domain_is_redacted_but_a_missing_space_is_not():
    assert "rameshkumar.com" not in redact("my blog is www.rameshkumar.com").text
    assert "myclinic.org" not in redact("see myclinic.org for details").text
    # a missing space after a full stop is a typo, not a domain
    typo = "finished washing dishes.She then felt dizzy"
    assert redact(typo).text == typo


def test_clinical_numbers_are_not_mistaken_for_identifiers():
    # a bare digit run scores 0.05: below the floor, and everywhere in
    # clinical text
    for text in ["blood sugar 456789012 mg/dL from the meter",
                 "epipen lot number 123456789 expired"]:
        assert redact(text).text == text


def test_reported_entities_are_the_ones_actually_applied():
    # the analyzer also finds a MEDICAL_LICENSE inside this IBAN; the
    # anonymizer applies one of them, and the audit trail says which
    r = redact("IBAN GB33BUKB20201555555555 on the form")
    assert r.entities_removed == ["IBAN_CODE"]


def test_clinical_times_and_ages_pass_through():
    # symptom durations and ages are the clinical signal, not identity
    r = redact("crushing chest pain for 45 minutes in an 84-year-old")
    assert "45 minutes" in r.text and "84-year-old" in r.text


def test_ages_over_the_safe_harbor_ceiling_are_aggregated():
    r = redact("94-year-old found on the floor at home")
    assert "94" not in r.text and "90 or older" in r.text
    assert "AGE_OVER_89" in r.entities_removed
    assert "102 year old" not in redact("102 year old, febrile").text


def test_redacts_name_and_phone_keeps_clinical_content():
    r = redact("Ramesh Kumar, phone 9876543210, has crushing chest pain")
    assert "Ramesh" not in r.text
    assert "chest pain" in r.text
    assert "PERSON" in r.entities_removed


def test_clinical_text_without_phi_passes_through():
    r = redact("chest tightness and tingling in hands during exam week")
    assert r.text == "chest tightness and tingling in hands during exam week"
