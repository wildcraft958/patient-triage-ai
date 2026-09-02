from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.auth import require
from app.models import PatientIntake, Vitals
from app.service import (
    CALIBRATION_PATH,
    NoStandingAlert,
    TriageService,
    UnacknowledgedDowngrade,
)

router = APIRouter()

_service: TriageService | None = None


def get_service() -> TriageService:
    global _service
    if _service is None:
        _service = TriageService(calibration_path=CALIBRATION_PATH)
    return _service


def reset_service(**kwargs) -> TriageService:
    global _service, _player
    _service = TriageService(**kwargs)
    _player = None
    return _service


class OverrideBody(BaseModel):
    new_esi: int = Field(ge=1, le=5)
    clinician_id: str = Field(min_length=1)
    reason: str = Field(min_length=3)
    acknowledge_risk: bool = False


class ClinicianBody(BaseModel):
    clinician_id: str = Field(min_length=1)


class ClockBody(BaseModel):
    minutes: float = Field(gt=0, le=24 * 60)


class SurgeBody(BaseModel):
    forced: bool | None  # true/false to force, null to return to automatic


def _require(patient_id: str) -> None:
    if patient_id not in get_service().room.entries:
        raise HTTPException(404, f"unknown patient {patient_id}")


@router.post("/patients")
def arrive(intake: PatientIntake):
    svc = get_service()
    if intake.patient_id in svc.room.entries:
        raise HTTPException(409, f"{intake.patient_id} already triaged")
    fused = svc.arrive(intake)
    return {"fused": fused, "state": svc.state_view()}


@router.post("/patients/{patient_id}/vitals")
def record_vitals(patient_id: str, vitals: Vitals, source: str = "nurse",
                  clinician_id: str | None = None):
    """source: nurse spot-check, wearable stream, or kiosk self-report - the
    three observation channels that update the acuity belief. The channel says
    how the reading arrived; clinician_id says who took it, and a staff
    spot-check should carry both."""
    _require(patient_id)
    if source not in ("nurse", "wearable", "kiosk"):
        raise HTTPException(422, f"unknown vitals source '{source}'")
    # A reading can arrive with nobody at the bedside (wearable, kiosk, the
    # replayed timeline), so the badge is authorised only when one is claimed.
    if clinician_id is not None:
        require(clinician_id, "vitals")
    result = get_service().record_vitals(patient_id, vitals, source=source,
                                         clinician_id=clinician_id)
    return {"alert": result["alert"], "retriaged": result["retriaged"]}


@router.post("/patients/{patient_id}/override")
def override(patient_id: str, body: OverrideBody):
    _require(patient_id)
    require(body.clinician_id, "override")
    try:
        return get_service().override(
            patient_id, body.new_esi, body.clinician_id, body.reason,
            acknowledge_risk=body.acknowledge_risk,
        )
    except UnacknowledgedDowngrade as e:
        raise HTTPException(422, str(e))


@router.post("/patients/{patient_id}/accept")
def accept(patient_id: str, body: ClinicianBody):
    _require(patient_id)
    require(body.clinician_id, "accept")
    return {"reward": get_service().accept(patient_id, body.clinician_id)}


@router.post("/patients/{patient_id}/reassess")
def reassess(patient_id: str, body: ClinicianBody):
    """A bedside check with no new vitals: restarts the safe-wait clock and
    answers the standing alert. Recording vitals goes through /vitals."""
    _require(patient_id)
    require(body.clinician_id, "reassess")
    return get_service().reassess(patient_id, body.clinician_id)


@router.post("/patients/{patient_id}/acknowledge")
def acknowledge(patient_id: str, body: ClinicianBody):
    _require(patient_id)
    require(body.clinician_id, "acknowledge")
    try:
        return get_service().acknowledge_alert(patient_id, body.clinician_id)
    except NoStandingAlert as e:
        raise HTTPException(409, str(e))


@router.get("/queue")
def queue():
    svc = get_service()
    return {
        "queue": svc.queue_view(),
        "in_care": svc.in_care_view(),
        "state": svc.state_view(),
        "scenario_remaining": _player.remaining if _player is not None else None,
    }


@router.get("/audit")
def audit_recent(limit: int = 80):
    return {"events": get_service().audit.all_events()[-limit:]}


@router.post("/clock/advance")
def advance_clock(body: ClockBody):
    svc = get_service()
    alerts = svc.advance_clock(body.minutes)
    # A separate key from the alerts: a pinned question is a question, and the
    # console must not render one where a deterioration alert belongs.
    return {"alerts": alerts, "cohort_matches": svc.sweep_cohorts(),
            "state": svc.state_view()}


@router.post("/surge")
def surge(body: SurgeBody):
    get_service().surge_forced = body.forced
    return get_service().state_view()


class ScenarioBody(BaseModel):
    profile: str = "urban_500"
    speedup: float = Field(default=1.0, gt=0, le=10)
    use_llm: bool = True


_player = None


@router.post("/scenario/load")
def scenario_load(body: ScenarioBody):
    from app.scenario import ScenarioPlayer
    from app.service import CALIBRATION_PATH

    global _player
    svc = reset_service(profile_name=body.profile, calibration_path=CALIBRATION_PATH)
    _player = ScenarioPlayer(svc, speedup=body.speedup, use_llm=body.use_llm)
    return {"events": len(_player.events), "state": svc.state_view()}


