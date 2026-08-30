"""TriageService: the one place where all the pieces meet.

arrival -> dual-path triage -> learned calibration -> waiting room
vitals recheck -> deterioration trigger -> automatic re-triage
clinician accept/override -> reward -> calibration update -> audit trail
"""

import functools
import threading
import time

from app.agent.fuse import ROUTES, FusedResult
from app.agent.graph import triage
from app.audit.log import AuditLog, OverrideRecord
from app.engine.complaint import KNOWN_CATEGORIES, classify_category
from app.learning.loop import CalibrationTable, age_band, compute_reward_vector
from app.models import PatientIntake, Vitals
from app.monitor.waiting_room import Alert, SimClock, WaitingRoom
from app.profiles import load_profile
from app.safety.pipeline import BiasMonitor, check as safety_check

from app.config import REPO_ROOT

CALIBRATION_PATH = REPO_ROOT / "data" / "cache" / "calibration.json"


class NoStandingAlert(LookupError):
    """Acknowledge was called on a patient with no alert to acknowledge."""


class UnacknowledgedDowngrade(ValueError):
    """A high-risk downgrade override submitted without explicit confirmation.

    The clinician's authority is absolute - a confirmed decision is never
    blocked - but downgrading a red-flagged or ESI<=2 patient by two or more
    levels requires an explicit acknowledgment so it cannot happen by slip."""


def _locked(method):
    """Serialize state-mutating entry points on the shared service: API
    handlers run on a threadpool, so concurrent requests would otherwise
    interleave inside check-then-act windows (override vs enrichment drain)."""
    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)
    return wrapper


