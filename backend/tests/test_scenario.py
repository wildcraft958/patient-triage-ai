import json

import pytest
from fastapi.testclient import TestClient

from app import api
from app.main import app

client = TestClient(app)


def fake_transport(system: str, user: str) -> str:
    return json.dumps({"esi": 3, "confidence": 0.9, "reasoning": ["fake"]})


@pytest.fixture(autouse=True)
def fresh_service(monkeypatch):
    svc = api.reset_service(profile_name="urban_500", audit_path=":memory:",
                            transport=fake_transport)
    # scenario/load rebuilds the service; make that rebuild keep the fake transport
    monkeypatch.setattr(api, "reset_service",
                        lambda **kw: api.__dict__.__setitem__("_service", svc) or svc)
    yield


def test_step_requires_load():
    api._player = None
    assert client.post("/scenario/step").status_code == 400


def test_scenario_steps_through_all_events():
    r = client.post("/scenario/load", json={"speedup": 1.0})
    total = r.json()["events"]
    assert total >= 27  # 24 arrivals + at least 3 rechecks

    kinds = []
    for _ in range(total):
        step = client.post("/scenario/step").json()
        kinds.append(step["event"]["kind"])
    assert step["done"] is True
    assert kinds.count("arrive") == 24
    assert kinds.count("vitals") >= 2

    # SIM-007's worsening rechecks must have fired deterioration alerts
    events = client.get("/patients/SIM-007/audit").json()["events"]
    assert any(e["event_type"] == "alert" and e["payload"]["kind"] == "DETERIORATION"
               for e in events)

    extra = client.post("/scenario/step").json()
    assert extra["done"] is True and extra["event"] is None


# --- concurrency: the shared service serializes mutations ---

def test_concurrent_mutations_hold_invariants():
    """FastAPI runs sync handlers on a threadpool, so the shared service
    sees genuinely concurrent calls; mutations must serialize."""
    from concurrent.futures import ThreadPoolExecutor

    from app.models import PatientIntake, Vitals
    from app.service import TriageService

    svc = TriageService(profile_name="urban_500", audit_path=":memory:",
                        transport=fake_transport)

    def intake(i: int) -> PatientIntake:
        return PatientIntake(
            patient_id=f"C{i}", age_years=40,
            chief_complaint="abdominal pain for two days",
            complaint_category="abdominal_pain",
            vitals=Vitals(hr=88, rr=16, spo2=98, temp_c=37.0, sbp=120, pain=5))

    def op(i: int) -> bool:
        svc.arrive(intake(i))
        svc.advance_clock(1)
        svc.queue_view()
        if i % 3 == 0:
            svc.override(f"C{i}", 4, "RN-1", "stable, low suspicion")
        return True

    with ThreadPoolExecutor(max_workers=8) as ex:
        assert all(ex.map(op, range(24)))
    assert svc.state_view()["total_patients"] == 24
