"""FUSE orchestrator: combine Path A (rules) and Path B (LLM reasoning).

Deliberately tuned to bias toward escalation under uncertainty rather
than average accuracy (Round 2 brief): on disagreement the MORE ACUTE
level wins (lower ESI number), confidence drops, and the clinician is
flagged with both reasoning chains. Uncertainty never downgrades.
"""

from pydantic import BaseModel, Field

from app.models import RulesResult

ROUTES = {
    1: "Resuscitation",
    2: "Acute",
    3: "Acute (monitored waiting)",
    4: "Fast-Track",
    5: "Fast-Track / minor",
}


class LLMResult(BaseModel):
    esi: int
    confidence: float  # self-reported, 0-1
    reasoning: list[str]
    red_flags: list[str] = Field(default_factory=list)


class FusedResult(BaseModel):
    esi: int
    route: str
    confidence: str  # high | moderate | low
    paths_agree: bool
    clinician_flag: bool
    rules: RulesResult
    llm: LLMResult | None
    notes: list[str] = Field(default_factory=list)


def fuse(rules: RulesResult, llm: LLMResult | None) -> FusedResult:
    if llm is None:
        return FusedResult(
            esi=rules.esi,
            route=ROUTES[rules.esi],
            confidence="moderate",
            paths_agree=False,
            clinician_flag=rules.esi <= 2,
            rules=rules,
            llm=None,
            notes=["Rules-only mode: reasoning path unavailable (surge fast path or offline)"],
        )

    if rules.esi == llm.esi:
        confidence = "high" if llm.confidence >= 0.6 else "moderate"
        notes = ["Paths agree"]
        if confidence == "moderate":
            notes.append("Reasoning path reports low self-confidence")
        return FusedResult(
            esi=rules.esi,
            route=ROUTES[rules.esi],
            confidence=confidence,
            paths_agree=True,
            clinician_flag=False,
            rules=rules,
            llm=llm,
            notes=notes,
        )

    acute = min(rules.esi, llm.esi)
    more_acute_path = "rules" if rules.esi < llm.esi else "reasoning"
    return FusedResult(
        esi=acute,
        route=ROUTES[acute],
        confidence="low",
        paths_agree=False,
        clinician_flag=True,
        rules=rules,
        llm=llm,
        notes=[
            f"Paths disagree (rules ESI-{rules.esi} vs reasoning ESI-{llm.esi}): "
            f"taking the more acute level from the {more_acute_path} path - "
            "uncertainty never downgrades",
        ],
    )
