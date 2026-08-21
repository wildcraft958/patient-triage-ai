"""Safety pipeline: every recommendation passes four checks before it
reaches a clinician (AgentGuard-style layering).

L1 input completeness   - what is missing from the intake, stated plainly
L2 clinical grounding   - the fused level may never be LESS acute than the
                          deterministic rules floor (the LLM cannot talk the
                          system down); a violation is corrected and logged
L3 red-flag propagation - rules-engine red flags always surface
L4 demographic counters - per-age-band decision stats for bias monitoring

The NEVER list is structural: nothing in this codebase finalizes an ESI,
blocks a patient, or overrides a clinician - only clinician actions move a
patient to treatment.
"""

from collections import defaultdict

from pydantic import BaseModel, Field

from app.agent.fuse import ROUTES, FusedResult
from app.learning.loop import age_band
from app.models import PatientIntake

CORE_FIELDS = ["hr", "rr", "spo2", "temp_c", "sbp"]


class SafetyReport(BaseModel):
    input_complete: bool
    missing_fields: list[str] = Field(default_factory=list)
    grounded: bool
    grounding_notes: list[str] = Field(default_factory=list)
    red_flags: list[str] = Field(default_factory=list)


def check(intake: PatientIntake, fused: FusedResult) -> tuple[FusedResult, SafetyReport]:
    """Return the (possibly corrected) fused result plus its safety report."""
    missing = [f for f in CORE_FIELDS if getattr(intake.vitals, f) is None]

    grounding_notes: list[str] = []
    grounded = True
    if fused.esi > fused.rules.esi:  # less acute than the deterministic floor
        grounded = False
        grounding_notes.append(
            f"Grounding correction: fused ESI-{fused.esi} was less acute than the "
            f"rules floor ESI-{fused.rules.esi}; restored to the floor"
        )
        fused = fused.model_copy(update={
            "esi": fused.rules.esi,
            "route": ROUTES[fused.rules.esi],
            "notes": fused.notes + grounding_notes,
        })

    report = SafetyReport(
        input_complete=not missing,
        missing_fields=missing,
        grounded=grounded,
        grounding_notes=grounding_notes,
        red_flags=fused.rules.red_flags,
    )
    return fused, report


class BiasMonitor:
    """L4: running per-age-band decision statistics.

    A systematic acuity skew for one band (relative to the others) is the
    cheapest observable signal of demographic bias in recommendations.
    """

    def __init__(self):
        self.counts: dict[str, list[int]] = defaultdict(list)

    def record(self, intake: PatientIntake, esi: int) -> None:
        self.counts[age_band(intake)].append(esi)

    def snapshot(self) -> dict:
        return {
            band: {
                "n": len(esis),
                "mean_esi": round(sum(esis) / len(esis), 2),
                "high_acuity_pct": round(
                    sum(1 for e in esis if e <= 2) / len(esis) * 100, 1
                ),
            }
            for band, esis in self.counts.items()
        }
