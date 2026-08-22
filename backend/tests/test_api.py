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
