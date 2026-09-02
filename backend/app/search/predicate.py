"""Evaluating a cohort predicate against a board row.

This mirrors frontend/src/console/search/predicate.js. The console parses a
cohort question and filters the board it is showing; a pinned cohort is
re-evaluated here on the clock sweep. Two implementations of one rule set
drift, and a standing cohort that means one thing on screen and another in the
alert it raises is worse than no standing cohort at all.

data/predicate_conformance.json is the contract, and both test suites read it,
so changing either evaluator means changing the contract first.
"""

TEXT_FIELDS = ("display_name", "patient_id", "chief_complaint")


def _same(a, b) -> bool:
    """JavaScript `===` for the types JSON carries. Python would call 1 equal
    to True; the console would not, and the console is what the clinician
    confirmed the cohort against."""
    if isinstance(a, bool) != isinstance(b, bool):
        return False
    return a == b


OPS = {
    "gt": lambda v, want: v > want,
    "lt": lambda v, want: v < want,
    "gte": lambda v, want: v >= want,
    "lte": lambda v, want: v <= want,
    "eq": _same,
    "ne": lambda v, want: not _same(v, want),
    "in": lambda v, want: any(_same(v, x) for x in want),
    "is": _same,
    "nonempty": lambda v, want=None: isinstance(v, list) and len(v) > 0,
    "isnull": lambda v, want=None: v is None,
}


def holds(row: dict, predicate: dict) -> bool:
    """Whether one row satisfies one predicate.

    An absent value never satisfies a claim about its field, `isnull` excepted,
    being the one claim that is about absence. A row missing the key and a row
    carrying null are the same absence.
    """
    op = predicate["op"]
    if op not in OPS:
        raise ValueError(f"unknown predicate operator {op!r}")
    value = row.get(predicate["field"])
    if value is None and op != "isnull":
        return False
    try:
        return bool(OPS[op](value, predicate.get("value")))
    except TypeError:
        # Comparing a string to a number is not a match, it is a mistyped
        # cohort. Reporting it as a match would be the worse answer.
        return False


def select(rows, query: dict) -> list:
    predicates = query.get("predicates") or []
    needle = (query.get("text") or "").strip().lower()
    return [
        row for row in rows or []
        if all(holds(row, p) for p in predicates)
        and (not needle or any(
            isinstance(row.get(f), str) and needle in row[f].lower()
            for f in TEXT_FIELDS))
    ]
