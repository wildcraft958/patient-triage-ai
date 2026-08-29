"""API-level flows: arrival, monitoring, override, learning, surge - 
using a fake LLM transport so no API calls happen."""

import json

import pytest
from fastapi.testclient import TestClient

from app import api
from app.main import app

client = TestClient(app)


def fake_transport(system: str, user: str) -> str:
    # agrees with whatever the rules say often enough for tests: fixed ESI-3
    return json.dumps({"esi": 3, "confidence": 0.9, "reasoning": ["fake"]})


@pytest.fixture(autouse=True)
def fresh_service():
    api.reset_service(profile_name="urban_500", audit_path=":memory:",
                      transport=fake_transport)


def patient(pid: str = "P1", **kw) -> dict:
    body = {
        "patient_id": pid, "age_years": 45,
        "chief_complaint": "abdominal pain for two days",
        "complaint_category": "abdominal_pain",
        "vitals": {"hr": 88, "rr": 16, "spo2": 98, "temp_c": 37.2, "sbp": 125, "pain": 5},
    }
    body.update(kw)
    return body


def test_arrival_returns_scored_recommendation():
    r = client.post("/patients", json=patient())
    assert r.status_code == 200
    fused = r.json()["fused"]
    assert fused["esi"] == 3 and fused["confidence"] == "high"
    assert fused["route"]


def test_wait_breach_alert_after_clock_advance():
    client.post("/patients", json=patient())
    r = client.post("/clock/advance", json={"minutes": 35})  # ESI-3 limit is 30
    alerts = r.json()["alerts"]
    assert len(alerts) == 1 and alerts[0]["kind"] == "WAIT_BREACH"


def test_deterioration_triggers_retriage_and_audit():
    client.post("/patients", json=patient())
    client.post("/clock/advance", json={"minutes": 20})
    r = client.post("/patients/P1/vitals", json={
        "hr": 118, "rr": 24, "spo2": 91, "temp_c": 38.9, "sbp": 95, "pain": 6,
    })
    body = r.json()
    assert body["alert"]["kind"] == "DETERIORATION"
    assert body["retriaged"]["esi"] == 2  # danger-zone vitals uptriage
    events = client.get("/patients/P1/audit").json()["events"]
    assert [e["event_type"] for e in events] == ["triage", "alert", "reassessment"]


def test_override_requires_reason():
    client.post("/patients", json=patient())
    r = client.post("/patients/P1/override",
                    json={"new_esi": 2, "clinician_id": "RN-07", "reason": ""})
    assert r.status_code == 422
    r = client.post("/patients/P1/override",
                    json={"new_esi": 2, "clinician_id": "RN-07",
                          "reason": "looks septic to me"})
    assert r.status_code == 200
    assert r.json()["reward"] == -1.0 and r.json()["under_triage"] is True


def test_dangerous_downgrade_requires_acknowledgment():
    client.post("/patients", json=patient(
        "P1", age_years=61, complaint_category="chest_pain",
        chief_complaint="chest pain radiating to left arm"))  # fused ESI-2, red-flagged
    body = {"new_esi": 4, "clinician_id": "RN-07",
            "reason": "pain reproducible on palpation, ECG normal"}
    r = client.post("/patients/P1/override", json=body)
    assert r.status_code == 422
    assert "acknowledge" in str(r.json()["detail"]).lower()
    r = client.post("/patients/P1/override", json={**body, "acknowledge_risk": True})
    assert r.status_code == 200
    assert r.json()["safety_warning"]
    events = client.get("/patients/P1/audit").json()["events"]
    assert "override_safety_flag" in [e["event_type"] for e in events]


def test_small_downgrade_needs_no_acknowledgment():
    client.post("/patients", json=patient())  # fused ESI-3, no red flags
    r = client.post("/patients/P1/override",
                    json={"new_esi": 4, "clinician_id": "RN-07",
                          "reason": "stable, low suspicion"})
    assert r.status_code == 200
    assert r.json()["safety_warning"] is None


def test_two_overrides_teach_the_system_to_escalate():
    for pid in ["P1", "P2"]:
        client.post("/patients", json=patient(pid))
        client.post(f"/patients/{pid}/override",
                    json={"new_esi": 2, "clinician_id": "RN-07",
                          "reason": "deteriorating faster than score suggests"})
    # third similar patient: calibration now escalates at triage time
    r = client.post("/patients", json=patient("P3"))
    fused = r.json()["fused"]
    assert fused["esi"] == 2
    assert any("calibration" in n.lower() for n in fused["notes"])


