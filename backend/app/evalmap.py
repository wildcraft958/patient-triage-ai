"""Map ESI benchmark scenarios (free-text description + extracted vitals)
into structured PatientIntake records so the rules path can score them.

The mapping is deliberately conservative and documented: age comes from the
text, vitals from the benchmark's extraction files (Fahrenheit converted),
complaint category from first-match keywords. Where age is not stated the
adult default (40) is used and marked.
"""

import re
import unicodedata

from app.models import PatientIntake, Vitals

CATEGORY_KEYWORDS: list[tuple[str, list[str]]] = [
    ("self_harm", ["suicid", "overdose", "self-harm", "hurt himself", "hurt herself"]),
    ("stroke_signs", ["slurred", "facial droop", "droop", "stroke", "one-sided weakness"]),
    ("breathing_difficulty", ["short of breath", "shortness of breath", "difficulty breathing",
                              "respiratory distress", "wheez", "asthma", "can't breathe",
                              "trouble breathing", "labored breathing"]),
    ("chest_pain", ["chest pain", "chest pressure", "chest tightness", "chest discomfort"]),
    ("trauma_major", ["motor vehicle", "mvc", "fell from", "fall from", "gunshot",
                      "stabbed", "stab wound", "struck by", "collision", "hit by a car",
                      "assault"]),
    ("sepsis_concern", ["septic", "rigors"]),
    ("abdominal_pain", ["abdominal pain", "stomach pain", "belly pain", "abd pain",
                        "epigastric", "flank pain", "vomiting blood", "abdominal cramp"]),
    ("fever", ["fever", "febrile"]),
    ("laceration", ["laceration", "cut on", "cut his", "cut her", "glass cut"]),
    ("sprain", ["sprain", "twisted ankle", "twisted his ankle", "twisted her ankle"]),
    ("rash", ["rash", "hives"]),
    ("medication_refill", ["refill", "out of medication", "ran out of med"]),
    # lowest precedence on purpose: verified to reclassify zero benchmark
    # cases, so the committed LLM replay cache stays byte-identical
    ("allergic_reaction", ["anaphyla", "allergic reaction", "bee sting", "epipen"]),
]

_AGE_YEARS = re.compile(r"(\d{1,3})[\s-]*(?:year|yr)s?[\s-]*old", re.I)
_AGE_MONTHS = re.compile(r"(\d{1,2})[\s-]*months?[\s-]*old", re.I)
_AGE_WEEKS = re.compile(r"(\d{1,2})[\s-]*weeks?[\s-]*old", re.I)
_AGE_DAYS = re.compile(r"(\d{1,2})[\s-]*days?[\s-]*old", re.I)
_PAIN = re.compile(r"(\d{1,2})\s*(?:/|out of)\s*10", re.I)

DEFAULT_ADULT_AGE = 40


def parse_age(text: str) -> tuple[int, float | None, bool]:
    """Return (age_years, age_months, was_defaulted)."""
    if m := _AGE_YEARS.search(text):
        return int(m.group(1)), None, False
    if m := _AGE_MONTHS.search(text):
        months = float(m.group(1))
        return 0, months, False
    if m := _AGE_WEEKS.search(text):
        return 0, float(m.group(1)) / 4.33, False
    if m := _AGE_DAYS.search(text):
        return 0, float(m.group(1)) / 30.4, False
    return DEFAULT_ADULT_AGE, None, True


# Second-pass lexicon: phrase-level matching with bounded edit distance over
# accent-folded tokens, covering misspellings, Spanish, Hinglish, and synonym
# presentations. Runs ONLY when the exact first pass returns "other", so every
# case the first pass already categorizes keeps its category (and its cached
# reasoning) untouched. Phrases, never bare tokens: "throat closing" matches,
# a sore "throat" alone never does.
FUZZY_LEXICON: list[tuple[str, list[str]]] = [
    ("stroke_signs", ["derrame cerebral", "cara caida", "face drooping",
                      "lakwa mar gaya"]),
    ("breathing_difficulty", ["dificultad para respirar", "no puedo respirar",
                              "no puede respirar", "falta de aire",
                              "saans nahi aa rahi", "saans lene mein dikkat",
                              "struggling to breathe", "gasping for air"]),
    ("chest_pain", ["dolor de pecho", "dolor en el pecho", "seene mein dard",
                    "chhati mein dard", "pain in my chest"]),
    ("abdominal_pain", ["dolor abdominal", "dolor de estomago",
                        "dolor de barriga", "pet mein dard", "pet dard",
                        "pain in my stomach", "pain in my belly"]),
    ("fever", ["fiebre alta", "fiebre", "bukhar", "high temperature"]),
    ("allergic_reaction", ["anaphylaxis", "anaphylactic", "anafilaxia",
                           "reaccion alergica", "alergia grave",
                           "throat closing", "throat is closing",
                           "throat tightness", "tongue swelling",
                           "tongue is swelling", "swollen tongue",
                           "lips swelling", "swollen lips", "face swelling",
                           "hives all over"]),
]

