from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.models import PatientIntake, Vitals
from app.service import CALIBRATION_PATH, TriageService, UnacknowledgedDowngrade

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
def record_vitals(patient_id: str, vitals: Vitals):
    _require(patient_id)
    result = get_service().record_vitals(patient_id, vitals)
    return {"alert": result["alert"], "retriaged": result["retriaged"]}


@router.post("/patients/{patient_id}/override")
def override(patient_id: str, body: OverrideBody):
    _require(patient_id)
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
    return {"reward": get_service().accept(patient_id, body.clinician_id)}


@router.get("/queue")
def queue():
    svc = get_service()
    return {
        "queue": svc.queue_view(),
        "state": svc.state_view(),
        "scenario_remaining": _player.remaining if _player is not None else None,
    }


@router.get("/audit")
def audit_recent(limit: int = 80):
    return {"events": get_service().audit.all_events()[-limit:]}


@router.post("/clock/advance")
def advance_clock(body: ClockBody):
    alerts = get_service().advance_clock(body.minutes)
    return {"alerts": alerts, "state": get_service().state_view()}


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
    result["state"] = get_service().state_view()
    return result


@router.get("/metrics")
def metrics():
    svc = get_service()
    return {
        "bias_by_age_band": svc.bias.snapshot(),
        "calibration_cells": svc.calibration.cells,
        "state": svc.state_view(),
    }


@router.get("/patients/{patient_id}/audit")
def audit_trail(patient_id: str):
    _require(patient_id)
    return {"events": get_service().audit.events_for(patient_id)}


@router.get("/patients/{patient_id}")
def patient_detail(patient_id: str):
    _require(patient_id)
    svc = get_service()
    e = svc.room.entries[patient_id]
    return {
        "intake": e.intake,
        "fused": e.fused,
        "status": e.status,
        "waited_min": round(svc.clock.now_min - e.last_assessed_min, 1),
        "alerts": e.alerts,
        "vitals_history": [
            {"at_min": t, "vitals": v} for t, v in e.vitals_history
        ],
    }
