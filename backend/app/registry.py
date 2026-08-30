"""The components doing the work, published as data.

Every field here is read from live configuration or from counters the
service already keeps. A registry that hand-wrote its own model names would
drift from the container the first time a default changed, which is exactly
the failure this file exists to make impossible.

Each component carries a short code, which the registry view renders and the
pipeline activity log uses to label events. The codes are published here so
there is one place to change them.

The organising idea is the trust boundary. Components upstream of redaction
see the patient as they arrived; everything downstream sees a de-identified
copy. The console draws the same split as a diagram; this is it as a list.
"""

from statistics import mean

PHI = "phi"                    # sees the patient record as it arrived
DEIDENTIFIED = "deidentified"  # receives a de-identified copy only

# The sharpest privacy statement the system can make: exactly one component
# sends anything off this machine, and it has only ever seen a redacted copy.
EGRESS = "clinical_reasoning"


def _stage_average(entries, stage: str, only_when: str | None = None) -> float | None:
    """Mean measured duration for one graph node, or None when the node was
    never timed. Returning 0.0 for an unmeasured component is
    indistinguishable from a real sub-millisecond measurement, and four of
    the eight components here have no stage of their own.

    `only_when` drops traces where the node returned without doing the work:
    the reasoning node is entered under surge and exits immediately, and
    averaging those in drags the published figure toward zero."""
    samples = [e.pipeline["stage_ms"][stage] for e in entries
               if e.pipeline and stage in e.pipeline.get("stage_ms", {})
               and (only_when is None or e.pipeline.get(only_when))]
    return round(mean(samples), 2) if samples else None


