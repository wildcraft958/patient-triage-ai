"""PHI redaction with Microsoft Presidio.

Free text is de-identified BEFORE it reaches the LLM or the audit log:
PHI never leaves the hospital boundary un-redacted (HIPAA Safe Harbor
alignment). Clinical content (symptoms, vitals) passes through untouched.
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
    from presidio_anonymizer import AnonymizerEngine

    return AnalyzerEngine(), AnonymizerEngine()


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