class TriageService:
    def __init__(self, profile_name: str | None = None, audit_path: str | None = None,
                 transport=None, calibration_path=None):
        self._lock = threading.RLock()  # reentrant: advance_clock -> process_enrichment
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
        self._classifier_runs = 0
        self._calibration_escalations = 0

    # --- surge ---

    @property
    def surge_mode(self) -> bool:
        if self.surge_forced is not None:
            return self.surge_forced
        return len(self.room.queue()) >= self.profile.surge_queue_threshold

    # --- core flows ---

    @_locked
    def arrive(self, intake: PatientIntake, use_llm: bool = True) -> FusedResult:
        # intake-to-recommendation latency: redact + both paths + calibration
        # + safety - the full pipeline a clinician actually waits on
        started = time.perf_counter()
        auto_note = None
        # run the intake classifier when no usable category was supplied:
        # "other" is the console's auto-detect default, and an unrecognized
        # string (an integration typo) must never silently degrade a patient
        classifier_ran = (intake.complaint_category == "other"
                          or intake.complaint_category not in KNOWN_CATEGORIES)
        if classifier_ran:
            self._classifier_runs += 1
            detected = classify_category(intake.chief_complaint)
            if detected != intake.complaint_category:
                intake = intake.model_copy(update={"complaint_category": detected})
                auto_note = (f"Complaint auto-categorized as {detected} "
                             f"from the chief complaint text")
        surge = self.surge_mode
        fused, trace = self._run_triage(intake, use_llm=use_llm and not surge)
        if auto_note:
            fused = fused.model_copy(update={"notes": [auto_note] + fused.notes})
        if surge and use_llm:
            self._enrichment_queue.append(intake.patient_id)
            fused = fused.model_copy(update={"notes": fused.notes + [
                "Surge: Path B queued for deferred enrichment"]})
        fused = self._apply_calibration(intake, fused)
        fused, safety = safety_check(intake, fused)
        latency_ms = round((time.perf_counter() - started) * 1000, 1)
        self._latencies_ms.append(latency_ms)
        self.bias.record(intake, fused.esi)
        trace |= {"total_ms": latency_ms, "surge_path": surge,
                  "classifier_ran": classifier_ran}
        self.room.add(intake, fused, pipeline=trace)
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

    @_locked
    def record_vitals(self, patient_id: str, vitals: Vitals,
                      source: str = "nurse") -> dict:
        alert = self.room.record_vitals(patient_id, vitals)
        result: dict = {"alert": alert, "retriaged": None}
        if alert is not None:
            self.audit.log("alert", patient_id, self.clock.now_min,
                           {"kind": alert.kind, "reasons": alert.reasons,
                            "source": source})
            if alert.needs_retriage:
                entry = self.room.entries[patient_id]
                intake = entry.intake.model_copy(update={"vitals": vitals})
                old_esi = entry.fused.esi
                fused, trace = self._run_triage(intake, use_llm=not self.surge_mode)
                # deterioration re-triage may only hold or escalate, never downgrade
                if fused.esi > old_esi:
                    fused = fused.model_copy(update={
                        "esi": old_esi, "route": ROUTES[old_esi],
                        "notes": fused.notes + [
                            "Re-triage suggested a less acute level; keeping the "
                            "original - deterioration never downgrades"],
                    })
                fused = self._apply_calibration(intake, fused)
                entry.pipeline = {**trace, "total_ms": None,
                                  "surge_path": self.surge_mode,
                                  "classifier_ran": False}
                self.room.mark_assessed(patient_id, fused=fused)
                self.audit.log("reassessment", patient_id, self.clock.now_min, {
                    "previous_esi": old_esi, "new_esi": fused.esi,
                    "trigger": alert.kind, "reasons": alert.reasons,
                })
                result["retriaged"] = fused
        return result

    @_locked
    def advance_clock(self, minutes: float) -> list[Alert]:
        self.clock.advance(minutes)
        self.process_enrichment()
        alerts = self.room.tick()
        for alert in alerts:
            self.audit.log("alert", alert.patient_id, self.clock.now_min,
                           {"kind": alert.kind, "reasons": alert.reasons})
        return alerts

    @_locked
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
            fused, trace = self._run_triage(entry.intake, use_llm=True)
            if fused.llm is None:
                self.audit.log("surge_enrichment", pid, self.clock.now_min,
                               {"outcome": "llm_unavailable"})
                continue
            fused = self._apply_calibration(entry.intake, fused)
            fused, _ = safety_check(entry.intake, fused)
            if entry.decided_by is not None:
                # a clinician decided while Path B was queued: their level is
                # final for automation - the enrichment turns advisory, and a
                # more-acute LLM view is flagged to a human, never auto-acted
                llm_more_acute = fused.esi < entry.fused.esi
                note = (f"Deferred Path B reviewed: LLM suggests ESI-{fused.esi}; "
                        f"clinician decision ESI-{entry.fused.esi} by "
                        f"{entry.decided_by} stands")
                update: dict = {"notes": entry.fused.notes + [note]}
                if llm_more_acute:
                    update["clinician_flag"] = True
                entry.fused = entry.fused.model_copy(update=update)
                self.audit.log("surge_enrichment", pid, self.clock.now_min, {
                    "outcome": "clinician_decision_stands",
                    "llm_esi": fused.esi, "clinician_esi": entry.fused.esi,
                    "decided_by": entry.decided_by,
                    "llm_more_acute": llm_more_acute,
                })
                continue
            # append-only note trail: the arrival record survives enrichment
            fused = fused.model_copy(
                update={"notes": entry.fused.notes + fused.notes})
            old_esi = entry.fused.esi
            if fused.esi > old_esi:
                fused = fused.model_copy(update={
                    "esi": old_esi, "route": ROUTES[old_esi],
                    "notes": fused.notes + [
                        "Enrichment suggested a less acute level; keeping the "
                        "standing level - enrichment never downgrades"],
                })
            entry.fused = fused
            entry.pipeline = {**trace, "total_ms": None, "surge_path": False,
                              "classifier_ran": False, "deferred_enrichment": True}
            self.audit.log("surge_enrichment", pid, self.clock.now_min, {
                "previous_esi": old_esi, "new_esi": fused.esi,
                "escalated": fused.esi < old_esi,
                "paths_agree": fused.paths_agree,
            })
            results.append({"patient_id": pid, "previous_esi": old_esi,
                            "new_esi": fused.esi})
        return results

    # --- clinician actions ---

    @_locked
    def accept(self, patient_id: str, clinician_id: str) -> float:
        entry = self.room.entries[patient_id]
        vector = compute_reward_vector(entry.fused.esi, None,
                                       dual_chain=entry.fused.llm is not None)
        self._learn(entry.intake, under_triage=False)
        self.audit.log("acceptance", patient_id, self.clock.now_min, {
            "esi": entry.fused.esi, "clinician_id": clinician_id,
            "reward": vector.total, "reward_axes": vector.model_dump(),
            "cell": f"{entry.intake.complaint_category}|{age_band(entry.intake)}",
        })
        self.room.to_treatment(patient_id)
        return vector.total

    @_locked
    def reassess(self, patient_id: str, clinician_id: str) -> dict:
        """A bedside check with no new vitals recorded. It is still an
        assessment: the safe-wait clock restarts, the standing alert is
        answered, and the audit trail names who looked."""
        entry = self.room.entries[patient_id]
        waited = round(self.clock.now_min - entry.last_assessed_min, 1)
        status_before = entry.status
        self.room.mark_assessed(patient_id)
        if entry.alerts:
            entry.alerts[-1].acknowledged_by = clinician_id
        self.audit.log("reassessment_check", patient_id, self.clock.now_min, {
            "clinician_id": clinician_id, "esi": entry.fused.esi,
            "waited_min": waited, "status_before": status_before,
        })
        return {"status": entry.status, "waited_min": 0.0,
                "esi": entry.fused.esi}

    @_locked
    def acknowledge_alert(self, patient_id: str, clinician_id: str) -> dict:
        """Seen, not answered. The alert leaves the band so it stops
        competing for attention; the patient keeps their level and their
        overdue status, and the acknowledgment is on the record."""
        entry = self.room.entries[patient_id]
        if not entry.alerts:
            raise NoStandingAlert(f"{patient_id} has no alert to acknowledge")
        alert = entry.alerts[-1]
        alert.acknowledged_by = clinician_id
        self.audit.log("alert_ack", patient_id, self.clock.now_min, {
            "clinician_id": clinician_id, "kind": alert.kind,
            "reasons": alert.reasons, "alerted_at_min": alert.at_min,
        })
        return {"acknowledged": True, "kind": alert.kind}

    @_locked
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
                                       dual_chain=entry.fused.llm is not None,
                                       documented=bool(reason and reason.strip()))
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
        # the clinician decides: their level becomes the patient's level,
        # and while decided_by is set no automated path may replace it
        entry.fused = entry.fused.model_copy(update={
            "esi": new_esi, "route": ROUTES[new_esi],
            "notes": entry.fused.notes + [f"Clinician override to ESI-{new_esi}: {reason}"],
        })
        entry.decided_by = clinician_id
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

    def _board_row(self, e) -> dict:
        """One row of the shift board. Everything the console renders per
        patient comes from here, so the queue, the reassessment board and the
        alert band cannot drift apart."""
        from app.engine.icd10 import code_for
        from app.monitor.priority import action_for
        from app.monitor.waiting_room import ACTIVE_STATUSES, worsening_reasons

        active = e.status in ACTIVE_STATUSES
        history = e.vitals_history
        peak = max(range(len(e.belief)), key=e.belief.__getitem__)
        return {
            "patient_id": e.intake.patient_id,
            "display_name": e.intake.display_name,
            # priority ranks who to reassess next: meaningless once a patient
            # is in care, so it is absent rather than stale
            "action": action_for(e.priority, self.profile) if active else None,
            "icd10": code_for(e.intake.complaint_category),
            "esi": e.fused.esi,
            "route": e.fused.route,
            "confidence": e.fused.confidence,
            "paths_agree": e.fused.paths_agree,
            "clinician_flag": e.fused.clinician_flag,
            "decided_by": e.decided_by,
            "status": e.status,
            "priority": round(e.priority, 3) if active else None,
            # two different clocks: how long since anyone assessed them, and
            # how long they have been in the department at all
            "waited_min": round(self.clock.now_min - e.last_assessed_min, 1),
            "in_ed_min": round(self.clock.now_min - e.triaged_at_min, 1),
            "chief_complaint": e.intake.chief_complaint,
            "age_years": e.intake.age_years,
            "age_months": e.intake.age_months,
            "category": e.intake.complaint_category,
            "max_wait_min": self.profile.max_wait_min.get(e.fused.esi),
            "vitals_latest": history[-1][1],
            "vitals_worsening": (
                worsening_reasons(history[0][1], history[-1][1],
                                  self.profile.deterioration)
                if len(history) > 1 else []
            ),
            "alert": e.alerts[-1].message if e.alerts else None,
            "alert_kind": e.alerts[-1].kind if e.alerts else None,
            "alert_acknowledged": bool(e.alerts and e.alerts[-1].acknowledged_by),
            "belief_peak": {"esi": peak + 1, "p": round(e.belief[peak], 3)},
        }

    @_locked
    def queue_view(self) -> list[dict]:
        return [self._board_row(e) for e in self.room.queue()]

    @_locked
    def in_care_view(self) -> list[dict]:
        """Patients moved to treatment. A sibling of the queue, never part of
        it: the waiting count and the surge threshold both read the queue."""
        return [self._board_row(e) for e in self.room.entries.values()
                if e.status == "in_treatment"]

    # An ED is busy before it is in surge, and the bar should say so. Surge is
    # the system's own state - it changes how triage runs - while busy is a
    # reading of how close the department is to it, from either direction:
    # bays filling up, or the waiting queue climbing toward the threshold.
    BUSY_OCCUPANCY = 0.8
    BUSY_QUEUE_FRACTION = 0.6

    def state_view(self) -> dict:
        waiting = self.room.queue()
        in_care = sum(1 for e in self.room.entries.values()
                      if e.status == "in_treatment")
        bays = self.profile.treatment_bays
        available = max(0, bays - in_care)
        return {
            "profile": self.profile.profile_name,
            "visits_per_day": self.profile.visits_per_day,
            "sim_min": self.clock.now_min,
            "surge_mode": self.surge_mode,
            "waiting": len(waiting),
            "in_care": in_care,
            "total_patients": len(self.room.entries),
            "treatment_bays": bays,
            "beds_available": available,
            "avg_wait_min": (
                round(sum(self.clock.now_min - e.last_assessed_min
                          for e in waiting) / len(waiting), 1)
                if waiting else 0.0
            ),
            "load": self._load_state(len(waiting), in_care, bays),
            "surge_queue_threshold": self.profile.surge_queue_threshold,
            "pending_enrichment": len(self._enrichment_queue),
        }

    def _load_state(self, waiting: int, in_care: int, bays: int) -> str:
        if self.surge_mode:
            return "surge"
        crowded = bays and in_care / bays >= self.BUSY_OCCUPANCY
        backing_up = (waiting
                      >= self.profile.surge_queue_threshold * self.BUSY_QUEUE_FRACTION)
        return "busy" if crowded or backing_up else "normal"

    # --- internals ---

    def _run_triage(self, intake: PatientIntake,
                    use_llm: bool) -> tuple[FusedResult, dict]:
        """The recommendation and the trace of what produced it. The trace is
        what the pipeline view renders: measured time per stage and the PHI
        classes redaction actually removed for this patient."""
        state = triage(intake, use_llm=use_llm, transport=self.transport)
        trace = {
            "stage_ms": state["stage_ms"],
            "phi_entities_removed": state["phi_entities_removed"],
            "reasoning_ran": state["fused"].llm is not None,
        }
        return state["fused"], trace

    def _apply_calibration(self, intake: PatientIntake, fused: FusedResult) -> FusedResult:
        band = age_band(intake)
        adjusted = self.calibration.apply(intake.complaint_category, band, fused.esi)
        if adjusted != fused.esi:
            self._calibration_escalations += 1
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