def snapshot(service) -> dict:
    from app.config import settings
    from app.engine.complaint import EXACT_KEYWORDS, KNOWN_CATEGORIES
    from app.engine.complaint_ml import EMBED_MODEL, available as ml_available
    from app.learning.loop import ESCALATE_THRESHOLD
    from app.privacy.redact import MIN_SCORE, PHI_ENTITIES
    from app.safety.pipeline import CORE_FIELDS

    # "minor" is in the known set but no tier of classify_category can return
    # it, so it is not a category the classifier routes into
    CATEGORIES_REACHABLE = KNOWN_CATEGORIES - {"minor"}
    entries = service.room_snapshot()
    runs = service.component_runs()
    rechecks = sum(len(e.vitals_history) - 1 for e in entries)
    alerts = sum(len(e.alerts) for e in entries)

    components = [
        {
            "id": "intake_classifier",
            "code": "CLS",
            "name": "Intake classifier",
            "kind": "learned",
            "stage": "Intake",
            "boundary": PHI,
            "status": "active" if ml_available() else "degraded",
            "implementation": f"deterministic keyword rules, then {EMBED_MODEL}",
            "summary": (
                f"Routes a free-text complaint into one of "
                f"{len(CATEGORIES_REACHABLE)} categories when the intake form "
                f"supplies none."
            ),
            "decides": "which complaint category the rules engine scores against",
            "cannot": "assign an acuity level; a high-risk category does raise the\n                       rules engine's floor, so it shapes one without setting it",
            "on_failure": (
                "falls back to the deterministic tier, "
                f"{sum(len(k) for _, k in EXACT_KEYWORDS)} keyword rules that need no model"
            ),
            "invocations": runs.get("intake_classifier", 0),
            "latency_ms": None,
        },
        {
            "id": "phi_redactor",
            "code": "RDX",
            "name": "PHI redaction",
            "kind": "deterministic",
            "stage": "Redaction",
            "boundary": PHI,
            "status": "active",
            "implementation": f"Microsoft Presidio on spaCy {settings.spacy_model}",
            "summary": (
                f"{len(PHI_ENTITIES)} identifier classes removed from free text "
                f"at a {MIN_SCORE} score floor, with Safe Harbor age aggregation."
            ),
            "decides": "what leaves the building",
            "cannot": "remove clinical signal: symptom durations are kept deliberately",
            "on_failure": "triage stops; no unredacted text ever reaches Path B",
            "invocations": runs.get("phi_redactor", 0),
            "latency_ms": _stage_average(entries, "redact"),
        },
        {
            "id": "rules_engine",
            "code": "ESI",
            "name": "ESI rules engine",
            "kind": "deterministic",
            "stage": "Path A",
            "boundary": PHI,
            "status": "active",
            "implementation": "ESI v4 decision points, hand-coded",
            "summary": (
                "Scores the untouched record against the published algorithm: "
                "life threat, high risk, resource count, danger-zone vitals."
            ),
            "decides": "a defensible level with a cited reason for every step",
            "cannot": "read context the algorithm has no decision point for",
            "on_failure": "cannot fail independently; it is the fallback for everything else",
            "invocations": runs.get("rules_engine", 0),
            "latency_ms": _stage_average(entries, "rules"),
        },
        {
            "id": "clinical_reasoning",
            "code": "LLM",
            "name": "Clinical reasoning",
            "kind": "language model",
            "stage": "Path B",
            "boundary": DEIDENTIFIED,
            "status": "active",
            "implementation": f"{settings.llm_model} over BM25 ESI-handbook retrieval",
            "summary": (
                "Reads the de-identified intake with handbook excerpts retrieved "
                "for the presentation, and argues a level."
            ),
            "decides": "an independent second opinion with its own reasoning chain",
            "cannot": "see a name, a record number or an exact age over 89",
            "on_failure": "the recommendation falls to Path A and says so on the card",
            "invocations": runs.get("clinical_reasoning", 0),
            "latency_ms": _stage_average(entries, "llm", only_when="reasoning_ran"),
            # the demo replays a committed cache, so the measured figure is a
            # disk read; saying so stops it being read as inference time
            "latency_note": "replayed from the committed cache in this build; "
                            "a live model call is 1 to 3 seconds",
        },
        {
            "id": "fusion_policy",
            "code": "FUS",
            "name": "Fusion policy",
            "kind": "policy",
            "stage": "Fusion",
            "boundary": DEIDENTIFIED,
            "status": "active",
            "implementation": "more-acute-wins on disagreement",
            "summary": (
                "Takes the more acute of the two levels and records the "
                "disagreement rather than hiding it."
            ),
            "decides": "the level shown to the clinician, and the confidence band",
            "cannot": "resolve a disagreement quietly: every one is flagged",
            "on_failure": "with one path missing it passes the surviving level through",
            "invocations": runs.get("fusion_policy", 0),
            "latency_ms": _stage_average(entries, "fuse"),
        },
        {
            "id": "calibration_loop",
            "code": "CAL",
            "name": "Learned calibration",
            "kind": "learned",
            "stage": "Calibration",
            "boundary": PHI,
            "status": "active",
            "implementation": "per complaint and age band, clinician-supervised",
            "summary": (
                f"{len(service.calibration.cells)} cells tracked, "
                f"{service._calibration_escalations} escalations applied since "
                f"this process started, against a table that persists. A cell "
                f"that passes {ESCALATE_THRESHOLD:.0%} starts escalating that "
                f"pattern on its own."
            ),
            "decides": "whether a pattern clinicians keep escalating is escalated up front",
            "cannot": "downgrade anyone; it only ever moves toward more acute",
            "on_failure": "an empty table is a no-op, and triage is unaffected",
            "invocations": runs.get("calibration_loop", 0),
            "latency_ms": None,
        },
        {
            "id": "acuity_monitor",
            "code": "MON",
            "name": "Waiting room monitor",
            "kind": "policy",
            "stage": "Monitoring",
            "boundary": PHI,
            "status": "active",
            "implementation": "POMDP acuity belief with hazard drift",
            "summary": (
                f"{len(entries)} patients tracked, {rechecks} vitals rechecks "
                f"folded in, {alerts} alerts raised this shift."
            ),
            "decides": "who is reassessed next, and when a patient is deteriorating",
            "cannot": "change a level a clinician has set",
            "on_failure": "the wait-limit clock still fires on its own",
            "invocations": runs.get("acuity_monitor", 0),
            "latency_ms": None,
        },
        {
            "id": "safety_monitor",
            "code": "SAF",
            "name": "Safety and bias monitor",
            "kind": "policy",
            "stage": "Safety",
            "boundary": PHI,
            "status": "active",
            "implementation": f"missing-vitals guard on {len(CORE_FIELDS)} core signs, age-band drift",
            "summary": (
                "Runs on every recommendation before it reaches the board, and "
                "watches assigned acuity by age band across the shift."
            ),
            "decides": "whether a recommendation is flagged for clinician review",
            "cannot": "block a clinician from deciding anything",
            "on_failure": "flags conservatively rather than staying silent",
            "invocations": runs.get("safety_monitor", 0),
            "latency_ms": None,
        },
    ]
    for c in components:
        c["egress"] = c["id"] == EGRESS
    return {
        "components": components,
        "boundary": {
            PHI: "Runs on the record as it arrived, on this machine",
            DEIDENTIFIED: "Receives a de-identified copy only",
        },
        "egress": "Transmits patient-derived data off this machine",
    }
