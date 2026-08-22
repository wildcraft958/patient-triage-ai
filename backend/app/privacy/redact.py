"""PHI redaction with Microsoft Presidio.

Free-text fields (chief complaint, medication and condition strings) are
de-identified BEFORE they reach the LLM. This is defense in depth, not the
whole privacy story: the intake schema collects no name, DOB, or MRN by
design, and patient_id is never sent to the LLM. The entity list below is
a working subset of the 18 HIPAA Safe Harbor identifiers - a production
deployment must extend it (dates, MRNs, ages over 89, license numbers)
and re-warm any response caches. Clinical content passes through untouched.
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


def redact(text: str) -> RedactionResult:
    if not text.strip():
        return RedactionResult(text=text, entities_removed=[])
    analyzer, anonymizer = _engines()
    findings = analyzer.analyze(text=text, language="en", entities=PHI_ENTITIES)
    anonymized = anonymizer.anonymize(text=text, analyzer_results=findings)
    return RedactionResult(
        text=anonymized.text,
        entities_removed=sorted({f.entity_type for f in findings}),
    )
