"""GRPO training pass over the experience repository.

    cd backend && uv run python ../scripts/train_policy.py [--write]

Reads every logged clinician action (overrides and acceptances) from the
audit trail, groups them by category x age-band cell, computes group-relative
advantages against the counterfactual escalated recommendation, and prints
the resulting escalation policy. --write saves it as the live calibration
table consumed by the triage service.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.audit.log import DEFAULT_DB, AuditLog  # noqa: E402
from app.learning.grpo import experiences_from_audit, optimize  # noqa: E402
from app.learning.loop import ESCALATE_THRESHOLD, CalibrationTable  # noqa: E402
from app.service import CALIBRATION_PATH  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default=str(DEFAULT_DB), help="audit trail to learn from")
    ap.add_argument("--write", action="store_true",
                    help="save the policy as the live calibration table")
    args = ap.parse_args()

    audit = AuditLog(path=args.db)
    experiences = experiences_from_audit(audit)
    print(f"experience repository: {len(experiences)} clinician actions "
          f"across {len({e.cell for e in experiences})} cells\n")

    policy = optimize(experiences)
    if not policy:
        print("no reward variance in any cell - nothing to learn yet")
        return

    print(f"{'cell':34s} {'n':>3s} {'policy':>7s}  action")
    for cell in sorted(policy, key=policy.get, reverse=True):
        n = sum(1 for e in experiences if e.cell == cell)
        escalates = policy[cell] >= ESCALATE_THRESHOLD
        print(f"{cell:34s} {n:3d} {policy[cell]:7.4f}  "
              f"{'ESCALATE +1 level at triage' if escalates else 'hold'}")

    if args.write:
        table = CalibrationTable(path=CALIBRATION_PATH)
        table.cells = policy
        table.save()
        print(f"\npolicy written -> {CALIBRATION_PATH}")


if __name__ == "__main__":
    main()
