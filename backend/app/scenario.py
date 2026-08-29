"""Scenario player: step the curated 22-patient timeline through the live
system one event at a time - the demo driver for the dashboard."""

from typing import Any

from app.data_io import load_curated_patients
from app.service import TriageService


class ScenarioPlayer:
    def __init__(self, service: TriageService, speedup: float = 1.0,
                 use_llm: bool = True):
        self.service = service
        self.use_llm = use_llm
        self.events: list[tuple[float, str, Any]] = []
        for p in load_curated_patients():
            self.events.append((p.arrival_offset_min / speedup, "arrive", p))
            for r in p.vitals_rechecks:
                self.events.append(
                    (r.offset_min / speedup, "vitals", (p.patient_id, r.vitals))
                )
        self.events.sort(key=lambda e: e[0])
        self.index = 0

    @property
    def remaining(self) -> int:
        return len(self.events) - self.index

    def step(self) -> dict:
        if self.index >= len(self.events):
            return {"done": True, "alerts": [], "event": None}
        at_min, kind, payload = self.events[self.index]
        self.index += 1

        alerts = []
        if at_min > self.service.clock.now_min:
            alerts = self.service.advance_clock(at_min - self.service.clock.now_min)

        if kind == "arrive":
            fused = self.service.arrive(payload, use_llm=self.use_llm)
            event = {
                "kind": "arrive", "patient_id": payload.patient_id,
                "display_name": payload.display_name,
                "chief_complaint": payload.chief_complaint,
                "age_years": payload.age_years, "fused": fused,
            }
        else:
            patient_id, vitals = payload
            result = self.service.record_vitals(patient_id, vitals)
            event = {
                "kind": "vitals", "patient_id": patient_id,
                "vitals": vitals, "alert": result["alert"],
                "retriaged": result["retriaged"],
            }
            if result["alert"] is not None:
                alerts = alerts + [result["alert"]]

        return {"done": self.index >= len(self.events), "remaining": self.remaining,
                "sim_min": self.service.clock.now_min, "alerts": alerts, "event": event}
