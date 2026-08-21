"""Replay the 22-patient curated timeline through the full system.

    cd backend && uv run python ../scripts/replay_demo.py
    ... --profile rural_100          # small-ED thresholds
    ... --speedup 3                  # 3x surge: arrivals compressed 3-fold
    ... --no-llm                     # rules-only everywhere

Prints the event narrative (arrivals, alerts, re-triages) plus a final
queue and audit summary. LLM calls hit the on-disk replay cache when warm.
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.data_io import load_curated_patients  # noqa: E402
from app.service import TriageService  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default="urban_500")
    ap.add_argument("--speedup", type=float, default=1.0,
                    help="arrival-rate multiplier (3 = the brief's 3x surge)")
    ap.add_argument("--no-llm", action="store_true")
    args = ap.parse_args()

    svc = TriageService(profile_name=args.profile, audit_path=":memory:")
    patients = load_curated_patients()

    # merge arrivals and vitals rechecks into one event timeline
    events: list[tuple[float, str, object]] = []
    for p in patients:
        events.append((p.arrival_offset_min / args.speedup, "arrive", p))
        for r in p.vitals_rechecks:
            events.append((r.offset_min / args.speedup, "vitals", (p.patient_id, r.vitals)))
    events.sort(key=lambda e: e[0])

    print(f"profile={args.profile} speedup={args.speedup}x llm={not args.no_llm}")
    latencies: list[tuple[str, float, bool]] = []

    for at_min, kind, payload in events:
        if at_min > svc.clock.now_min:
            for alert in svc.advance_clock(at_min - svc.clock.now_min):
                print(f"[t={alert.at_min:5.1f}] ALERT {alert.kind} {alert.patient_id}: "
                      f"{'; '.join(alert.reasons)}")
        if kind == "arrive":
            t0 = time.perf_counter()
            fused = svc.arrive(payload, use_llm=not args.no_llm)
            ms = (time.perf_counter() - t0) * 1000
            latencies.append((payload.patient_id, ms, fused.llm is not None))
            flag = " FLAG" if fused.clinician_flag else ""
            surge = " [SURGE:rules-only]" if fused.llm is None and not args.no_llm else ""
            print(f"[t={svc.clock.now_min:5.1f}] ARRIVE {payload.patient_id} "
                  f"-> ESI-{fused.esi} {fused.route} ({fused.confidence}){flag}"
                  f"{surge}  {ms:.0f}ms")
        else:
            pid, vitals = payload
            result = svc.record_vitals(pid, vitals)
            if result["alert"] is not None:
                print(f"[t={svc.clock.now_min:5.1f}] ALERT {result['alert'].kind} {pid}: "
                      f"{'; '.join(result['alert'].reasons)}")
                if result["retriaged"] is not None:
                    print(f"[t={svc.clock.now_min:5.1f}] RE-TRIAGE {pid} "
                          f"-> ESI-{result['retriaged'].esi} {result['retriaged'].route}")
            else:
                print(f"[t={svc.clock.now_min:5.1f}] recheck {pid}: stable")

    # let the waiting room age so wait-breach alerts fire
    for alert in svc.advance_clock(45):
        print(f"[t={alert.at_min:5.1f}] ALERT {alert.kind} {alert.patient_id}: "
              f"{'; '.join(alert.reasons)}")

    print("\n--- reassessment queue (top 8 by priority) ---")
    for row in svc.queue_view()[:8]:
        print(f"  {row['priority']:6.3f}  {row['patient_id']:8s} ESI-{row['esi']} "
              f"{row['status']:13s} waited {row['waited_min']:5.1f} min  "
              f"{row['chief_complaint'][:44]}")

    counts: dict[str, int] = {}
    for e in svc.audit.all_events():
        counts[e["event_type"]] = counts.get(e["event_type"], 0) + 1
    llm_used = sum(1 for _, _, used in latencies if used)
    mean_ms = sum(ms for _, ms, _ in latencies) / len(latencies)
    print(f"\naudit events: {counts}")
    print(f"arrivals: {len(latencies)} | llm path used: {llm_used} | "
          f"mean triage latency: {mean_ms:.0f}ms | surge={svc.surge_mode}")


if __name__ == "__main__":
    main()
