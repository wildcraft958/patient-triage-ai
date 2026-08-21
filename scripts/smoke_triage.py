"""End-to-end smoke run: three curated patients through the live dual-path
pipeline (Presidio -> rules ∥ Claude -> FUSE). Run from backend/:

    uv run python ../scripts/smoke_triage.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.agent.graph import triage  # noqa: E402
from app.data_io import load_curated_patients  # noqa: E402

SMOKE_IDS = ["SIM-001", "SIM-005", "SIM-022"]

patients = {p.patient_id: p for p in load_curated_patients()}
for pid in SMOKE_IDS:
    p = patients[pid]
    state = triage(p)
    f = state["fused"]
    print(f"\n=== {pid}: {p.chief_complaint[:60]} (age {p.age_years}) ===")
    print(f"  rules: ESI-{f.rules.esi} | llm: "
          f"{'ESI-' + str(f.llm.esi) + f' conf={f.llm.confidence:.2f}' if f.llm else 'UNAVAILABLE'}")
    print(f"  FUSED: ESI-{f.esi} -> {f.route} | confidence={f.confidence} "
          f"| agree={f.paths_agree} | flag={f.clinician_flag}")
    if f.llm:
        for step in f.llm.reasoning[:3]:
            print(f"    - {step}")
    for note in f.notes:
        print(f"  note: {note}")
