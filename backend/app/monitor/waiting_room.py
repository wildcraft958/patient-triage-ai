"""The waiting-room monitor: the patient doesn't stop being a patient
after triage.

Runs on a simulation clock so demos replay hours in seconds and tests are
deterministic (production swap: drive tick() from a real scheduler). Two
brief-mandated hard triggers fire independently of the priority score:
per-ESI wait-limit breach, and a vitals recheck that worsens past profile
thresholds or enters the age-banded danger zone.
"""

from dataclasses import dataclass, field

from pydantic import BaseModel
from pydantic import Field as PField

from app.agent.fuse import FusedResult
from app.engine.thresholds import in_danger_zone
from app.models import PatientIntake, Vitals
from app.monitor.belief import classify_recheck, initial_belief, observe
from app.monitor.belief import advance as advance_belief
from app.monitor.priority import deterioration_risk, reassessment_priority
from app.profiles import HospitalProfile

# scales the deterioration-risk estimate into the belief's per-hour hazard
BELIEF_HAZARD_SCALE = 0.4


class SimClock:
    def __init__(self, now_min: float = 0.0):
        self.now_min = now_min

    def advance(self, minutes: float) -> None:
        self.now_min += minutes


class Alert(BaseModel):
    patient_id: str
    at_min: float
    kind: str  # WAIT_BREACH | DETERIORATION
    reasons: list[str] = PField(default_factory=list)
    needs_retriage: bool = False
    message: str = ""  # nurse-facing rendering of the alert


@dataclass
class QueueEntry:
    intake: PatientIntake
    fused: FusedResult
    triaged_at_min: float
    last_assessed_min: float
    vitals_history: list[tuple[float, Vitals]]
    status: str = "waiting"  # waiting | reassess_due | deteriorating | in_treatment
    priority: float = 0.0
    alerts: list[Alert] = field(default_factory=list)
    belief: list[float] = field(default_factory=list)  # P(true acuity = ESI 1..5)
    belief_at_min: float = 0.0
    # clinician who set the current level; while set, no automated path may
    # replace the level (deferred enrichment turns advisory, see service)
    decided_by: str | None = None


ACTIVE_STATUSES = {"waiting", "reassess_due", "deteriorating"}