def test_accept_moves_to_treatment_and_rewards():
    client.post("/patients", json=patient())
    r = client.post("/patients/P1/accept", json={"clinician_id": "RN-07"})
    assert r.json()["reward"] == 1.0
    assert client.get("/queue").json()["queue"] == []


def test_forced_surge_switches_to_rules_only():
    client.post("/surge", json={"forced": True})
    r = client.post("/patients", json=patient())
    fused = r.json()["fused"]
    assert fused["llm"] is None
    assert any("Rules-only" in n for n in fused["notes"])
    client.post("/surge", json={"forced": None})


def test_unknown_patient_404s():
    assert client.get("/patients/GHOST/audit").status_code == 404


def test_fhir_bundle_export():
    client.post("/patients", json=patient())
    bundle = client.get("/patients/P1/fhir").json()
    assert bundle["resourceType"] == "Bundle"
    resources = [e["resource"] for e in bundle["entry"]]
    types = [r["resourceType"] for r in resources]
    assert types.count("Patient") == 1
    assert types.count("RiskAssessment") == 1 and types.count("Provenance") == 1
    obs = [r for r in resources if r["resourceType"] == "Observation"]
    assert len(obs) == 6  # one per recorded vital
    assert all(o["code"]["coding"][0]["system"] == "http://loinc.org" for o in obs)
    risk = next(r for r in resources if r["resourceType"] == "RiskAssessment")
    probs = [p["probabilityDecimal"] for p in risk["prediction"]]
    assert len(probs) == 5 and abs(sum(probs) - 1.0) < 0.01


def test_fhir_export_stays_de_identified_for_a_named_patient():
    """Two boundaries, both closed: the reasoning path never sees the name
    (test_graph) and neither does the EHR bundle. The name lives only in the
    local queue view the clinician is looking at."""
    client.post("/patients", json=patient(display_name="M. Chen"))
    bundle = client.get("/patients/P1/fhir").json()
    assert "Chen" not in json.dumps(bundle)


def test_queue_rows_carry_action_and_icd10_and_detail_carries_belief():
    client.post("/patients", json=patient())
    row = client.get("/queue").json()["queue"][0]
    assert row["action"] in ("Monitor", "REASSESS NOW")
    assert row["icd10"]["code"] == "R10.9"
    detail = client.get("/patients/P1").json()
    assert len(detail["belief"]) == 5
    assert abs(sum(detail["belief"]) - 1.0) < 0.01


def test_queue_rows_carry_the_board_columns():
    """Everything the shift board renders per row comes from one call: name,
    the latest vitals, the trend the monitor would alert on, the standing
    alert text, and the belief peak the acuity column shows."""
    client.post("/patients", json=patient(display_name="M. Chen"))
    row = client.get("/queue").json()["queue"][0]
    assert row["display_name"] == "M. Chen"
    assert row["vitals_latest"]["hr"] == 88
    assert row["vitals_worsening"] == []
    assert row["alert"] is None
    peak = row["belief_peak"]
    assert peak["esi"] == 3 and 0 < peak["p"] <= 1


def test_a_deteriorating_row_carries_its_trend_and_alert_text():
    client.post("/patients", json=patient())
    client.post("/patients/P1/vitals", json={
        "hr": 118, "rr": 24, "spo2": 91, "temp_c": 38.9, "sbp": 95, "pain": 6})
    row = client.get("/queue").json()["queue"][0]
    assert row["vitals_worsening"][0].startswith("HR 88 -> 118")
    assert "immediate reassessment" in row["alert"]


def test_patients_in_care_are_listed_beside_the_waiting_queue():
    """in_care is a sibling key, never folded into queue: the waiting count
    and the surge threshold both read the queue itself."""
    client.post("/patients", json=patient(display_name="M. Chen"))
    client.post("/patients/P1/accept", json={"clinician_id": "RN-07"})
    body = client.get("/queue").json()
    assert body["queue"] == []
    assert body["state"]["waiting"] == 0
    assert [r["patient_id"] for r in body["in_care"]] == ["P1"]
    assert body["in_care"][0]["display_name"] == "M. Chen"
    assert body["in_care"][0]["action"] is None


def test_vitals_source_channels_are_recorded():
    client.post("/patients", json=patient())
    r = client.post("/patients/P1/vitals?source=wearable", json={
        "hr": 118, "rr": 24, "spo2": 91, "temp_c": 38.9, "sbp": 95, "pain": 6})
    assert r.status_code == 200
    events = client.get("/patients/P1/audit").json()["events"]
    alert = next(e for e in events if e["event_type"] == "alert")
    assert alert["payload"]["source"] == "wearable"
    assert client.post("/patients/P1/vitals?source=telepathy", json={"hr": 90}
                       ).status_code == 422


