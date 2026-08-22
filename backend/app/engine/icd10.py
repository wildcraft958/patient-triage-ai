"""ICD-10 auto-coding: the complaint category (parsed from free text by the
intake classifier or selected by the nurse) maps to a provisional ICD-10
code for the encounter record. Provisional by design - diagnosis coding is
downstream clinical work; triage only seeds it."""

ICD10 = {
    "chest_pain": ("R07.9", "Chest pain, unspecified"),
    "abdominal_pain": ("R10.9", "Unspecified abdominal pain"),
    "breathing_difficulty": ("R06.00", "Dyspnea, unspecified"),
    "stroke_signs": ("I63.9", "Cerebral infarction, unspecified"),
    "allergic_reaction": ("T78.2", "Anaphylactic shock, unspecified"),
    "fever": ("R50.9", "Fever, unspecified"),
    "sepsis_concern": ("A41.9", "Sepsis, unspecified organism"),
    "trauma_major": ("T14.90", "Injury, unspecified"),
    "self_harm": ("R45.851", "Suicidal ideations"),
    "laceration": ("T14.8", "Other injury of unspecified body region"),
    "sprain": ("T14.3", "Dislocation, sprain of unspecified body region"),
    "rash": ("R21", "Rash and other nonspecific skin eruption"),
    "medication_refill": ("Z76.0", "Encounter for issue of repeat prescription"),
}


def code_for(category: str) -> dict | None:
    entry = ICD10.get(category)
    if entry is None:
        return None
    return {"code": entry[0], "label": entry[1]}
