#!/usr/bin/env python
"""Prompt-cache gate: does every prompt we will ask for still have an answer?

The deployed demo replays committed model answers instead of calling out.
`assess()` keys its cache on sha256(model | SYSTEM | user_prompt), so a change
to the system prompt, the prompt builder, the redaction pass, the age
aggregation or the retrieved handbook excerpts changes every key at once. Every
patient then silently falls back to rules-only: no error, no log, just a demo
that quietly stops showing the thing it is there to show. That silence is what
makes this worth a gate rather than a code review.

Run it from backend/ so the app package and its data resolve:

    cd backend && uv run python ../scripts/cache_gate.py

Exits non-zero if any prompt the demo or the benchmark will ask for has no
committed answer.
"""

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.agent.graph import redact_node                     # noqa: E402
from app.agent.llm_path import LLM_CACHE_DIR, SYSTEM, build_user_prompt  # noqa: E402
from app.config import settings                             # noqa: E402
from app.data_io import load_curated_patients, load_esi_eval_cases  # noqa: E402
from app.evalmap import case_to_intake                      # noqa: E402
from app.privacy.redact import redact                       # noqa: E402


def key_for(intake, redacted_complaint: str) -> str:
    user = build_user_prompt(intake, redacted_complaint)
    return hashlib.sha256(
        f"{settings.llm_model}|{SYSTEM}|{user}".encode()).hexdigest()


def demo_prompts():
    """The 24 curated patients, through the same redaction node the live
    service runs, so the intake hashed here is the de-identified copy Path B
    actually sees rather than the raw record."""
    for patient in load_curated_patients():
        state = redact_node({"intake": patient})
        yield patient.patient_id, key_for(state["llm_intake"],
                                          state["redacted_complaint"])


def eval_prompts():
    """Every published ESI case. run_eval.py passes the untouched intake and
    only the complaint redacted, so this mirrors that rather than the demo
    path: the two differ, and a gate that assumed otherwise would report
    misses that are not real."""
    for case in load_esi_eval_cases():
        intake, _ = case_to_intake(case)
        yield (f"{case['set']}#{case['scenario_number']}",
               key_for(intake, redact(intake.chief_complaint).text))


def main() -> int:
    committed = {p.stem for p in LLM_CACHE_DIR.glob("*.json")}
    print(f"model     : {settings.llm_model}")
    print(f"cache dir : {LLM_CACHE_DIR}  ({len(committed)} committed answers)\n")

    seen, missing, total = set(), [], 0
    for label, source in (("demo", demo_prompts), ("eval", eval_prompts)):
        gone = []
        n = 0
        for name, key in source():
            n += 1
            seen.add(key)
            if key not in committed:
                gone.append(name)
        total += n
        missing += gone
        state = "ok" if not gone else f"{len(gone)} MISSING"
        print(f"{label:5} {n:4} prompts   {state}")
        for name in gone[:10]:
            print(f"        no answer for {name}")
        if len(gone) > 10:
            print(f"        ... and {len(gone) - 10} more")

    orphans = len(committed - seen)
    print(f"\n{total} prompts, {len(missing)} without an answer, "
          f"{orphans} committed answers no longer asked for")

    if missing:
        print("\nFAIL: the prompt changed. Every one of those patients now "
              "falls back to rules-only in the deployed demo.")
        return 1
    print("\nPASS: every prompt the demo and the benchmark ask for has a "
          "committed answer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