class WaitingRoom:
    def __init__(self, profile: HospitalProfile, clock: SimClock):
        self.profile = profile
        self.clock = clock
        self.entries: dict[str, QueueEntry] = {}

    def add(self, intake: PatientIntake, fused: FusedResult) -> QueueEntry:
        now = self.clock.now_min
        entry = QueueEntry(
            intake=intake, fused=fused, triaged_at_min=now,
            last_assessed_min=now, vitals_history=[(now, intake.vitals)],
            status="in_treatment" if fused.esi == 1 else "waiting",
            belief=initial_belief(fused), belief_at_min=now,
        )
        self.entries[intake.patient_id] = entry
        return entry

    def _advance_belief(self, entry: QueueEntry) -> None:
        elapsed = self.clock.now_min - entry.belief_at_min
        if elapsed > 0:
            hazard = deterioration_risk(entry) * BELIEF_HAZARD_SCALE
            entry.belief = advance_belief(entry.belief, elapsed, hazard)
            entry.belief_at_min = self.clock.now_min

    def tick(self) -> list[Alert]:
        """Wait-breach sweep: due whenever time since last assessment
        exceeds the profile's safe limit for the patient's ESI level."""
        alerts = []
        for entry in self.entries.values():
            if entry.status != "waiting":
                continue
            waited = self.clock.now_min - entry.last_assessed_min
            limit = self.profile.max_wait_min.get(entry.fused.esi)
            if limit is not None and waited > limit:
                alert = Alert(
                    patient_id=entry.intake.patient_id, at_min=self.clock.now_min,
                    kind="WAIT_BREACH",
                    reasons=[f"waiting {waited:.0f} min exceeds the {limit} min "
                             f"limit for ESI-{entry.fused.esi}"],
                    message=(f"Patient {entry.intake.patient_id} "
                             f"(ESI-{entry.fused.esi}, {entry.intake.complaint_category}, "
                             f"{waited:.0f} min wait) - safe wait limit exceeded. "
                             f"Consider reassessment."),
                )
                entry.status = "reassess_due"
                entry.alerts.append(alert)
                alerts.append(alert)
        return alerts

    def record_vitals(self, patient_id: str, vitals: Vitals) -> Alert | None:
        """A re-recorded vitals set: fire DETERIORATION if it worsens past
        profile thresholds vs the triage baseline, or enters the age-banded
        danger zone. A stable recheck counts as an assessment."""
        entry = self.entries[patient_id]
        now = self.clock.now_min
        _, baseline = entry.vitals_history[0]
        entry.vitals_history.append((now, vitals))

        d = self.profile.deterioration
        reasons = []
        if baseline.hr and vitals.hr:
            rise = (vitals.hr - baseline.hr) / baseline.hr * 100
            if rise >= d.hr_rise_pct:
                reasons.append(f"HR {baseline.hr:.0f} -> {vitals.hr:.0f} (+{rise:.0f}%)")
        if baseline.sbp and vitals.sbp:
            drop = (baseline.sbp - vitals.sbp) / baseline.sbp * 100
            if drop >= d.sbp_drop_pct:
                reasons.append(f"SBP {baseline.sbp:.0f} -> {vitals.sbp:.0f} (-{drop:.0f}%)")
        if baseline.spo2 and vitals.spo2:
            if baseline.spo2 - vitals.spo2 >= d.spo2_drop_points:
                reasons.append(f"SpO2 {baseline.spo2:.0f} -> {vitals.spo2:.0f}")
        if baseline.temp_c and vitals.temp_c:
            if vitals.temp_c - baseline.temp_c >= d.temp_rise_c:
                reasons.append(f"Temp {baseline.temp_c:.1f} -> {vitals.temp_c:.1f}")

        danger, danger_reasons = in_danger_zone(
            entry.intake.model_copy(update={"vitals": vitals})
        )
        trend_worsening = bool(reasons)
        if danger:
            reasons.extend(f"danger zone: {r}" for r in danger_reasons)

        # POMDP observation: every recheck updates the acuity belief
        self._advance_belief(entry)
        obs = classify_recheck(baseline, vitals, danger=danger,
                               worsening=trend_worsening)
        entry.belief = observe(entry.belief, obs)

        if reasons:
            # Alert-fatigue rate limit: a repeat of the same trend-based
            # deterioration inside the cooldown window is suppressed. A
            # danger-zone entry always fires - absolute risk is never muted.
            recent = any(
                a.kind == "DETERIORATION"
                and now - a.at_min < self.profile.alert_cooldown_min
                for a in entry.alerts
            )
            if recent and not danger:
                return None
            waited = now - entry.last_assessed_min
            alert = Alert(
                patient_id=patient_id, at_min=now, kind="DETERIORATION",
                reasons=reasons, needs_retriage=True,
                message=(f"Patient {patient_id} (ESI-{entry.fused.esi}, "
                         f"{entry.intake.complaint_category}, {waited:.0f} min wait) - "
                         f"{'; '.join(reasons)}. Recommend immediate reassessment."),
            )
            entry.status = "deteriorating"
            entry.alerts.append(alert)
            return alert

        entry.last_assessed_min = now
        entry.status = "waiting"
        return None

    def mark_assessed(self, patient_id: str, fused: FusedResult | None = None) -> None:
        entry = self.entries[patient_id]
        entry.last_assessed_min = self.clock.now_min
        entry.status = "waiting"
        if fused is not None:
            entry.fused = fused
        # a fresh assessment collapses the drifted belief back to the paths
        entry.belief = initial_belief(entry.fused)
        entry.belief_at_min = self.clock.now_min

    def to_treatment(self, patient_id: str) -> None:
        self.entries[patient_id].status = "in_treatment"

    def queue(self) -> list[QueueEntry]:
        active = [e for e in self.entries.values() if e.status in ACTIVE_STATUSES]
        for e in active:
            self._advance_belief(e)
            e.priority = reassessment_priority(e, self.clock.now_min, self.profile)
        return sorted(active, key=lambda e: e.priority, reverse=True)
