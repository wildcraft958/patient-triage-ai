"""Phase 3 monitor: priority ranking, wait-breach and deterioration triggers."""

from app.agent.fuse import FusedResult, LLMResult
from app.models import PatientIntake, RulesResult, Vitals
from app.monitor.priority import reassessment_priority
from app.monitor.waiting_room import SimClock, WaitingRoom
from app.profiles import load_profile


def fused(esi: int, agree: bool = True) -> FusedResult:
    # a disagreeing LLM says one level LESS acute, so the fused ESI stays at
    # `esi` (more-acute-wins) and only the uncertainty/flag state changes
    rules = RulesResult(esi=esi, reasons=["r"])
    llm = LLMResult(esi=esi if agree else min(5, esi + 1), confidence=0.9, reasoning=["l"])
    from app.agent.fuse import fuse
    return fuse(rules, llm)


def intake(pid: str = "P1", category: str = "abdominal_pain", **kw) -> PatientIntake:
    defaults = dict(
        patient_id=pid, age_years=45, chief_complaint="pain",
        complaint_category=category,
        vitals=Vitals(hr=90, rr=16, spo2=97, temp_c=37.0, sbp=120),
    )
    defaults.update(kw)
    return PatientIntake(**defaults)


URBAN = load_profile("urban_500")


# --- priority formula ---

def test_priority_grows_with_wait_time():
    e = {"intake": intake(), "fused": fused(3), "last_assessed_min": 0.0,
         "vitals_history": [(0.0, intake().vitals)]}
    early = reassessment_priority(e, now_min=10, profile=URBAN)
    late = reassessment_priority(e, now_min=40, profile=URBAN)
    assert late > early


def test_disagreement_raises_priority():
    base = {"intake": intake(), "last_assessed_min": 0.0,
            "vitals_history": [(0.0, intake().vitals)]}
    agreed = reassessment_priority({**base, "fused": fused(3, agree=True)}, 20, URBAN)
    flagged = reassessment_priority({**base, "fused": fused(3, agree=False)}, 20, URBAN)
    assert flagged > agreed


def test_worsening_trajectory_raises_priority():
    stable = {"intake": intake(), "fused": fused(3), "last_assessed_min": 0.0,
              "vitals_history": [(0.0, Vitals(hr=90, sbp=120, spo2=97, temp_c=37.0))]}
    worsening = {**stable, "vitals_history": [
        (0.0, Vitals(hr=90, sbp=120, spo2=97, temp_c=37.0)),
        (30.0, Vitals(hr=115, sbp=100, spo2=93, temp_c=38.4)),
    ]}
    assert reassessment_priority(worsening, 35, URBAN) > reassessment_priority(stable, 35, URBAN)


def test_higher_acuity_outranks_at_same_wait_fraction():
    base = {"intake": intake(), "last_assessed_min": 0.0,
            "vitals_history": [(0.0, intake().vitals)]}
    # ESI-2 at half its 10-min budget vs ESI-4 at half its 60-min budget
    esi2 = reassessment_priority({**base, "fused": fused(2)}, 5, URBAN)
    esi4 = reassessment_priority({**base, "fused": fused(4)}, 30, URBAN)
    assert esi2 > esi4


# --- waiting room triggers ---

def make_room(profile_name: str = "urban_500") -> tuple[WaitingRoom, SimClock]:
    clock = SimClock()
    return WaitingRoom(profile=load_profile(profile_name), clock=clock), clock


def test_wait_breach_fires_at_profile_limit():
    room, clock = make_room("urban_500")
    room.add(intake("P1"), fused(3))
    clock.advance(20)
    assert room.tick() == []
    clock.advance(15)  # 35 min > urban ESI-3 limit of 30
    alerts = room.tick()
    assert len(alerts) == 1 and alerts[0].kind == "WAIT_BREACH"


def test_profile_switch_changes_breach_timing():
    # ESI-4: urban limit 60, rural limit 90 - same wait, different outcome
    for profile_name, minutes, expect in [("urban_500", 70, 1), ("rural_100", 70, 0)]:
        room, clock = make_room(profile_name)
        room.add(intake("P1"), fused(4))
        clock.advance(minutes)
        assert len(room.tick()) == expect, profile_name


def test_deterioration_trigger_on_worsening_recheck():
    room, clock = make_room()
    p = intake("SIM7", vitals=Vitals(hr=96, rr=18, spo2=96, temp_c=38.1, sbp=122))
    room.add(p, fused(3))
    clock.advance(40)
    alert = room.record_vitals("SIM7", Vitals(hr=112, rr=22, spo2=95, temp_c=38.8, sbp=108))
    assert alert is not None and alert.kind == "DETERIORATION"
    assert alert.needs_retriage
    assert any("HR" in r for r in alert.reasons)


def test_repeat_trend_deterioration_is_rate_limited():
    room, clock = make_room("urban_500")  # alert_cooldown_min drives suppression
    p = intake("P1", vitals=Vitals(hr=80, rr=16, spo2=97, temp_c=37.0, sbp=120))
    room.add(p, fused(3))
    clock.advance(10)
    worse = Vitals(hr=95, rr=16, spo2=97, temp_c=37.0, sbp=120)  # +19% HR, no danger
    assert room.record_vitals("P1", worse) is not None
    clock.advance(2)  # still inside the cooldown window
    assert room.record_vitals("P1", worse) is None
    clock.advance(room.profile.alert_cooldown_min)
    assert room.record_vitals("P1", worse) is not None


def test_danger_zone_recheck_bypasses_cooldown():
    room, clock = make_room("urban_500")
    p = intake("P1", vitals=Vitals(hr=80, rr=16, spo2=97, temp_c=37.0, sbp=120))
    room.add(p, fused(3))
    clock.advance(10)
    assert room.record_vitals("P1", Vitals(hr=95, rr=16, spo2=97)) is not None
    clock.advance(2)  # inside cooldown, but now in the danger zone
    alert = room.record_vitals("P1", Vitals(hr=125, rr=16, spo2=97))
    assert alert is not None
    assert any("danger zone" in r for r in alert.reasons)


def test_stable_recheck_fires_nothing_and_resets_wait():
    room, clock = make_room()
    room.add(intake("P1"), fused(3))
    clock.advance(25)
    alert = room.record_vitals("P1", Vitals(hr=92, rr=16, spo2=97, temp_c=37.1, sbp=118))
    assert alert is None
    clock.advance(20)  # 45 total, but only 20 since last assessment
    assert room.tick() == []


def test_queue_sorted_by_priority_and_excludes_treated():
    room, clock = make_room()
    room.add(intake("LOW", category="sprain"), fused(4))
    room.add(intake("HIGH"), fused(2, agree=False))
    room.add(intake("GONE"), fused(3))
    room.to_treatment("GONE")
    clock.advance(9)
    q = room.queue()
    assert [e.intake.patient_id for e in q] == ["HIGH", "LOW"]
    assert q[0].priority >= q[1].priority
