"""Group Relative Policy Optimization over the experience repository.

GRPO's core estimator (Doctor-R1's training algorithm): score a GROUP of
candidate actions with the reward model, normalize each reward against the
group mean and standard deviation to get critic-free advantages, and step
the policy toward positive-advantage actions. Here the policy is the tabular
escalation policy the prototype actually learns (the calibration table over
category x age-band cells), the reward model is the multi-axis RewardVector,
and each logged episode contributes its factual outcome plus the
counterfactual outcome of the escalated recommendation - the two candidates
GRPO compares. The safety projection is structural: the resulting policy can
only hold or escalate a cell, never downgrade, because the calibration
consumer clamps adjustments to {0, +1}.

Model-weight fine-tuning is deliberately out of scope ("LLM orchestration,
not model training"); this optimizer trains the decision layer where the
override signal actually accumulates.
"""

import math
from dataclasses import dataclass

from app.audit.log import AuditLog
from app.learning.loop import compute_reward_vector

LEARN_RATE = 1.0


@dataclass(frozen=True)
class Experience:
    cell: str                  # "category|age_band"
    recommended_esi: int
    clinician_esi: int | None  # None = accepted as recommended
    reward: float              # RewardVector.total of the factual episode
    # the episode's soft-axis context, carried so counterfactuals are priced
    # in the same context as the factual action (axis-free events score clean)
    communication: float = 1.0
    documentation: float = 1.0


def experiences_from_audit(audit: AuditLog) -> list[Experience]:
    """The experience repository: reward events (overrides) and acceptances."""
    out = []
    for e in audit.all_events():
        p = e["payload"]
        axes = p.get("reward_axes") or {}
        soft = {"communication": axes.get("communication", 1.0),
                "documentation": axes.get("documentation", 1.0)}
        if e["event_type"] == "reward" and "cell" in p and "recommended_esi" in p:
            out.append(Experience(cell=p["cell"],
                                  recommended_esi=p["recommended_esi"],
                                  clinician_esi=p["clinician_esi"],
                                  reward=p["reward"], **soft))
        elif e["event_type"] == "acceptance" and "cell" in p:
            out.append(Experience(cell=p["cell"], recommended_esi=p["esi"],
                                  clinician_esi=None, reward=p["reward"], **soft))
    return out


def _counterfactual_reward(exp: Experience) -> float:
    """Reward the escalated candidate would have earned against the same
    clinician judgment (an acceptance means the clinician's level WAS the
    recommendation, so escalating it would have over-triaged). Soft axes are
    the episode's context, not the action's - reuse the factual values so
    they shift whole episodes within a group, never the hold-vs-escalate gap."""
    escalated = max(1, exp.recommended_esi - 1)
    target = exp.clinician_esi if exp.clinician_esi is not None else exp.recommended_esi
    vec = compute_reward_vector(escalated, target, dual_chain=True)
    return vec.model_copy(update={"communication": exp.communication,
                                  "documentation": exp.documentation}).total


def optimize(experiences: list[Experience], lr: float = LEARN_RATE) -> dict[str, float]:
    """Return calibration cells (sigmoid of the escalation logit per cell);
    cells with no reward variance carry no signal and are omitted."""
    groups: dict[str, list[Experience]] = {}
    for exp in experiences:
        groups.setdefault(exp.cell, []).append(exp)

    policy: dict[str, float] = {}
    for cell, eps in groups.items():
        samples = []  # (action, reward): factual hold + counterfactual escalate
        for exp in eps:
            samples.append((0, exp.reward))
            samples.append((1, _counterfactual_reward(exp)))
        rewards = [r for _, r in samples]
        mean = sum(rewards) / len(rewards)
        var = sum((r - mean) ** 2 for r in rewards) / len(rewards)
        if var == 0:
            continue  # identical rewards either way: no gradient
        std = math.sqrt(var)
        logit = lr * sum(
            (r - mean) / std * (1 if action else -1) for action, r in samples
        ) / len(eps)
        policy[cell] = round(1.0 / (1.0 + math.exp(-logit)), 4)
    return policy
