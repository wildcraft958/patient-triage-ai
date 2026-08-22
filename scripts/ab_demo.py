"""The counterfactual from the pitch, runnable: the same deteriorating
patient WITHOUT dynamic reassessment (triage as a snapshot) versus WITH it
(the waiting room is part of triage).

    cd backend && uv run python ../scripts/ab_demo.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.data_io import load_curated_patients  # noqa: E402
from app.service import TriageService  # noqa: E402


def main() -> None:
    sim = next(p for p in load_curated_patients() if "deteriorator" in p.tags)
    print(f"Patient: {sim.patient_id}, age {sim.age_years} - "
          f"\"{sim.chief_complaint}\"\n")

    # WITHOUT: score once at arrival, then nobody looks again
    svc = TriageService(profile_name="urban_500", audit_path=":memory:",
                        calibration_path=None)
    fused = svc.arrive(sim, use_llm=False)
    initial = fused.esi
    last = sim.vitals_rechecks[-1]
    print("WITHOUT dynamic reassessment")
    print(f"  minute {svc.clock.now_min:5.0f}  triaged ESI-{initial}, joins the queue")
    print(f"  minute {last.offset_min:5.0f}  still ESI-{initial}: vitals now "
          f"HR {last.vitals.hr:.0f}, SpO2 {last.vitals.spo2:.0f}, "
          f"SBP {last.vitals.sbp:.0f} - nobody is watching")
    print("  outcome: deterioration discovered reactively at treatment time\n")

    # WITH: the monitor treats every recheck as an observation
    svc = TriageService(profile_name="urban_500", audit_path=":memory:",
                        calibration_path=None)
    svc.arrive(sim, use_llm=False)
    print("WITH dynamic reassessment")
    print(f"  minute {svc.clock.now_min:5.0f}  triaged ESI-{initial}, "
          f"monitor begins tracking the acuity belief")
    for recheck in sim.vitals_rechecks:
        svc.advance_clock(recheck.offset_min - svc.clock.now_min)
        result = svc.record_vitals(sim.patient_id, recheck.vitals)
        alert, retriaged = result["alert"], result["retriaged"]
        if alert:
            print(f"  minute {svc.clock.now_min:5.0f}  ALERT: {alert.message}")
        if retriaged:
            print(f"  minute {svc.clock.now_min:5.0f}  automatic re-triage "
                  f"ESI-{initial} -> ESI-{retriaged.esi}")
    print("  outcome: flagged while still in the waiting room; "
          "the nurse is told exactly whom to check and why")


if __name__ == "__main__":
    main()
