"""FHIR R4 export: the EHR integration surface.

One triage episode leaves as a self-contained Bundle - a de-identified
Patient, one LOINC-coded Observation per recorded vital, a RiskAssessment
carrying the ESI recommendation with the acuity belief as per-level
probabilities and both reasoning chains, and a Provenance naming the
recommending software. Patient-record systems consume this directly; bed
management and staff rosters hang off the same seam.
"""

from app.monitor.waiting_room import QueueEntry

LOINC = {
    "hr": ("8867-4", "Heart rate", "/min"),
    "rr": ("9279-1", "Respiratory rate", "/min"),
    "spo2": ("59408-5", "Oxygen saturation", "%"),
    "temp_c": ("8310-5", "Body temperature", "Cel"),
    "sbp": ("8480-6", "Systolic blood pressure", "mm[Hg]"),
    "pain": ("72514-3", "Pain severity 0-10", "{score}"),
}


def _observation(pid: str, field: str, value: float, at_min: float) -> dict:
    code, label, unit = LOINC[field]
    return {
        "resourceType": "Observation",
        "status": "final",
        "code": {"coding": [{"system": "http://loinc.org", "code": code,
                             "display": label}]},
        "subject": {"reference": f"Patient/{pid}"},
        "effectiveDateTime": f"sim-minute-{at_min:g}",
        "valueQuantity": {"value": value, "unit": unit},
    }


def triage_bundle(entry: QueueEntry, sim_min: float) -> dict:
    intake, fused = entry.intake, entry.fused
    pid = intake.patient_id

    patient = {
        "resourceType": "Patient",
        "id": pid,
        "text": {"status": "generated",
                 "div": f"De-identified triage patient, age {intake.age_years}"},
    }

    observations = [
        _observation(pid, field, value, at_min)
        for at_min, vitals in entry.vitals_history
        for field, value in vitals.model_dump().items()
        if value is not None
    ]

    risk = {
        "resourceType": "RiskAssessment",
        "status": "final",
        "subject": {"reference": f"Patient/{pid}"},
        "occurrenceDateTime": f"sim-minute-{sim_min:g}",
        "prediction": [
            {"outcome": {"text": f"ESI-{level}"},
             "probabilityDecimal": round(p, 3)}
            for level, p in enumerate(entry.belief, start=1)
        ],
        "note": [
            {"text": f"Recommended ESI-{fused.esi} ({fused.route}), "
                     f"confidence {fused.confidence}. The system recommends; "
                     f"the clinician decides."},
            {"text": "Rules path: " + " | ".join(fused.rules.reasons)},
        ] + ([{"text": "Reasoning path: " + " | ".join(fused.llm.reasoning)}]
             if fused.llm else []),
    }

    provenance = {
        "resourceType": "Provenance",
        "target": [{"reference": f"RiskAssessment for Patient/{pid}"}],
        "recorded": f"sim-minute-{sim_min:g}",
        "agent": [{"who": {"display": "PatientTriage.ai dual-path triage engine"}}],
        "activity": {"text": "AI-assisted triage recommendation; full trail "
                             "in the append-only audit log"},
    }

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": [{"resource": r}
                  for r in [patient, *observations, risk, provenance]],
    }
