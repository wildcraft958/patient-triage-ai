"""Pinned cohorts, re-evaluated on the clock sweep.

The board renders a patient's most recent alert, so a cohort match must never
be appended to a patient's alert list: it would mask a deterioration alert
behind a query someone pinned. Matches are a separate channel throughout.
"""

import pytest

from app.search.standing import StandingCohorts

KIDS_OVERDUE = {"predicates": [{"field": "age_years", "op": "lt", "value": 18},
                               {"field": "waited_min", "op": "gt", "value": 20}]}


def row(pid, age, waited):
    return {"patient_id": pid, "display_name": pid, "age_years": age,
            "waited_min": waited}


def test_pinning_reports_who_is_already_in_the_cohort():
    c = StandingCohorts()
    pinned = c.pin("Kids waiting", KIDS_OVERDUE, [row("A", 8, 40), row("B", 44, 40)])
    assert pinned["label"] == "Kids waiting"
    assert pinned["members"] == ["A"]
    assert pinned["id"]


# A pin is a tripwire: tell me when someone new falls in. Alerting for the
# state that was already on screen when it was pinned would be a burst of
# notifications about patients the nurse was looking at as they pinned it, and
# the pin response already names them, so nothing is hidden either way.
def test_the_first_sweep_does_not_re_announce_who_was_already_there():
    c = StandingCohorts()
    rows = [row("A", 8, 40)]
    c.pin("Kids waiting", KIDS_OVERDUE, rows)
    assert c.sweep(rows, now_min=10) == []


def test_a_patient_newly_entering_is_announced_once():
    c = StandingCohorts()
    c.pin("Kids waiting", KIDS_OVERDUE, [])
    entered = c.sweep([row("A", 8, 40)], now_min=25)
    assert [e["patient_id"] for e in entered] == ["A"]
    assert entered[0]["label"] == "Kids waiting"
    assert entered[0]["at_min"] == 25


def test_it_is_not_announced_again_on_the_next_sweep():
    c = StandingCohorts()
    c.pin("Kids waiting", KIDS_OVERDUE, [])
    rows = [row("A", 8, 40)]
    assert len(c.sweep(rows, now_min=25)) == 1
    assert c.sweep(rows, now_min=26) == []
    assert c.sweep(rows, now_min=40) == []


def test_a_patient_who_leaves_and_returns_is_announced_again():
    c = StandingCohorts()
    c.pin("Kids waiting", KIDS_OVERDUE, [])
    assert len(c.sweep([row("A", 8, 40)], now_min=25)) == 1
    assert c.sweep([row("A", 8, 2)], now_min=30) == []      # reassessed, clock reset
    assert len(c.sweep([row("A", 8, 40)], now_min=60)) == 1  # overdue again


def test_a_patient_who_leaves_the_board_stops_being_a_member():
    c = StandingCohorts()
    c.pin("Kids waiting", KIDS_OVERDUE, [row("A", 8, 40)])
    c.sweep([], now_min=30)
    assert c.all()[0]["members"] == []


def test_cohorts_are_independent():
    c = StandingCohorts()
    c.pin("Kids", {"predicates": [{"field": "age_years", "op": "lt", "value": 18}]}, [])
    c.pin("Overdue", {"predicates": [{"field": "waited_min", "op": "gt", "value": 20}]}, [])
    entered = c.sweep([row("A", 8, 40)], now_min=25)
    assert sorted(e["label"] for e in entered) == ["Kids", "Overdue"]


def test_unpinning_stops_it_sweeping():
    c = StandingCohorts()
    pinned = c.pin("Kids waiting", KIDS_OVERDUE, [])
    assert c.unpin(pinned["id"]) is True
    assert c.all() == []
    assert c.sweep([row("A", 8, 40)], now_min=25) == []
    assert c.unpin(pinned["id"]) is False


def test_a_cohort_needs_a_filter_to_be_a_cohort():
    c = StandingCohorts()
    with pytest.raises(ValueError):
        c.pin("Everything", {"predicates": [], "text": ""}, [])


def test_a_cohort_needs_a_label_someone_can_read():
    c = StandingCohorts()
    with pytest.raises(ValueError):
        c.pin("   ", KIDS_OVERDUE, [])


def test_an_unknown_operator_is_refused_at_pin_time():
    """Better to refuse the pin than to raise on every clock sweep from then
    on, where the failure would surface as the monitor falling over."""
    c = StandingCohorts()
    with pytest.raises(ValueError):
        c.pin("Bad", {"predicates": [{"field": "esi", "op": "roughly", "value": 2}]}, [])


def test_there_is_a_ceiling_on_how_many_can_be_pinned():
    c = StandingCohorts()
    for i in range(StandingCohorts.MAX_PINNED):
        c.pin(f"c{i}", KIDS_OVERDUE, [])
    with pytest.raises(ValueError):
        c.pin("one too many", KIDS_OVERDUE, [])
