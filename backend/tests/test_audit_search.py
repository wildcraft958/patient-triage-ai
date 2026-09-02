"""Governance search over the append-only audit trail.

Two properties matter more than the querying. Field names come from a closed
allowlist because a name cannot be bound as a SQL parameter, only a value can;
and a result that was cut short says so, because a truncated compliance answer
presented as complete is the same class of failure as a filter that silently
did not apply.
"""

import pytest

from app.audit.log import AuditLog, OverrideRecord
from app.search import audit_query


@pytest.fixture
def log():
    a = AuditLog(":memory:")
    a.log("triage", "P1", 1.0, {"esi": 2, "paths_agree": False,
                                "confidence": "low", "surge_mode": False})
    a.log("triage", "P2", 2.0, {"esi": 4, "paths_agree": True,
                                "confidence": "high", "surge_mode": False})
    a.log_override("P1", OverrideRecord(original_esi=2, new_esi=1,
                                        clinician_id="RN-07",
                                        reason="septic shock picture", sim_min=5.0))
    a.log_override("P2", OverrideRecord(original_esi=4, new_esi=3,
                                        clinician_id="RN-11",
                                        reason="looks worse than the score", sim_min=40.0))
    a.log("reward", "P1", 6.0, {"reward": 5.0, "under_triage": True})
    a.log("reward", "P2", 41.0, {"reward": -1.0, "under_triage": False})
    a.log("alert_ack", "P1", 7.0, {"clinician_id": "RN-07", "kind": "WAIT_BREACH"})
    return a


def ids(result):
    return [e["patient_id"] for e in result["events"]]


def test_finds_an_override_by_the_clinician_who_wrote_it(log):
    r = audit_query.search(log, filters={"event_type": "override",
                                         "clinician_id": "RN-07"})
    assert ids(r) == ["P1"]


def test_does_not_attribute_an_override_to_another_clinician(log):
    r = audit_query.search(log, filters={"event_type": "override",
                                         "clinician_id": "RN-11"})
    assert ids(r) == ["P2"]


def test_filters_by_event_type(log):
    assert len(audit_query.search(log, filters={"event_type": "triage"})["events"]) == 2
    assert len(audit_query.search(log, filters={"event_type": "reward"})["events"]) == 2


def test_filters_on_a_boolean_inside_the_payload(log):
    assert ids(audit_query.search(log, filters={"under_triage": True})) == ["P1"]
    assert ids(audit_query.search(log, filters={"paths_agree": False})) == ["P1"]


def test_filters_on_a_number_inside_the_payload(log):
    r = audit_query.search(log, filters={"event_type": "override", "new_esi": 1})
    assert ids(r) == ["P1"]


def test_filters_by_a_window_on_the_department_clock(log):
    r = audit_query.search(log, since_min=30, until_min=45)
    assert sorted({e["event_type"] for e in r["events"]}) == ["override", "reward"]
    assert all(30 <= e["sim_min"] <= 45 for e in r["events"])


def test_returns_events_newest_first(log):
    r = audit_query.search(log)
    order = [e["id"] for e in r["events"]]
    assert order == sorted(order, reverse=True)


# A field name cannot be bound as a SQL parameter, so it has to come from an
# allowlist. Accepting an arbitrary name is the injection.
def test_refuses_a_field_it_does_not_know(log):
    with pytest.raises(ValueError):
        audit_query.search(log, filters={"payload')); DROP TABLE events; --": "x"})


def test_refuses_a_field_it_does_not_know_rather_than_ignoring_it(log):
    """Silently dropping an unknown filter would answer a different question
    from the one asked, and return rows that look like they passed it."""
    with pytest.raises(ValueError):
        audit_query.search(log, filters={"clinician": "RN-07"})


def test_binds_a_value_containing_sql_as_a_literal(log):
    r = audit_query.search(log, filters={"clinician_id": "RN-07'; DROP TABLE events; --"})
    assert r["events"] == []
    # the table is still there and still holds everything
    assert len(audit_query.search(log)["events"]) == 7


def test_says_when_a_result_was_cut_short(log):
    r = audit_query.search(log, limit=3)
    assert len(r["events"]) == 3
    assert r["truncated"] is True
    assert audit_query.search(log, limit=50)["truncated"] is False


def test_returns_the_payload_it_matched_on(log):
    r = audit_query.search(log, filters={"event_type": "override",
                                         "clinician_id": "RN-07"})
    assert r["events"][0]["payload"]["reason"] == "septic shock picture"


def test_an_empty_trail_is_empty_rather_than_an_error():
    r = audit_query.search(AuditLog(":memory:"))
    assert r["events"] == [] and r["truncated"] is False


# Reading a query string. A framework ignores parameters it was not declared
# to expect, which would turn a typo in a compliance filter into an answer
# that looks filtered and is not.

def test_parse_query_reads_the_vocabulary():
    got = audit_query.parse_query({"event_type": "override", "new_esi": "1",
                                   "under_triage": "true", "since_min": "5",
                                   "limit": "10"})
    assert got == {"filters": {"event_type": "override", "new_esi": 1,
                               "under_triage": True},
                   "since_min": 5.0, "limit": 10}


def test_parse_query_refuses_a_name_outside_the_vocabulary():
    with pytest.raises(ValueError, match="clinician"):
        audit_query.parse_query({"clinician": "RN-07"})


def test_parse_query_refuses_a_limit_outside_the_range():
    for bad in ("0", "-1", "5000"):
        with pytest.raises(ValueError, match="limit"):
            audit_query.parse_query({"limit": bad})


def test_parse_query_refuses_a_boolean_that_is_not_one():
    with pytest.raises(ValueError, match="true or false"):
        audit_query.parse_query({"under_triage": "maybe"})


def test_parse_query_of_nothing_asks_for_everything():
    assert audit_query.parse_query({}) == {"filters": {}}