# Pregnancy complication is a compound predicate, not a keyword: pregnancy
# context alone ("I think I'm pregnant") is not an obstetric emergency, and
# treating it as one would over-triage routine visits. Context AND a
# complication sign are both required; preeclampsia terms match alone.
_PREG_DIRECT = ["preeclampsia", "eclampsia"]
_PREG_CONTEXT = ["pregnant", "pregnancy", "pregnancies", "postpartum",
                 "post partum", "embarazada", "embarazo", "gestation"]
_PREG_SIGNS = ["bleed", "clot", "headache", "seiz", "convuls", "vision",
               "blurr", "swelling", "swollen", "contraction", "vomit",
               "cramp", "dizz", "faint", "pass out", "unresponsive",
               "not respond", "baby not moving", "no fetal movement"]


def _normalize(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text.lower())
    stripped = "".join(c for c in folded if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^a-z0-9]+", " ", stripped).split())


def _osa_distance(a: str, b: str, cap: int) -> int:
    """Optimal string alignment distance (edits + adjacent transpositions),
    early-exited once every path exceeds cap."""
    prev2: list[int] = []
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cost = 0 if ca == cb else 1
            best = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if i > 1 and j > 1 and ca == b[j - 2] and a[i - 2] == cb:
                best = min(best, prev2[j - 2] + cost)
            cur.append(best)
        if min(cur) > cap:
            return cap + 1
        prev2, prev = prev, cur
    return prev[len(b)]


def _within_edits(token: str, term: str) -> bool:
    """Distance budget scales with term length, conservatively: short terms
    must match exactly so common words can never fuzz into clinical ones."""
    cap = 0 if len(term) < 7 else (1 if len(term) < 10 else 2)
    if token == term:
        return True
    if cap == 0 or abs(len(token) - len(term)) > cap:
        return False
    return _osa_distance(token, term, cap) <= cap


def _phrase_in(tokens: list[str], phrase: str) -> bool:
    terms = phrase.split()
    span = len(terms)
    return any(
        all(_within_edits(tokens[i + j], terms[j]) for j in range(span))
        for i in range(len(tokens) - span + 1)
    )


def _is_pregnancy_complication(norm: str, tokens: list[str]) -> bool:
    if any(_within_edits(t, term) for t in tokens for term in _PREG_DIRECT):
        return True
    return (any(c in norm for c in _PREG_CONTEXT)
            and any(s in norm for s in _PREG_SIGNS))


def _classify_second_pass(text: str) -> str:
    norm = _normalize(text)
    tokens = norm.split()
    for category, phrases in FUZZY_LEXICON:
        if any(_phrase_in(tokens, p) for p in phrases):
            return category
    if _is_pregnancy_complication(norm, tokens):
        return "pregnancy_complication"
    return "other"


def classify_category(text: str) -> str:
    lowered = text.lower()
    for category, keywords in CATEGORY_KEYWORDS:
        if any(kw in lowered for kw in keywords):
            return category
    return _classify_second_pass(text)


def to_celsius(value: float | None, unit: str | None) -> float | None:
    if value is None:
        return None
    if (unit or "").lower().startswith("f") or value > 45:
        return round((value - 32) * 5 / 9, 1)
    return value


def parse_vitals(extracted: dict | None, description: str) -> Vitals:
    v = (extracted or {}).get("vital_signs", {}) or {}
    pain = None
    if m := _PAIN.search(description):
        pain = min(10, int(m.group(1)))
    return Vitals(
        hr=v.get("heart_rate_bpm"),
        rr=v.get("respiratory_rate_bpm"),
        spo2=v.get("oxygen_saturation_percent"),
        sbp=v.get("blood_pressure_systolic_mmhg"),
        temp_c=to_celsius(v.get("temperature_value"), v.get("temperature_unit")),
        pain=pain,
    )


def parse_responsiveness(text: str) -> str:
    lowered = text.lower()
    if "unresponsive" in lowered:
        return "unresponsive"
    if any(w in lowered for w in ["lethargic", "listless", "confused", "disoriented",
                                  "obtunded", "difficult to arouse"]):
        return "verbal"
    return "alert"


def case_to_intake(case: dict) -> tuple[PatientIntake, bool]:
    """Return (intake, age_was_defaulted) for a benchmark case dict."""
    desc = case["description"]
    age_years, age_months, defaulted = parse_age(desc)
    intake = PatientIntake(
        patient_id=f"{case['set']}-{case['scenario_number']}",
        age_years=age_years,
        age_months=age_months,
        chief_complaint=desc,
        complaint_category=classify_category(desc),
        vitals=parse_vitals(case.get("vitals"), desc),
        responsiveness=parse_responsiveness(desc),
        has_history=False,
    )
    return intake, defaulted
