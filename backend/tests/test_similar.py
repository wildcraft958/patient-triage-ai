"""Retrieval of prior cases that look like this one.

Ranking is by embedding similarity alone. That is a measured choice, not a
shortcut: the case this feature exists for is A. Weber, whose "burning
indigestion" the category classifier reads as abdominal_pain while the
reasoning path recognises an atypical cardiac presentation. Tiering the
results by category agreement would push the classic angina case below every
abdominal-pain case, which is the opposite of useful. So the structured
fields are reported for the clinician to discount by, never ranked on.
"""

import pytest

from app.data_io import load_curated_patients
from app.engine import complaint_ml
from app.search import similar

needs_model = pytest.mark.skipif(
    not complaint_ml.available(),
    reason="distilled embedding model not loadable in this environment")

LIBRARY = load_curated_patients()
BY_NAME = {p.display_name: p for p in LIBRARY}


@needs_model
def test_finds_the_clinical_neighbour_of_an_atypical_presentation():
    weber = BY_NAME["A. Weber"]
    found = similar.find(weber, library=LIBRARY)
    assert found["note"] is None
    assert found["cases"], "no neighbours retrieved at all"
    assert found["cases"][0]["display_name"] == "M. Chen"


@needs_model
def test_never_retrieves_the_patient_being_asked_about():
    weber = BY_NAME["A. Weber"]
    found = similar.find(weber, library=LIBRARY)
    assert all(c["patient_id"] != weber.patient_id for c in found["cases"])


@needs_model
def test_reports_what_each_prior_case_turned_out_to_be():
    found = similar.find(BY_NAME["A. Weber"], library=LIBRARY)
    chen = next(c for c in found["cases"] if c["display_name"] == "M. Chen")
    assert chen["outcome_esi"] == BY_NAME["M. Chen"].expected_esi
    assert 0 < chen["similarity"] <= 1


@needs_model
def test_reports_a_category_disagreement_rather_than_hiding_it():
    """The neighbour that matters here is in a different category. Surfacing
    that is the whole mechanism by which a clinician discounts a match."""
    found = similar.find(BY_NAME["A. Weber"], library=LIBRARY)
    chen = next(c for c in found["cases"] if c["display_name"] == "M. Chen")
    assert chen["agrees"]["category"] is False
    assert chen["agrees"]["age_band"] is True


@needs_model
def test_separates_an_infant_from_an_adult_by_age_band():
    """next() rather than a filtered all(): if the case is not retrieved at
    all, an all() over an empty list passes and pins nothing."""
    haddad = BY_NAME["N. Haddad"]
    sibling = haddad.model_copy(
        update={"patient_id": "SIB-1", "display_name": "Z. Sibling"})
    found = similar.find(haddad, library=[*LIBRARY, sibling], limit=30)
    named = {c["display_name"]: c for c in found["cases"]}
    assert named["Z. Sibling"]["agrees"]["age_band"] is True
    assert named["A. Weber"]["agrees"]["age_band"] is False


@needs_model
def test_returns_at_most_the_limit_asked_for():
    found = similar.find(BY_NAME["A. Weber"], library=LIBRARY, limit=3)
    assert len(found["cases"]) <= 3


@needs_model
def test_ranks_by_similarity_descending():
    found = similar.find(BY_NAME["A. Weber"], library=LIBRARY)
    scores = [c["similarity"] for c in found["cases"]]
    assert scores == sorted(scores, reverse=True)


def test_says_why_it_returned_nothing_when_the_model_is_unavailable(monkeypatch):
    """An empty list with no reason reads as "this patient is unlike every
    prior case", which is a clinical claim. Absence of the model is not."""
    monkeypatch.setattr(complaint_ml, "_state", {})
    found = similar.find(BY_NAME["A. Weber"], library=LIBRARY)
    assert found["cases"] == []
    assert found["note"] and "unavailable" in found["note"].lower()


def test_says_why_it_returned_nothing_when_the_library_is_empty():
    found = similar.find(BY_NAME["A. Weber"], library=[])
    assert found["cases"] == []
    assert found["note"]


@needs_model
def test_drops_a_case_the_encoder_could_not_read():
    """A blank complaint embeds to zero and scores zero against everything.
    Returning it as a neighbour would be reporting a match that is not one."""
    chen = BY_NAME["M. Chen"]
    blank = chen.model_copy(
        update={"patient_id": "BLANK-1", "display_name": "Z. Blank",
                "chief_complaint": "   "})
    # A two-case library, so the blank would fit inside the limit and can
    # only be absent because it was filtered rather than ranked out.
    found = similar.find(BY_NAME["A. Weber"], library=[chen, blank])
    assert [c["patient_id"] for c in found["cases"]] == [chen.patient_id]