def test_metrics_expose_pipeline_latency_and_bias_alerts():
    client.post("/patients", json=patient())
    m = client.get("/metrics").json()
    assert m["latency"]["n"] == 1
    assert m["latency"]["p50_ms"] >= 0 and m["latency"]["p95_ms"] >= m["latency"]["p50_ms"]
    assert m["bias_alerts"] == []


def test_metrics_audit_stats_aggregate_clinician_decisions():
    client.post("/patients", json=patient("P1"))
    client.post("/patients/P1/accept", json={"clinician_id": "RN-07"})
    client.post("/patients", json=patient("P2"))
    client.post("/patients/P2/override",
                json={"new_esi": 2, "clinician_id": "RN-07",
                      "reason": "worse than it looks"})
    audit = client.get("/metrics").json()["audit"]
    assert audit["events_by_type"]["triage"] == 2
    assert audit["override_rate_pct"] == 50.0
    assert audit["overrides_toward_more_acute"] == 1
    assert audit["mean_triage_latency_ms"] >= 0
    axes = audit["reward_axis_means"]
    assert axes["safety"] < 0  # the under-triage override registered on the safety axis
    assert set(axes) == {"diagnostic_accuracy", "management_quality",
                         "communication", "documentation", "safety"}


def test_unrecognized_category_string_is_normalized():
    """An integration typo in the category field must never silently
    degrade a patient: the intake classifier reroutes it."""
    r = client.post("/patients", json=patient(
        chief_complaint="crushing chest pressure and sweating",
        complaint_category="cardiac-ish"))
    fused = r.json()["fused"]
    assert any("auto-categorized as chest_pain" in n for n in fused["notes"])
    assert fused["esi"] == 2  # age 45 chest pain: high-risk ACS rule


def test_uncategorized_arrival_is_auto_classified():
    """The intake NLP runs on live arrivals: no dropdown category needed."""
    r = client.post("/patients", json=patient(
        chief_complaint="28 weeks pregnant, sudden severe headache, vomited twice",
        complaint_category="other",
        vitals={"hr": 96, "rr": 18, "spo2": 98, "temp_c": 37.0, "sbp": 150, "pain": 7}))
    fused = r.json()["fused"]
    assert fused["esi"] == 2  # pregnancy complication is always high risk
    assert any("auto-categorized" in n for n in fused["notes"])
    row = [q for q in client.get("/queue").json()["queue"]
           if q["patient_id"] == "P1"][0]
    assert row["category"] == "pregnancy_complication"
    assert row["icd10"]["code"] == "O26.90"


# --- the two alert-band actions: both are real, both are logged ---

def test_reassess_answers_the_alert_and_resets_the_wait_clock():
    """A nurse laying eyes on a patient is an assessment even when no new
    vitals are taken: it resets the safe-wait clock, clears the standing
    alert, and is recorded with who did it."""
    client.post("/patients", json=patient())
    client.post("/clock/advance", json={"minutes": 45})  # ESI-3 limit is 30
    row = client.get("/queue").json()["queue"][0]
    assert row["status"] == "reassess_due" and "safe wait limit" in row["alert"]

    r = client.post("/patients/P1/reassess", json={"clinician_id": "RN-07"})
    assert r.json()["status"] == "waiting"
    row = client.get("/queue").json()["queue"][0]
    assert row["waited_min"] == 0.0 and row["alert_acknowledged"]

    check = next(e for e in client.get("/patients/P1/audit").json()["events"]
                 if e["event_type"] == "reassessment_check")
    assert check["payload"]["clinician_id"] == "RN-07"
    assert check["payload"]["waited_min"] == 45.0


def test_acknowledging_an_alert_is_logged_and_changes_nothing_clinical():
    client.post("/patients", json=patient())
    client.post("/clock/advance", json={"minutes": 45})
    before = client.get("/patients/P1").json()

    client.post("/patients/P1/acknowledge", json={"clinician_id": "RN-07"})
    after = client.get("/patients/P1").json()
    row = client.get("/queue").json()["queue"][0]
    # seen, not answered: the alert leaves the band, the patient keeps both
    # the level and the overdue status until someone actually assesses them
    assert row["alert_acknowledged"] and row["status"] == "reassess_due"
    assert after["fused"]["esi"] == before["fused"]["esi"]
    assert after["waited_min"] == before["waited_min"]

    ack = next(e for e in client.get("/patients/P1/audit").json()["events"]
               if e["event_type"] == "alert_ack")
    assert ack["payload"]["clinician_id"] == "RN-07"
    assert ack["payload"]["kind"] == "WAIT_BREACH"


