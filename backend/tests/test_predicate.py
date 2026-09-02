"""The Python half of the cohort predicate contract.

Both evaluators read data/predicate_conformance.json. The console filters the
board it is showing; this one re-evaluates pinned cohorts on the clock sweep,
and the two have to agree or a standing cohort means something different from
the question the clinician confirmed.
"""

import json

import pytest

from app.config import REPO_ROOT
from app.search import predicate

CONTRACT = json.loads((REPO_ROOT / "data" / "predicate_conformance.json").read_text())


def test_contract_covers_every_operator_implemented():
    covered = {c["predicate"]["op"] for c in CONTRACT["cases"]}
    assert covered == set(predicate.OPS)


@pytest.mark.parametrize("case", CONTRACT["cases"],
                         ids=[c["why"] for c in CONTRACT["cases"]])
def test_conformance(case):
    assert predicate.holds(case["row"], case["predicate"]) is case["holds"]


def test_predicates_narrow_rather_than_widen():
    rows = [{"esi": 2, "waited_min": 40}, {"esi": 2, "waited_min": 5}]
    got = predicate.select(rows, {"predicates": [
        {"field": "esi", "op": "eq", "value": 2},
        {"field": "waited_min", "op": "gt", "value": 30}]})
    assert got == [rows[0]]


def test_free_text_searches_name_record_and_complaint():
    rows = [{"patient_id": "P1", "display_name": "R. Castillo",
             "chief_complaint": "abdominal pain"},
            {"patient_id": "P2", "display_name": "C. Duval",
             "chief_complaint": "itchy rash"}]
    assert predicate.select(rows, {"text": "castillo"}) == [rows[0]]
    assert predicate.select(rows, {"text": "rash"}) == [rows[1]]
    assert predicate.select(rows, {"text": "P2"}) == [rows[1]]


def test_an_unknown_operator_is_refused_rather_than_ignored():
    with pytest.raises(ValueError):
        predicate.holds({"esi": 2}, {"field": "esi", "op": "roughly", "value": 2})


def test_a_mistyped_comparison_is_not_a_match():
    assert predicate.holds({"esi": "two"},
                           {"field": "esi", "op": "gt", "value": 1}) is False
