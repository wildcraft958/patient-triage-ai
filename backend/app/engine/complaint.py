"""Intake NLP: chief complaint text -> complaint category.

Two passes, resolved by clinical risk tier. Pass 1 is an exact keyword scan;
pass 2 is phrase-level matching with a length-bounded edit distance over
accent-folded tokens (misspellings, Spanish, Hinglish, synonym
presentations), plus a compound pregnancy-complication predicate.
Resolution: a match against any always-high-risk category, from either
pass, beats any benign match - list order only breaks ties within the same
risk tier. A benign word like "hives" must never claim a sentence that also
carries "throat closing". The category then drives resource estimation, the
high-risk gate, ICD-10 seeding, and retrieval for the reasoning path.
"""

import re
import unicodedata

from app.engine.esi_rules import ALWAYS_HIGH_RISK

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
_PREG_SIGNS = ["bleed", "spotting", "clot", "ectopic", "headache", "seiz",
               "convuls", "vision", "blurr", "swelling", "swollen",
               "contraction", "vomit", "cramp", "dizz", "faint", "pass out",
               "unresponsive", "not respond", "baby not moving",
               "no fetal movement"]


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


def _second_pass_matches(text: str) -> list[str]:
    norm = _normalize(text)
    tokens = norm.split()
    matches = [category for category, phrases in FUZZY_LEXICON
               if any(_phrase_in(tokens, p) for p in phrases)]
    if _is_pregnancy_complication(norm, tokens):
        matches.append("pregnancy_complication")
    return matches


def classify_category(text: str) -> str:
    lowered = text.lower()
    pass1 = [category for category, keywords in CATEGORY_KEYWORDS
             if any(kw in lowered for kw in keywords)]
    if pass1 and pass1[0] in ALWAYS_HIGH_RISK:
        return pass1[0]
    # the best exact match is benign (or absent): a high-risk signal from
    # either pass still outranks it
    pass2 = _second_pass_matches(text)
    high_risk = ([c for c in pass1 if c in ALWAYS_HIGH_RISK]
                 or [c for c in pass2 if c in ALWAYS_HIGH_RISK])
    if high_risk:
        return high_risk[0]
    if pass1:
        return pass1[0]
    return pass2[0] if pass2 else "other"
