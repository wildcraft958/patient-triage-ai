"""GRPO over the experience repository: group-relative advantages per
(category x age band) cell drive the escalation policy, and the safety
projection means the learned policy can only hold or escalate."""

from app.audit.log import AuditLog
from app.learning.grpo import Experience, experiences_from_audit, optimize
from app.learning.loop import CalibrationTable


def under_triage(cell, rec=3, clin=2):
    return Experience(cell=cell, recommended_esi=rec, clinician_esi=clin, reward=-1.0)


def accepted(cell, esi=3):
    return Experience(cell=cell, recommended_esi=esi, clinician_esi=None, reward=1.0)


def over_triage(cell, rec=3, clin=4):
    return Experience(cell=cell, recommended_esi=rec, clinician_esi=clin, reward=-0.2)


def test_consistent_under_triage_cell_learns_to_escalate():
    policy = optimize([under_triage("abdominal_pain|geriatric") for _ in range(4)])
    assert policy["abdominal_pain|geriatric"] > 0.5
    table = CalibrationTable()
    table.cells = policy
    assert table.apply("abdominal_pain", "geriatric", esi=3) == 2


def test_accepted_cell_stays_uncalibrated():
    policy = optimize([accepted("fever|adult") for _ in range(4)])
    assert policy.get("fever|adult", 0.0) < 0.5


def test_over_triage_cell_never_learns_to_downgrade():
    policy = optimize([over_triage("sprain|adult") for _ in range(4)])
    table = CalibrationTable()
    table.cells = policy
    # safety projection: the policy may escalate or hold, never downgrade
    assert table.apply("sprain", "adult", esi=4) in (3, 4)
    assert policy.get("sprain|adult", 0.0) < 0.5


def test_mixed_cell_follows_the_majority_signal():
    exps = [under_triage("chest_pain|adult") for _ in range(5)] + \
           [accepted("chest_pain|adult")]
    policy = optimize(exps)
    assert policy["chest_pain|adult"] > 0.5


def test_single_experience_still_learns_from_its_counterfactual():
    # GRPO's group here is {factual action, counterfactual escalation}
    policy = optimize([under_triage("sepsis_concern|geriatric")])
    assert policy["sepsis_concern|geriatric"] > 0.5


def test_experiences_extracted_from_the_audit_trail():
    audit = AuditLog(path=":memory:")
    audit.log("reward", "P1", 10.0, {
        "reward": -1.0, "under_triage": True, "cell": "fever|geriatric",
        "recommended_esi": 3, "clinician_esi": 2,
        "reward_axes": {"communication": 0.5, "documentation": 1.0},
    })
    audit.log("acceptance", "P2", 12.0, {
        "esi": 4, "clinician_id": "RN-07", "reward": 1.0,
        "cell": "sprain|adult",
    })
    audit.log("triage", "P3", 13.0, {"esi": 3})  # not an experience
    exps = experiences_from_audit(audit)
    assert len(exps) == 2
    assert exps[0].cell == "fever|geriatric" and exps[0].clinician_esi == 2
    assert exps[0].communication == 0.5  # carried from the logged axes
    assert exps[1].cell == "sprain|adult" and exps[1].clinician_esi is None
    assert exps[1].communication == 1.0  # axis-free legacy events default clean


def test_counterfactual_shares_the_factual_soft_axes():
    """The comm/doc context is the episode's, not the action's: the escalated
    counterfactual must be priced with the same values as the factual hold,
    so soft axes can never fabricate a factual-vs-counterfactual advantage."""
    from app.learning.grpo import _counterfactual_reward

    clean = Experience(cell="fever|adult", recommended_esi=3, clinician_esi=2,
                       reward=-1.0)
    sloppy = Experience(cell="fever|adult", recommended_esi=3, clinician_esi=2,
                        reward=-1.05, communication=0.5, documentation=1.0)
    assert _counterfactual_reward(sloppy) == _counterfactual_reward(clean) - 0.05