def test_acknowledging_with_no_standing_alert_is_rejected():
    client.post("/patients", json=patient())
    r = client.post("/patients/P1/acknowledge", json={"clinician_id": "RN-07"})
    assert r.status_code == 409


# --- surge deferred enrichment: Path B is queued, not dropped ---

def test_surge_arrival_queues_enrichment_and_next_tick_attaches_llm():
    client.post("/surge", json={"forced": True})
    r = client.post("/patients", json=patient())
    assert r.json()["fused"]["llm"] is None
    assert client.get("/queue").json()["state"]["pending_enrichment"] == 1
    client.post("/surge", json={"forced": None})
    client.post("/clock/advance", json={"minutes": 1})
    assert client.get("/queue").json()["state"]["pending_enrichment"] == 0
    detail = client.get("/patients/P1").json()
    assert detail["fused"]["llm"] is not None
    events = client.get("/patients/P1/audit").json()["events"]
    assert "surge_enrichment" in [e["event_type"] for e in events]


def test_enrichment_never_overwrites_clinician_decision():
    """A clinician decision made while Path B was queued must stand: the
    drained enrichment becomes advisory (note + flag), never a rescore."""
    api.reset_service(
        profile_name="urban_500", audit_path=":memory:",
        transport=lambda s, u: json.dumps(
            {"esi": 1, "confidence": 0.9, "reasoning": ["peri-arrest picture"]}))
    client.post("/surge", json={"forced": True})
    client.post("/patients", json=patient(
        "P1", age_years=61, complaint_category="chest_pain",
        chief_complaint="chest pain radiating to left arm"))  # rules ESI-2
    client.post("/surge", json={"forced": None})
    r = client.post("/patients/P1/override", json={
        "new_esi": 4, "clinician_id": "RN-07",
        "reason": "pain reproducible on palpation, ECG normal",
        "acknowledge_risk": True})
    assert r.status_code == 200
    client.post("/clock/advance", json={"minutes": 1})
    fused = client.get("/patients/P1").json()["fused"]
    assert fused["esi"] == 4  # the clinician's level stands
    assert any("Clinician override to ESI-4" in n for n in fused["notes"])
    assert any("clinician decision ESI-4" in n for n in fused["notes"])
    assert fused["clinician_flag"] is True  # more-acute LLM view is surfaced
    events = client.get("/patients/P1/audit").json()["events"]
    enrich = [e["payload"] for e in events if e["event_type"] == "surge_enrichment"]
    assert enrich and enrich[-1]["outcome"] == "clinician_decision_stands"
    assert enrich[-1]["llm_esi"] == 1 and enrich[-1]["clinician_esi"] == 4


def test_enrichment_preserves_the_arrival_note_trail():
    client.post("/surge", json={"forced": True})
    client.post("/patients", json=patient())
    client.post("/surge", json={"forced": None})
    client.post("/clock/advance", json={"minutes": 1})
    notes = client.get("/patients/P1").json()["fused"]["notes"]
    assert any("queued for deferred enrichment" in n for n in notes)


def test_enrichment_escalates_but_never_downgrades():
    api.reset_service(
        profile_name="urban_500", audit_path=":memory:",
        transport=lambda s, u: json.dumps(
            {"esi": 2, "confidence": 0.8, "reasoning": ["sicker than rules imply"]}))
    client.post("/surge", json={"forced": True})
    client.post("/patients", json=patient())  # rules say ESI-3
    client.post("/surge", json={"forced": None})
    client.post("/clock/advance", json={"minutes": 1})
    assert client.get("/patients/P1").json()["fused"]["esi"] == 2  # escalated

    api.reset_service(
        profile_name="urban_500", audit_path=":memory:",
        transport=lambda s, u: json.dumps(
            {"esi": 5, "confidence": 0.9, "reasoning": ["looks minor"]}))
    client.post("/surge", json={"forced": True})
    client.post("/patients", json=patient(
        "P2", age_years=61, complaint_category="chest_pain",
        chief_complaint="chest pain radiating to left arm"))  # rules say ESI-2
    client.post("/surge", json={"forced": None})
    client.post("/clock/advance", json={"minutes": 1})
    assert client.get("/patients/P2").json()["fused"]["esi"] == 2  # held
