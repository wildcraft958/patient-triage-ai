"""TriageService: the one place where all the pieces meet.

arrival -> dual-path triage -> learned calibration -> waiting room
vitals recheck -> deterioration trigger -> automatic re-triage
clinician accept/override -> reward -> calibration update -> audit trail
"""

import time

from app.agent.fuse import ROUTES, FusedResult
from app.agent.graph import triage
from app.audit.log import AuditLog, OverrideRecord
from app.learning.loop import CalibrationTable, age_band, compute_reward_vector
from app.models import PatientIntake, Vitals
from app.monitor.waiting_room import Alert, SimClock, WaitingRoom
from app.profiles import load_profile
from app.safety.pipeline import BiasMonitor, check as safety_check

from app.config import REPO_ROOT

CALIBRATION_PATH = REPO_ROOT / "data" / "cache" / "calibration.json"


class UnacknowledgedDowngrade(ValueError):
    """A high-risk downgrade override submitted without explicit confirmation.

    The clinician's authority is absolute - a confirmed decision is never
    blocked - but downgrading a red-flagged or ESI<=2 patient by two or more
    levels requires an explicit acknowledgment so it cannot happen by slip."""


class TriageService:
    def __init__(self, profile_name: str | None = None, audit_path: str | None = None,
                 transport=None, calibration_path=None):
        self.profile = load_profile(profile_name)
        self.clock = SimClock()
        self.room = WaitingRoom(profile=self.profile, clock=self.clock)
        self.audit = AuditLog(path=audit_path)
        self.calibration = CalibrationTable(path=calibration_path)
        self.transport = transport
        self.surge_forced: bool | None = None
        self.bias = BiasMonitor()
        self._enrichment_queue: list[str] = []
        self._latencies_ms: list[float] = []

    # --- surge ---

    @property
    def surge_mode(self) -> bool:
        if self.surge_forced is not None:
            return self.surge_forced
        return len(self.room.queue()) >= self.profile.surge_queue_threshold

    # --- core flows ---

    def arrive(self, intake: PatientIntake, use_llm: bool = True) -> FusedResult:
        # intake-to-recommendation latency: redact + both paths + calibration
        # + safety - the full pipeline a clinician actually waits on
        started = time.perf_counter()
        surge = self.surge_mode
        fused = self._run_triage(intake, use_llm=use_llm and not surge)
        if surge and use_llm:
            self._enrichment_queue.append(intake.patient_id)
            fused = fused.model_copy(update={"notes": fused.notes + [
                "Surge: Path B queued for deferred enrichment"]})
        fused = self._apply_calibration(intake, fused)
        fused, safety = safety_check(intake, fused)
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        self._latencies_ms.append(latency_ms)
        self.bias.record(intake, fused.esi)
        self.room.add(intake, fused)
        self.audit.log("triage", intake.patient_id, self.clock.now_min, {
            "esi": fused.esi, "route": fused.route, "confidence": fused.confidence,
            "paths_agree": fused.paths_agree, "clinician_flag": fused.clinician_flag,
            "surge_mode": surge,
            "latency_ms": latency_ms,
            "rules_reasons": fused.rules.reasons,
            "llm_reasoning": fused.llm.reasoning if fused.llm else None,
            "notes": fused.notes,
            "safety": safety.model_dump(),
        })
        return fused

    def record_vitals(self, patient_id: str, vitals: Vitals) -> dict:
        alert = self.room.record_vitals(patient_id, vitals)
        result: dict = {"alert": alert, "retriaged": None}
        if alert is not None:
            self.audit.log("alert", patient_id, self.clock.now_min,
                           {"kind": alert.kind, "reasons": alert.reasons})
            if alert.needs_retriage:
                entry = self.room.entries[patient_id]
                intake = entry.intake.model_copy(update={"vitals": vitals})
                old_esi = entry.fused.esi
                fused = self._run_triage(intake, use_llm=not self.surge_mode)
                # deterioration re-triage may only hold or escalate, never downgrade
                if fused.esi > old_esi:
                    fused = fused.model_copy(update={
                        "esi": old_esi, "route": ROUTES[old_esi],
                        "notes": fused.notes + [
                            "Re-triage suggested a less acute level; keeping the "
                            "original - deterioration never downgrades"],
                    })
                fused = self._apply_calibration(intake, fused)
                self.room.mark_assessed(patient_id, fused=fused)
                self.audit.log("reassessment", patient_id, self.clock.now_min, {
                    "previous_esi": old_esi, "new_esi": fused.esi,
                    "trigger": alert.kind, "reasons": alert.reasons,
                })
                result["retriaged"] = fused
        return result

    def advance_clock(self, minutes: float) -> list[Alert]:
        self.clock.advance(minutes)
        self.process_enrichment()
        alerts = self.room.tick()
        for alert in alerts:
            self.audit.log("alert", alert.patient_id, self.clock.now_min,
                           {"kind": alert.kind, "reasons": alert.reasons})
        return alerts

    def process_enrichment(self) -> list[dict]:
        """Drain Path-B work deferred at surge arrivals.

        Deterministic on purpose: the sim clock drives draining, so demos and
        tests replay identically (production swap: a background worker
        consuming the same queue). Enrichment may only hold or escalate a
        standing level, never downgrade, and every outcome is audited."""
        queue, self._enrichment_queue = self._enrichment_queue, []
        results = []
        for pid in queue:
            entry = self.room.entries.get(pid)
            if entry is None or entry.status == "in_treatment":
                continue
            fused = self._run_triage(entry.intake, use_llm=True)
            if fused.llm is None:
                self.audit.log("surge_enrichment", pid, self.clock.now_min,
                               {"outcome": "llm_unavailable"})
                continue
            fused = self._apply_calibration(entry.intake, fused)
            fused, _ = safety_check(entry.intake, fused)
            old_esi = entry.fused.esi
            if fused.esi > old_esi:
                fused = fused.model_copy(update={
                    "esi": old_esi, "route": ROUTES[old_esi],
                    "notes": fused.notes + [
                        "Enrichment suggested a less acute level; keeping the "
                        "standing level - enrichment never downgrades"],
                })
            entry.fused = fused
            self.audit.log("surge_enrichment", pid, self.clock.now_min, {
                "previous_esi": old_esi, "new_esi": fused.esi,
                "escalated": fused.esi < old_esi,
                "paths_agree": fused.paths_agree,
            })
            results.append({"patient_id": pid, "previous_esi": old_esi,
                            "new_esi": fused.esi})
        return results

    # --- clinician actions ---

    def accept(self, patient_id: str, clinician_id: str) -> float:
        entry = self.room.entries[patient_id]
        vector = compute_reward_vector(entry.fused.esi, None,
                                       dual_chain=entry.fused.llm is not None)
        self._learn(entry.intake, under_triage=False)
        self.audit.log("acceptance", patient_id, self.clock.now_min, {
            "esi": entry.fused.esi, "clinician_id": clinician_id,
            "reward": vector.total, "reward_axes": vector.model_dump(),
        })
        self.room.to_treatment(patient_id)
        return vector.total

    def override(self, patient_id: str, new_esi: int, clinician_id: str,
                 reason: str, acknowledge_risk: bool = False) -> dict:
        entry = self.room.entries[patient_id]
        dangerous = (
            (entry.fused.esi <= 2 or entry.fused.rules.red_flags)
            and new_esi >= entry.fused.esi + 2
        )
        if dangerous and not acknowledge_risk:
            raise UnacknowledgedDowngrade(
                f"Downgrading ESI-{entry.fused.esi} "
                f"(red flags: {entry.fused.rules.red_flags or 'none'}) to "
                f"ESI-{new_esi} requires acknowledge_risk=true - please confirm "
                f"you have reviewed the flagged risk."
            )
        safety_warning = None
        if dangerous:
            safety_warning = (
                f"High-risk downgrade: ESI-{entry.fused.esi} -> ESI-{new_esi} "
                f"with red flags {entry.fused.rules.red_flags}; acknowledged by "
                f"{clinician_id}"
            )
            self.audit.log("override_safety_flag", patient_id, self.clock.now_min, {
                "original_esi": entry.fused.esi, "new_esi": new_esi,
                "red_flags": entry.fused.rules.red_flags,
                "clinician_id": clinician_id, "reason": reason,
            })
        record = OverrideRecord(
            original_esi=entry.fused.esi, new_esi=new_esi,
            clinician_id=clinician_id, reason=reason, sim_min=self.clock.now_min,
        )
        vector = compute_reward_vector(record.original_esi, new_esi,
                                       dual_chain=entry.fused.llm is not None)
        reward = vector.total
        under_triage = new_esi < record.original_esi
        self._learn(entry.intake, under_triage=under_triage)
        self.audit.log_override(patient_id, record)
        self.audit.log("reward", patient_id, self.clock.now_min, {
            "reward": reward, "reward_axes": vector.model_dump(),
            "under_triage": under_triage,
            "recommended_esi": record.original_esi, "clinician_esi": new_esi,
            "cell": f"{entry.intake.complaint_category}|{age_band(entry.intake)}",
        })
        # the clinician decides: their level becomes the patient's level
        entry.fused = entry.fused.model_copy(update={
            "esi": new_esi, "route": ROUTES[new_esi],
            "notes": entry.fused.notes + [f"Clinician override to ESI-{new_esi}: {reason}"],
        })
        self.room.mark_assessed(patient_id)
        return {"reward": reward, "under_triage": under_triage,
                "record": record.model_dump(), "safety_warning": safety_warning}

    # --- views ---

    def latency_stats(self) -> dict | None:
        if not self._latencies_ms:
            return None
        s = sorted(self._latencies_ms)
        def pct(p: float) -> float:
            return s[min(len(s) - 1, int(p / 100 * len(s)))]
        return {"n": len(s), "p50_ms": pct(50), "p95_ms": pct(95)}

    def queue_view(self) -> list[dict]:
        return [
            {
                "patient_id": e.intake.patient_id,
                "esi": e.fused.esi,
                "route": e.fused.route,
                "confidence": e.fused.confidence,
                "paths_agree": e.fused.paths_agree,
                "status": e.status,
                "priority": round(e.priority, 3),
                "waited_min": round(self.clock.now_min - e.last_assessed_min, 1),
                "chief_complaint": e.intake.chief_complaint,
                "age_years": e.intake.age_years,
                "age_months": e.intake.age_months,
                "category": e.intake.complaint_category,
                "max_wait_min": self.profile.max_wait_min.get(e.fused.esi),
            }
            for e in self.room.queue()
        ]

    def state_view(self) -> dict:
        return {
            "profile": self.profile.profile_name,
            "sim_min": self.clock.now_min,
            "surge_mode": self.surge_mode,
            "waiting": len(self.room.queue()),
            "total_patients": len(self.room.entries),
            "pending_enrichment": len(self._enrichment_queue),
        }

    # --- internals ---

    def _run_triage(self, intake: PatientIntake, use_llm: bool) -> FusedResult:
        state = triage(intake, use_llm=use_llm, transport=self.transport)
        return state["fused"]

    def _apply_calibration(self, intake: PatientIntake, fused: FusedResult) -> FusedResult:
        band = age_band(intake)
        adjusted = self.calibration.apply(intake.complaint_category, band, fused.esi)
        if adjusted != fused.esi:
            return fused.model_copy(update={
                "esi": adjusted, "route": ROUTES[adjusted],
                "notes": fused.notes + [
                    f"Learned calibration escalated ESI-{fused.esi} -> ESI-{adjusted} "
                    f"(clinicians repeatedly escalated {intake.complaint_category}/{band})"],
            })
        return fused

    def _learn(self, intake: PatientIntake, under_triage: bool) -> None:
        self.calibration.record(intake.complaint_category, age_band(intake), under_triage)
        if self.calibration.path is not None:
            self.calibration.save()
