"""PHI redaction with Microsoft Presidio.

Free-text fields (chief complaint, medication and condition strings, every
OLDCARTS answer) are de-identified BEFORE they reach the LLM. Coverage
against the 18 HIPAA Safe Harbor identifier classes works in three ways:
most identifier classes are detected and redacted by the entity list below;
names, birth dates, MRNs, and account/beneficiary numbers are additionally
never collected by the intake schema in the first place (and patient_id
never reaches the LLM); and relative times ("crushing pain for
45 minutes") are deliberately NOT redacted because they are the clinical
signal itself - they drive the ESI decision points, and Safe Harbor's date
identifier concerns identity-linked dates (birth, admission), not symptom
durations. Ages pass through below the Safe Harbor ceiling and are
aggregated above it. Clinical content passes through untouched.
"""

import re
from functools import lru_cache

from pydantic import BaseModel

PHI_ENTITIES = [
    "PERSON",
    "PHONE_NUMBER",
    "EMAIL_ADDRESS",
    "LOCATION",
    "US_SSN",
    "CREDIT_CARD",
    "IP_ADDRESS",
    "URL",
    "US_DRIVER_LICENSE",
    "US_PASSPORT",
    "US_BANK_NUMBER",
    "US_ITIN",
    "IBAN_CODE",
    "MEDICAL_LICENSE",
    "CRYPTO",
]


# Medications and conditions arrive as coded values, not prose. A name-class
# recognizer that claims the WHOLE of one is wrong by construction - the
# field says the value is a drug or a condition, and en_core_web_sm reads
# "lisinopril" as a person - while a name sitting inside a longer entry
# ("insulin, prescribed by Dr. R Kumar") is exactly what we do want removed.
NAME_LIKE_ENTITIES = {"PERSON", "LOCATION", "NRP"}


class RedactionResult(BaseModel):
    text: str
    entities_removed: list[str]


@lru_cache(maxsize=1)
def _engines():
    # Presidio + spaCy load takes seconds; initialize once per process
    from presidio_analyzer import AnalyzerEngine
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    from presidio_anonymizer import AnonymizerEngine

    from app.config import settings

    provider = NlpEngineProvider(nlp_configuration={
        "nlp_engine_name": "spacy",
        "models": [{"lang_code": "en", "model_name": settings.spacy_model}],
    })
    return AnalyzerEngine(nlp_engine=provider.create_engine()), AnonymizerEngine()


# Presidio scores every match, and the two populations are far apart
# (measured on this recognizer set): an identifier of real shape, or one
# with a supporting context word beside it, scores 0.40 and up - IBAN and
# medical license 1.00, driver license 0.65, phone 0.40 to 0.75, passport
# 0.40. A bare digit run with nothing around it scores 0.05 or less, and
# clinical text is full of those: a glucose reading, an epipen lot number,
# a device serial. The floor sits in the empty band between them.
MIN_SCORE = 0.3

# Safe Harbor aggregates every age over 89 into one bucket, because a
# 94-year-old is identifying in a way a 74-year-old is not. Ages under the
# ceiling are clinical signal and pass through untouched.
SAFE_HARBOR_AGE_CEILING = 90
_AGE_IN_TEXT = re.compile(r"\b(\d{2,3})[\s-]*(?:year|yr)s?[\s-]*old\b", re.I)


def _keep(finding, text: str, coded_value: bool = False) -> bool:
    if finding.score < MIN_SCORE:
        return False
    if (coded_value and finding.entity_type in NAME_LIKE_ENTITIES
            and text[finding.start:finding.end].strip() == text.strip()):
        return False  # the whole coded value read as a name: a drug, not a person
    if finding.entity_type != "URL" or "//" in text[finding.start:finding.end]:
        return True
    # A missing space after a full stop reads as a bare domain
    # ("...washing dishes.She has..."). A real top-level domain is not a
    # Capitalized word, so the shape tells the two apart - a score floor
    # cannot, since both land on 0.50.
    label = text[finding.start:finding.end].rsplit(".", 1)[-1]
    return label.islower() or label.isupper()


def _aggregate_age(match: re.Match) -> str:
    if int(match.group(1)) < SAFE_HARBOR_AGE_CEILING:
        return match.group(0)
    return f"{SAFE_HARBOR_AGE_CEILING} or older"


def aggregate_age(age_years: int) -> int:
    """Safe Harbor bucket for the structured age that reaches the LLM. The
    rules path keeps the exact age: it never leaves the building."""
    return min(age_years, SAFE_HARBOR_AGE_CEILING)


def redact_clinical_value(text: str) -> RedactionResult:
    """Redaction for one coded clinical field (a medication, a condition).
    Identical to prose redaction except that a name claiming the entire
    value is treated as the false positive it is."""
    return redact(text, coded_value=True)


def redact(text: str, coded_value: bool = False) -> RedactionResult:
    if not text.strip():
        return RedactionResult(text=text, entities_removed=[])
    analyzer, anonymizer = _engines()
    findings = [f for f in analyzer.analyze(text=text, language="en",
                                            entities=PHI_ENTITIES)
                if _keep(f, text, coded_value)]
    anonymized = anonymizer.anonymize(text=text, analyzer_results=findings)
    # the anonymizer resolves overlapping findings, so the audit trail
    # reports what it actually applied - never a redaction that a wider,
    # lower-scoring match had claimed
    removed = {item.entity_type for item in anonymized.items}
    aggregated = _AGE_IN_TEXT.sub(_aggregate_age, anonymized.text)
    if aggregated != anonymized.text:
        removed.add("AGE_OVER_89")
    return RedactionResult(text=aggregated, entities_removed=sorted(removed))
