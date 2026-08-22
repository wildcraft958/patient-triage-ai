"""POMDP core of the reassessment loop.

The hidden state is the patient's true acuity (ESI 1-5); the belief is a
probability distribution over it. Triage initializes the belief from the two
scoring paths (Path A/B disagreement IS the uncertainty), waiting time
advances it through a deterioration transition model, and every vitals
recheck - nurse spot-check, wearable stream, or kiosk self-report - is an
observation that updates it by Bayes rule. The reassessment priority policy
reads this belief; the assigned ESI level itself only ever changes through
re-triage or a clinician, never through belief drift.
"""

import math

from app.models import Vitals

LEVELS = 5  # ESI 1..5, index 0 = ESI-1 (most acute)

# P(observation | true acuity): rows sum to 1 across observation classes per
# state is not required - only relative likelihood across states matters.
OBS_LIKELIHOOD = {
    "danger":    [0.40, 0.30, 0.15, 0.10, 0.05],
    "worsening": [0.30, 0.28, 0.20, 0.14, 0.08],
    "stable":    [0.08, 0.14, 0.22, 0.28, 0.28],
    "improving": [0.05, 0.10, 0.20, 0.30, 0.35],
}

PRIOR_BASELINE = 0.5
RULES_WEIGHT = 3.0
LLM_WEIGHT = 2.0  # scaled by the LLM's own confidence


def _normalize(counts: list[float]) -> list[float]:
    total = sum(counts)
    return [c / total for c in counts]


def initial_belief(fused) -> list[float]:
    """Pseudo-count prior: agreement between the paths sharpens the belief,
    disagreement makes it bimodal, a missing LLM leaves it flat - so belief
    entropy and dual-path disagreement are the same quantity."""
    counts = [PRIOR_BASELINE] * LEVELS
    counts[fused.rules.esi - 1] += RULES_WEIGHT
    if fused.llm is not None:
        counts[fused.llm.esi - 1] += LLM_WEIGHT * fused.llm.confidence
    return _normalize(counts)


def advance(belief: list[float], minutes: float, hazard_per_hour: float) -> list[float]:
    """Transition model for waiting: probability mass drifts one level
    acute-ward at the deterioration hazard rate; ESI-1 is absorbing."""
    if minutes <= 0 or hazard_per_hour <= 0:
        return belief
    p = 1.0 - math.exp(-hazard_per_hour * minutes / 60.0)
    new = list(belief)
    new[0] = belief[0] + p * belief[1]
    for i in range(1, LEVELS - 1):
        new[i] = (1 - p) * belief[i] + p * belief[i + 1]
    new[LEVELS - 1] = (1 - p) * belief[LEVELS - 1]
    return _normalize(new)


def observe(belief: list[float], obs_class: str) -> list[float]:
    """Bayes update on a vitals recheck."""
    likelihood = OBS_LIKELIHOOD[obs_class]
    return _normalize([b * l for b, l in zip(belief, likelihood)])


def entropy(belief: list[float]) -> float:
    """Shannon entropy normalized to [0, 1] by the 5-level maximum."""
    h = -sum(p * math.log(p) for p in belief if p > 0)
    return h / math.log(LEVELS)


def p_more_acute(belief: list[float], esi: int) -> float:
    """Probability the true acuity is more acute than the assigned level."""
    return sum(belief[: esi - 1])


def classify_recheck(baseline: Vitals, vitals: Vitals, *,
                     danger: bool, worsening: bool) -> str:
    """Map a recheck to an observation class. Danger-zone and trend-worsening
    are decided upstream from the profile thresholds; here we only separate
    genuinely improving vitals from noise."""
    if danger:
        return "danger"
    if worsening:
        return "worsening"
    improved = (
        (baseline.hr is not None and vitals.hr is not None
         and vitals.hr <= baseline.hr * 0.95)
        or (baseline.spo2 is not None and vitals.spo2 is not None
            and vitals.spo2 >= baseline.spo2 + 2)
    )
    return "improving" if improved else "stable"
