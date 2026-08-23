"""Intake NLP: chief complaint text -> complaint category.

Two tiers, in a fixed order:

1. RULES - one deterministic layer. An exact keyword scan (cheap, checked
   first) and a fuzzy phrase scan (accent-folded tokens, length-bounded
   edit distance; misspellings, Spanish, Hinglish, synonym presentations)
   feed a single resolution: any match against an always-high-risk category
   beats any benign match, and list order only breaks ties within the same
   risk tier. A benign word like "hives" can never claim a sentence that
   also carries "throat closing". These rules are the guaranteed-recall
   contract: their behavior is pinned by tests and anchors the committed
   reasoning caches.
2. MODEL - the distilled static-embedding classifier (engine.complaint_ml).
   Consulted only when the rules abstain, only for short chief-complaint
   text, and free to abstain itself. It covers phrasings nobody enumerated;
   it can never override a rule.

The category drives resource estimation, the high-risk ESI floor, ICD-10
seeding, and retrieval for the reasoning path. Unknown or empty input
always resolves to "other" - never an exception.
"""

import re
import unicodedata

from app.engine import complaint_ml
from app.engine.esi_rules import ALWAYS_HIGH_RISK

# category signal lives in the opening of a complaint; a hard cap keeps the
# fuzzy scan O(1) even against pathologically long free text
MAX_ANALYZED_CHARS = 2000

EXACT_KEYWORDS: list[tuple[str, list[str]]] = [
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
    # kept last: verified against the benchmark so committed reasoning
    # caches stay byte-identical (risk-tier resolution outranks order anyway)
    ("allergic_reaction", ["anaphyla", "allergic reaction", "bee sting", "epipen"]),
]

# Fuzzy phrases, never bare tokens: "throat closing" can match, a sore
# "throat" alone never can. Covers misspellings (via bounded edit distance),
# Spanish, romanized Hinglish, and synonym presentations.
FUZZY_PHRASES: list[tuple[str, list[str]]] = [
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
PREGNANCY_DIRECT_TERMS = ["preeclampsia", "eclampsia"]
PREGNANCY_CONTEXT = ["pregnant", "pregnancy", "pregnancies", "postpartum",
                     "post partum", "embarazada", "embarazo", "gestation"]
PREGNANCY_SIGNS = ["bleed", "spotting", "clot", "ectopic", "headache", "seiz",
                   "convuls", "vision", "blurr", "swelling", "swollen",
                   "contraction", "vomit", "cramp", "dizz", "faint",
                   "pass out", "unresponsive", "not respond",
                   "baby not moving", "no fetal movement"]

KNOWN_CATEGORIES = frozenset(
    [category for category, _ in EXACT_KEYWORDS]
    + [category for category, _ in FUZZY_PHRASES]
    + ["pregnancy_complication", "minor", "other"]
)


def _fold_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def _tokenize(text: str) -> list[str]:
    return re.sub(r"[^a-z0-9]+", " ", _fold_accents(text)).split()


def _edit_distance(a: str, b: str, cap: int) -> int:
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


def _tokens_match(token: str, term: str) -> bool:
    """Edit budget scales with term length, conservatively: short terms must
    match exactly so common words can never fuzz into clinical ones."""
    cap = 0 if len(term) < 7 else (1 if len(term) < 10 else 2)
    if token == term:
        return True
    if cap == 0 or abs(len(token) - len(term)) > cap:
        return False
    return _edit_distance(token, term, cap) <= cap


def _phrase_matches(tokens: list[str], phrase: str) -> bool:
    terms = phrase.split()
    span = len(terms)
    return any(
        all(_tokens_match(tokens[i + j], terms[j]) for j in range(span))
        for i in range(len(tokens) - span + 1)
    )


def _pregnancy_complication(folded: str, tokens: list[str]) -> bool:
    if any(_tokens_match(t, term) for t in tokens for term in PREGNANCY_DIRECT_TERMS):
        return True
    return (any(c in folded for c in PREGNANCY_CONTEXT)
            and any(s in folded for s in PREGNANCY_SIGNS))


def _rule_matches(text: str) -> tuple[list[str], list[str]]:
    """All rule matches, as (exact, fuzzy) category lists in list order."""
    lowered = text.lower()
    exact = [category for category, keywords in EXACT_KEYWORDS
             if any(kw in lowered for kw in keywords)]
    tokens = _tokenize(text)
    folded = " ".join(tokens)
    fuzzy = [category for category, phrases in FUZZY_PHRASES
             if any(_phrase_matches(tokens, p) for p in phrases)]
    if _pregnancy_complication(folded, tokens):
        fuzzy.append("pregnancy_complication")
    return exact, fuzzy


def _rules_category(text: str) -> str | None:
    """Tier 1: the deterministic rule layer. None means the rules abstain."""
    exact, fuzzy = _rule_matches(text)
    high_risk = ([c for c in exact if c in ALWAYS_HIGH_RISK]
                 or [c for c in fuzzy if c in ALWAYS_HIGH_RISK])
    if high_risk:
        return high_risk[0]
    if exact:
        return exact[0]
    if fuzzy:
        return fuzzy[0]
    return None


def classify_category(text: str) -> str:
    if not text or not text.strip():
        return "other"
    analyzed = text[:MAX_ANALYZED_CHARS]
    ruled = _rules_category(analyzed)
    if ruled is not None:
        return ruled
    # Tier 2: the distilled model may speak where the rules are silent
    prediction = complaint_ml.predict(analyzed)
    return prediction[0] if prediction else "other"
