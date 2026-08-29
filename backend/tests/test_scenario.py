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
    first_arrival = None
    for _ in range(total):
        step = client.post("/scenario/step").json()
        kinds.append(step["event"]["kind"])
        if first_arrival is None and step["event"]["kind"] == "arrive":
            first_arrival = step["event"]
    assert step["done"] is True
    assert kinds.count("arrive") == 24
    assert kinds.count("vitals") >= 2
    # arrivals announce the patient by name: the board and the activity feed
    # both lead with it, and the record ID follows alongside
    assert first_arrival["display_name"] == "M. Chen"

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

    # the Presidio/spaCy and embedding-model loads are one-time process
    # startup costs, not per-arrival ones: warm them outside the timing,
    # or this test measures them and fails whenever it runs first
    svc.arrive(intake(-1))

    import time
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=8) as ex:
        assert all(ex.map(op, range(24)))
    elapsed = time.perf_counter() - started
    assert svc.state_view()["total_patients"] == 25
    # the serialization ceiling: the busiest shipped profile (urban_500)
    # sees ~0.006 arrivals/second; the fully locked pipeline must clear a
    # floor orders of magnitude above that on any hardware
    assert 24 / elapsed >= 50, f"locked throughput {24 / elapsed:.0f}/s below floor"


# --- the demo must replay from the committed cache in BOTH environments ---

@pytest.mark.parametrize("spacy_model", ["en_core_web_lg", "en_core_web_sm"])
def test_every_curated_arrival_replays_from_the_committed_cache(spacy_model,
                                                                monkeypatch):
    """The benchmark runs the large spaCy model and the container runs the
    small one, so redaction has to agree across both: the prompt is the cache
    key, and a model that reads a drug name as a person silently costs those
    patients their reasoning path in the hosted demo. Any transport call here
    means a prompt drifted."""
    import app.agent.llm_path as lp
    from app.config import settings
    from app.data_io import load_curated_patients
    from app.privacy import redact as redact_module
    from app.service import CALIBRATION_PATH, TriageService

    spacy = pytest.importorskip("spacy")
    if not spacy.util.is_package(spacy_model):
        pytest.skip(f"{spacy_model} not installed")

    monkeypatch.setattr(settings, "spacy_model", spacy_model)
    redact_module._engines.cache_clear()
    monkeypatch.setattr(lp, "_default_transport", lambda s, u: (_ for _ in ()).throw(
        AssertionError("cache miss: the demo tried to call the model")))

    try:
        # a service of our own: the module fixture hands every caller a fake
        # transport, which would answer instead of the cache and make this
        # test pass without ever reading a cached prompt
        svc = TriageService(profile_name="urban_500", audit_path=":memory:",
                            calibration_path=CALIBRATION_PATH)
        without = [p.patient_id for p in load_curated_patients()
                   if svc.arrive(p, use_llm=True).llm is None]
        assert without == [], f"no cached reasoning under {spacy_model}: {without}"
    finally:
        redact_module._engines.cache_clear()
