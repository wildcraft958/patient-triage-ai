"""PHI redaction with Microsoft Presidio.

Free-text fields (chief complaint, medication and condition strings, every
OLDCARTS answer) are de-identified BEFORE they reach the LLM. Coverage
against the 18 HIPAA Safe Harbor identifier classes works in three ways:
most identifier classes are detected and redacted by the entity list below;
names, birth dates, MRNs, and account/beneficiary numbers are additionally
never collected by the intake schema in the first place (and patient_id
never reaches the LLM); and two classes are deliberately NOT redacted
because they are the clinical signal itself - relative times ("crushing
pain for 45 minutes") and ages drive the ESI decision points, and Safe
Harbor's date identifier concerns identity-linked dates (birth, admission),
not symptom durations. Clinical content passes through untouched.
"""

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


# The bare-domain URL heuristic misfires on typo'd sentence boundaries
# ("...washing dishes.She has..." reads as a domain at score 0.5); genuine
# URLs with a scheme or www score higher, so a floor removes the noise
# without losing real identifiers.
URL_MIN_SCORE = 0.6


def redact(text: str) -> RedactionResult:
    if not text.strip():
        return RedactionResult(text=text, entities_removed=[])
    analyzer, anonymizer = _engines()
    findings = [
        f for f in analyzer.analyze(text=text, language="en", entities=PHI_ENTITIES)
        if not (f.entity_type == "URL" and f.score < URL_MIN_SCORE)
    ]
    anonymized = anonymizer.anonymize(text=text, analyzer_results=findings)
    return RedactionResult(
        text=anonymized.text,
        entities_removed=sorted({f.entity_type for f in findings}),
    )
