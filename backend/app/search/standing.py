"""Pinned cohorts: a search that keeps watching.

The rest of this system exists because triage is a snapshot and nobody looks
again. Search had the same shape: you ask, you get an answer, the answer goes
stale the moment the clock moves. A pinned cohort is the same question left
running, re-evaluated on the sweep that already walks the board every tick,
and it announces a patient the moment they fall into it.

Two decisions worth stating.

A match is never appended to a patient's alert list. The board renders a
patient's most recent alert, so a cohort match sitting there would mask a
deterioration alert behind a query someone pinned this morning. Matches are a
separate channel from end to end, and they carry no re-triage: a pinned
question is a question, and it must not move an acuity level.

A pin seeds itself with whoever already matches, and announces nobody for
them. A pin is a tripwire, so the interesting event is someone new falling in;
announcing the state that was on screen as it was pinned would be a burst of
notifications about the patients the nurse was looking at while pinning. The
pin response names the current members, so nothing is hidden either way.
"""

from uuid import uuid4

from app.search.predicate import holds, select


class StandingCohorts:
    MAX_PINNED = 8

    def __init__(self):
        self._cohorts: dict[str, dict] = {}

    def pin(self, label: str, query: dict, rows) -> dict:
        label = (label or "").strip()
        if not label:
            raise ValueError("a pinned cohort needs a label someone can read")
        predicates = query.get("predicates") or []
        if not predicates and not (query.get("text") or "").strip():
            raise ValueError("a pinned cohort needs at least one filter")
        if len(self._cohorts) >= self.MAX_PINNED:
            raise ValueError(f"at most {self.MAX_PINNED} cohorts can be pinned at once")
        # Refuse a query that cannot be evaluated now, rather than raising on
        # every sweep from here on, where it would surface as the monitor
        # falling over rather than as a bad pin.
        probe = {"patient_id": "__probe__"}
        for predicate in predicates:
            holds(probe, predicate)

        cohort_id = uuid4().hex[:8]
        self._cohorts[cohort_id] = {
            "id": cohort_id, "label": label, "query": query,
            "matched": self._matching(query, rows),
        }
        return self._view(self._cohorts[cohort_id])

    def unpin(self, cohort_id: str) -> bool:
        return self._cohorts.pop(cohort_id, None) is not None

    def all(self) -> list[dict]:
        return [self._view(c) for c in self._cohorts.values()]

    def sweep(self, rows, now_min: float) -> list[dict]:
        """Patients who have entered a pinned cohort since the last sweep."""
        entered = []
        for cohort in self._cohorts.values():
            matching = self._matching(cohort["query"], rows)
            for patient_id in sorted(matching - cohort["matched"]):
                entered.append({
                    "cohort_id": cohort["id"], "label": cohort["label"],
                    "patient_id": patient_id, "at_min": round(now_min, 1),
                })
            cohort["matched"] = matching
        return entered

    @staticmethod
    def _matching(query: dict, rows) -> set[str]:
        return {row["patient_id"] for row in select(rows, query)}

    @staticmethod
    def _view(cohort: dict) -> dict:
        return {"id": cohort["id"], "label": cohort["label"],
                "query": cohort["query"], "members": sorted(cohort["matched"])}
