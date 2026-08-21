"""Benchmark the triage pipeline on published ESI case sets.

    cd backend && uv run python ../eval/run_eval.py --sets practice_cases competency_cases
    cd backend && uv run python ../eval/run_eval.py --sets test_1 test_2 test_3

Reports the same metrics as ED-Triage-Agent (medRxiv 2026) and TriageAgent
(EMNLP 2024 Findings) so results are directly comparable:
exact accuracy, within-1, under-triage, significant under-triage,
over-triage, significant over-triage, high-acuity (ESI 1-2) sensitivity.

Configs: rules (Path A only), llm (Path B only), fused (full dual-path).
LLM responses hit the on-disk replay cache, so re-runs are free.
"""

import argparse
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.agent.fuse import fuse  # noqa: E402
from app.agent.llm_path import assess  # noqa: E402
from app.data_io import DATA_DIR, load_esi_eval_cases  # noqa: E402
from app.engine.esi_rules import score  # noqa: E402
from app.evalmap import case_to_intake  # noqa: E402
from app.privacy.redact import redact  # noqa: E402

RESULTS_DIR = Path(__file__).resolve().parent / "results"

TRANSPORT = None  # None = Claude on Bedrock (assess's built-in cached default)


def local_openai_transport(base_url: str, model: str):
    """Transport for any OpenAI-compatible local server (mlx_lm.server,
    Ollama) with its own disk cache, e.g. Doctor-R1 in hospital-local mode."""
    import urllib.request

    cache_dir = DATA_DIR / "cache" / "llm_local" / model.replace("/", "_")
    cache_dir.mkdir(parents=True, exist_ok=True)

    def transport(system: str, user: str) -> str:
        key = hashlib.sha256(f"{model}|{system}|{user}".encode()).hexdigest()
        cache_file = cache_dir / f"{key}.txt"
        if cache_file.exists():
            return cache_file.read_text()
        body = json.dumps({
            "model": model, "max_tokens": 2500, "temperature": 0.0,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
        }).encode()
        req = urllib.request.Request(
            f"{base_url.rstrip('/')}/chat/completions", data=body,
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=600) as r:
            text = json.load(r)["choices"][0]["message"]["content"]
        cache_file.write_text(text)
        return text

    return transport


def evaluate_case(case: dict) -> dict:
    intake, age_defaulted = case_to_intake(case)
    rules_result = score(intake)
    llm_result = assess(intake, redact(intake.chief_complaint).text,
                        transport=TRANSPORT)
    fused_result = fuse(rules_result, llm_result)
    return {
        "id": intake.patient_id,
        "truth": case["category"],
        "rules": rules_result.esi,
        "llm": llm_result.esi if llm_result else None,
        "fused": fused_result.esi,
        "paths_agree": fused_result.paths_agree,
        "age_defaulted": age_defaulted,
    }


def metrics(pairs: list[tuple[int, int]]) -> dict:
    n = len(pairs)
    high_acuity = [(t, p) for t, p in pairs if t <= 2]
    return {
        "n": n,
        "exact_acc": sum(p == t for t, p in pairs) / n * 100,
        "within_1": sum(abs(p - t) <= 1 for t, p in pairs) / n * 100,
        "under_triage": sum(p > t for t, p in pairs) / n * 100,
        "sig_under_triage": sum(p - t >= 2 for t, p in pairs) / n * 100,
        "over_triage": sum(p < t for t, p in pairs) / n * 100,
        "sig_over_triage": sum(t - p >= 2 for t, p in pairs) / n * 100,
        "high_acuity_sens": (
            sum(p <= 2 for t, p in high_acuity) / len(high_acuity) * 100
            if high_acuity else None
        ),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets", nargs="+", required=True)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--local-url", default=None,
                    help="OpenAI-compatible server, e.g. http://localhost:8080/v1")
    ap.add_argument("--local-model", default="doctor-r1-4bit")
    ap.add_argument("--tag", default=None, help="suffix for the results file")
    args = ap.parse_args()

    global TRANSPORT
    if args.local_url:
        TRANSPORT = local_openai_transport(args.local_url, args.local_model)
        print(f"backend: local {args.local_model} at {args.local_url}")

    cases = load_esi_eval_cases(args.sets)
    if args.limit:
        cases = cases[: args.limit]
    print(f"evaluating {len(cases)} cases from {args.sets} "
          f"({args.workers} workers, cache-backed)")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(evaluate_case, cases))

    llm_failures = sum(1 for r in rows if r["llm"] is None)
    if llm_failures:
        print(f"WARNING: {llm_failures} cases fell back to rules-only "
              f"(LLM transport/parse failure)")

    report = {"sets": args.sets, "n": len(rows), "llm_failures": llm_failures,
              "age_defaulted": sum(r["age_defaulted"] for r in rows),
              "configs": {}}
    for config in ["rules", "llm", "fused"]:
        pairs = [(r["truth"], r[config]) for r in rows if r[config] is not None]
        if pairs:
            report["configs"][config] = metrics(pairs)

    RESULTS_DIR.mkdir(exist_ok=True)
    suffix = f"_{args.tag}" if args.tag else ""
    out = RESULTS_DIR / f"{'_'.join(args.sets)}{suffix}.json"
    out.write_text(json.dumps({"report": report, "rows": rows}, indent=1))

    header = (f"{'config':7s} {'n':>4s} {'exact':>6s} {'w/in1':>6s} {'under':>6s} "
              f"{'sigUn':>6s} {'over':>6s} {'sigOv':>6s} {'hiAcSens':>8s}")
    print("\n" + header)
    for config, m in report["configs"].items():
        sens = f"{m['high_acuity_sens']:.1f}" if m["high_acuity_sens"] is not None else "n/a"
        print(f"{config:7s} {m['n']:4d} {m['exact_acc']:6.1f} {m['within_1']:6.1f} "
              f"{m['under_triage']:6.1f} {m['sig_under_triage']:6.1f} "
              f"{m['over_triage']:6.1f} {m['sig_over_triage']:6.1f} {sens:>8s}")
    print(f"\nsaved -> {out}")


if __name__ == "__main__":
    main()
