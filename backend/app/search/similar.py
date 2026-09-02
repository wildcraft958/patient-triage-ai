"""Prior cases that look like this one, and what they turned out to be.

Retrieval-based decision support: rather than asserting a level, show the
neighbours and their recorded outcomes so a clinician can reason from them.
The literature puts the value of this on uncommon presentations that lack
consensus, which is exactly where this system's own hard case sits.

Ranking is embedding similarity alone, and that is measured rather than
assumed. A. Weber's "burning indigestion" is classified abdominal_pain while
the reasoning path recognises an atypical cardiac presentation; the classic
angina complaint is its nearest neighbour by embedding (0.46) but sits in a
different category. Tiering by category agreement would bury the one case
worth reading. So the structured fields are reported, never ranked on: they
are what a clinician discounts a match by, and hiding them would leave the
similarity number looking more authoritative than it is.
"""

from app.data_io import load_curated_patients
from app.engine.complaint_ml import embed
from app.engine.thresholds import DANGER_ZONE_BANDS, age_in_months

DEFAULT_LIMIT = 5


def _age_band(intake) -> int:
    """The band index the vital-sign thresholds already use, and nothing more.

    A geriatric split at 65 was tried and removed: it reported A. Weber at 66
    and M. Chen at 61 as different age bands, which is the single most
    important pair in the case library and a distinction no clinician would
    draw. These bands exist because vital-sign norms differ, which is the
    same question comparability is asking. A risk boundary is not.
    """
    months = age_in_months(intake)
    for i, (max_months, *_) in enumerate(DANGER_ZONE_BANDS):
        if max_months is None or months < max_months:
            return i
    return len(DANGER_ZONE_BANDS) - 1


def _rendered(case, score: float, intake) -> dict:
    return {
        "patient_id": case.patient_id,
        "display_name": case.display_name,
        "chief_complaint": case.chief_complaint,
        "similarity": round(score, 3),
        "outcome_esi": case.expected_esi,
        "agrees": {
            "category": case.complaint_category == intake.complaint_category,
            "age_band": _age_band(case) == _age_band(intake),
        },
    }


def find(intake, library=None, limit: int = DEFAULT_LIMIT) -> dict:
    """Nearest prior cases to `intake`, or an empty list with the reason.

    An empty list on its own reads as "unlike every prior case", which is a
    clinical claim. The model being unloadable is not that claim, so the
    reason travels with the result rather than being logged and dropped.
    """
    library = load_curated_patients() if library is None else library
    pool = [c for c in library if c.patient_id != intake.patient_id]
    if not pool:
        return {"cases": [], "note": "No prior cases in the library to compare against."}

    vectors = embed([intake.chief_complaint, *(c.chief_complaint for c in pool)])
    if vectors is None:
        return {"cases": [],
                "note": "The embedding model is unavailable, so similar-case "
                        "retrieval is off. Every other path is unaffected."}

    query, rest = vectors[0], vectors[1:]
    scored = sorted(((case, float(query @ vector)) for case, vector in zip(pool, rest)),
                    key=lambda pair: -pair[1])
    # A zero score means the encoder read nothing in that complaint. Returning
    # it as a neighbour would report a match that is not one.
    return {"cases": [_rendered(case, score, intake)
                      for case, score in scored[:limit] if score > 0],
            "note": None}
