"""The triage pipeline as a LangGraph StateGraph.

    START -> redact (Presidio)
               |----> rules (Path A, deterministic)   \
               |----> llm   (Path B, Claude reasoning) -> fuse -> END

The two paths fan out in parallel after redaction; LangGraph's superstep
barrier joins them at the fuse node.
"""

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agent.fuse import FusedResult, LLMResult, fuse
from app.agent.llm_path import assess
from app.engine.esi_rules import score
from app.models import PatientIntake, RulesResult
from app.privacy.redact import aggregate_age, redact, redact_clinical_value


class TriageState(TypedDict, total=False):
    intake: PatientIntake
    use_llm: bool          # False = surge fast path / offline: rules only
    transport: Any         # injectable LLM transport for tests
    redacted_complaint: str
    llm_intake: PatientIntake  # de-identified copy; the only intake Path B sees
    phi_entities_removed: list[str]
    rules_result: RulesResult
    llm_result: LLMResult | None
    fused: FusedResult


def redact_node(state: TriageState) -> dict:
    intake = state["intake"]
    r = redact(intake.chief_complaint)
    entities = set(r.entities_removed)

    def redact_items(items: list[str]) -> list[str]:
        """Medications and conditions are coded fields, so they skip the
        name-class recognizers: a drug name read as a person both loses the
        clinical context and changes the prompt under a different spaCy
        model, which is how the deployed build and the benchmarked one
        drifted apart."""
        out = []
        for item in items:
            rr = redact_clinical_value(item)
            entities.update(rr.entities_removed)
            out.append(rr.text)
        return out

    update = {
        "medications": redact_items(intake.medications),
        "conditions": redact_items(intake.conditions),
        # Safe Harbor: the exact age of a patient over 89 never leaves the
        # building. The rules path scores the untouched intake.
        "age_years": aggregate_age(intake.age_years),
    }
    if intake.oldcarts is not None:
        oc = intake.oldcarts.model_dump()
        for field_name, value in oc.items():
            if isinstance(value, str):
                rr = redact(value)
                entities.update(rr.entities_removed)
                oc[field_name] = rr.text
        update["oldcarts"] = type(intake.oldcarts)(**oc)
    llm_intake = intake.model_copy(update=update)
    return {"redacted_complaint": r.text, "llm_intake": llm_intake,
            "phi_entities_removed": sorted(entities)}


def rules_node(state: TriageState) -> dict:
    return {"rules_result": score(state["intake"])}


def llm_node(state: TriageState) -> dict:
    if not state.get("use_llm", True):
        return {"llm_result": None}
    result = assess(
        state["llm_intake"],
        state["redacted_complaint"],
        transport=state.get("transport"),
    )
    return {"llm_result": result}


def fuse_node(state: TriageState) -> dict:
    return {"fused": fuse(state["rules_result"], state["llm_result"])}


def _build():
    builder = StateGraph(TriageState)
    builder.add_node("redact", redact_node)
    builder.add_node("rules", rules_node)
    builder.add_node("llm", llm_node)
    builder.add_node("fuse", fuse_node)
    builder.add_edge(START, "redact")
    builder.add_edge("redact", "rules")
    builder.add_edge("redact", "llm")
    builder.add_edge("rules", "fuse")
    builder.add_edge("llm", "fuse")
    builder.add_edge("fuse", END)
    return builder.compile()


_graph = _build()


def triage(intake: PatientIntake, use_llm: bool = True, transport=None) -> TriageState:
    """Run one patient through the full dual-path pipeline."""
    return _graph.invoke({"intake": intake, "use_llm": use_llm, "transport": transport})