@router.post("/scenario/step")
def scenario_step():
    if _player is None:
        raise HTTPException(400, "load a scenario first (POST /scenario/load)")
    result = _player.step()
    svc = get_service()
    result["state"] = svc.state_view()
    # An arrival is the most natural moment for a patient to enter a pinned
    # cohort, so the step sweeps too. Without this a match would wait for the
    # next clock advance, which on a paused board never comes.
    result["cohort_matches"] = svc.sweep_cohorts()
    return result


# Offline benchmark outputs, committed under eval/results. Named here so the
# console reads real result files rather than numbers typed into a slide.
BENCHMARKS = [
    ("ESI handbook cases", "test_1_test_2_test_3_sonnet.json", "Sonnet 5"),
    ("Competency cases", "practice_cases_competency_cases_sonnet.json", "Sonnet 5"),
]


@router.get("/benchmark")
def benchmark():
    """Held-out benchmark results, read from disk. Kept apart from /metrics:
    those are live numbers from the running shift, these are 276 scored cases
    from an offline run, and mixing the two would flatter both."""
    import json

    from app.config import REPO_ROOT

    out = []
    for label, filename, model in BENCHMARKS:
        path = REPO_ROOT / "eval" / "results" / filename
        if not path.exists():
            continue
        report = json.loads(path.read_text())["report"]
        out.append({"label": label, "model": model, "n": report["n"],
                    "sets": report["sets"], "configs": report["configs"]})
    return {"benchmarks": out}


@router.get("/system/registry")
def system_registry():
    """Every component in the pipeline, what it decides, what it is allowed
    to see, and how often it has run this shift."""
    from app.registry import snapshot
    return snapshot(get_service())


@router.get("/profile")
def profile():
    """The department configuration the monitor is actually reading. One YAML
    per hospital is the scalability claim, so the console shows the file."""
    return get_service().profile.model_dump()


@router.get("/metrics")
def metrics():
    svc = get_service()
    return {
        "bias_by_age_band": svc.bias.snapshot(),
        "bias_alerts": svc.bias.alerts(),
        "latency": svc.latency_stats(),
        "audit": svc.audit.stats(),
        "calibration_cells": svc.calibration.cells,
        "state": svc.state_view(),
    }


class PinCohort(BaseModel):
    label: str
    query: dict


@router.post("/search/standing")
def pin_cohort(body: PinCohort):
    """Leave a cohort question running. It announces a patient the moment they
    fall into it, and it moves nobody's acuity level."""
    svc = get_service()
    try:
        return svc.cohorts.pin(body.label, body.query,
                               [*svc.queue_view(), *svc.in_care_view()])
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.get("/search/standing")
def list_cohorts():
    return {"cohorts": get_service().cohorts.all()}


@router.delete("/search/standing/{cohort_id}")
def unpin_cohort(cohort_id: str):
    if not get_service().cohorts.unpin(cohort_id):
        raise HTTPException(404, f"no cohort pinned as {cohort_id}")
    return {"unpinned": cohort_id}


@router.get("/search/audit")
def audit_search(request: Request):
    """Governance questions over the append-only trail. Filter names are a
    closed set: an unknown one is refused rather than ignored, because an
    unfiltered answer that looks filtered is the failure that matters when
    someone is counting overrides."""
    from app.search import audit_query
    try:
        kwargs = audit_query.parse_query(dict(request.query_params))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return audit_query.search(get_service().audit, **kwargs)


@router.get("/search/similar/{patient_id}")
def similar_cases(patient_id: str, limit: int = Query(5, ge=1, le=20)):
    """Prior cases whose complaint looks like this one, and what each turned
    out to be. Runs entirely on this machine: the embedding is the classifier's
    own local encoder, and the reasoning path is not involved."""
    _require(patient_id)
    from app.search import similar
    return similar.find(get_service().room.entries[patient_id].intake, limit=limit)


@router.get("/patients/{patient_id}/fhir")
def fhir_export(patient_id: str):
    from app.fhir import triage_bundle
    _require(patient_id)
    svc = get_service()
    return triage_bundle(svc.room.entries[patient_id], svc.clock.now_min)


@router.get("/patients/{patient_id}/audit")
def audit_trail(patient_id: str):
    _require(patient_id)
    return {"events": get_service().audit.events_for(patient_id)}


@router.get("/patients/{patient_id}")
def patient_detail(patient_id: str):
    _require(patient_id)
    svc = get_service()
    e = svc.room.entries[patient_id]
    from app.engine.icd10 import code_for
    from app.engine.thresholds import vital_limits
    return {
        "intake": e.intake,
        "fused": e.fused,
        "status": e.status,
        "decided_by": e.decided_by,
        "waited_min": round(svc.clock.now_min - e.last_assessed_min, 1),
        "in_ed_min": round(svc.clock.now_min - e.triaged_at_min, 1),
        "alerts": e.alerts,
        "belief": [round(p, 3) for p in e.belief],
        "pipeline": e.pipeline,
        "icd10": code_for(e.intake.complaint_category),
        "vitals_history": [
            {"at_min": t, "vitals": v} for t, v in e.vitals_history
        ],
        "vital_limits": vital_limits(e.intake),
    }
