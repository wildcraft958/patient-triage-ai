"""Fetch external datasets (not redistributed in this repo).

- MIMIC-IV-ED Demo v2.2 (PhysioNet, Open Database License) — 100-patient
  open-access subset with real triage and vital-sign tables.
- ED-Triage-Agent eval cases + ESI v4 Handbook (MIT, (c) Karthick T. Sharma,
  github.com/Karthick47v2/ED-Triage-Agent) — standardized ESI scenario sets
  used here as the evaluation benchmark and RAG source.

Run:  python3 scripts/fetch_data.py   (from repo root; stdlib only)
"""

import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

MIMIC_BASE = "https://physionet.org/files/mimic-iv-ed-demo/2.2/ed"
MIMIC_FILES = ["edstays.csv.gz", "triage.csv.gz", "vitalsign.csv.gz"]

ETA_BASE = "https://raw.githubusercontent.com/Karthick47v2/ED-Triage-Agent/main"
ETA_EVAL_FILES = [
    "eval/competency_cases.json",
    "eval/practice_cases.json",
    "eval/test_1.json",
    "eval/test_2.json",
    "eval/test_3.json",
    "eval/competency_cases_vital_signs_extracted.json",
    "eval/practice_cases_vital_signs_extracted.json",
    "eval/test_1_vital_signs_extracted.json",
    "eval/test_2_vital_signs_extracted.json",
    "eval/test_3_vital_signs_extracted.json",
]
ETA_HANDBOOK = "ESI_Handbook.pdf"


def fetch(url: str, dest: Path) -> None:
    if dest.exists():
        print(f"  skip (exists): {dest.relative_to(ROOT)}")
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  fetching {url}")
    urllib.request.urlretrieve(url, dest)


def main() -> None:
    print("MIMIC-IV-ED Demo v2.2 (PhysioNet, open access)")
    for name in MIMIC_FILES:
        fetch(f"{MIMIC_BASE}/{name}", DATA / "mimic-iv-ed-demo" / name)

    print("ED-Triage-Agent eval cases (MIT)")
    for path in ETA_EVAL_FILES:
        fetch(f"{ETA_BASE}/{path}", DATA / "esi_eval" / Path(path).name)

    print("ESI v4 Handbook (RAG source)")
    fetch(f"{ETA_BASE}/{ETA_HANDBOOK}", DATA / "esi_handbook" / ETA_HANDBOOK)

    print("done.")


if __name__ == "__main__":
    main()
