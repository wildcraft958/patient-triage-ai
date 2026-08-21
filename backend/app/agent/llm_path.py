"""Path B: LLM clinical reasoning over the redacted intake.

Claude (on AWS Bedrock) reasons over the full clinical picture, grounded
in retrieved ESI handbook excerpts. Every response is disk-cached by
prompt hash so demo replays cost zero tokens. On any transport or parse
failure this path returns None and the FUSE layer falls back to
rules-only — the LLM is never a single point of failure.
"""

import hashlib
import json
import re

from app.agent import rag
from app.agent.fuse import LLMResult
from app.config import settings
from app.data_io import DATA_DIR
from app.models import PatientIntake

LLM_CACHE_DIR = DATA_DIR / "cache" / "llm"

SYSTEM = """You are the clinical reasoning path of a dual-path emergency department \
triage assistant. A deterministic ESI rules engine runs in parallel; your job is the \
contextual judgment rules cannot encode. You recommend — a licensed clinician makes \
every final decision.

ESI levels: 1 = requires immediate life-saving intervention; 2 = high-risk, confused/\
lethargic, severe distress, should not wait; 3 = needs two or more resources, stable \
vitals; 4 = one resource; 5 = no resources.

Rules you must follow:
- Weigh age-specific norms: pediatric and geriatric patients differ from adults at the \
same vital values. Watch for atypical presentations (silent ACS in elderly or diabetic \
patients, sepsis presenting as confusion in the elderly, occult infant sepsis).
- When torn between two levels, choose the MORE acute one. Never optimize for average \
accuracy over worst-case safety.
- confidence is your honest self-assessment in [0,1]; use lower values for ambiguous \
presentations.

Respond with ONLY a JSON object, no markdown fences:
{"esi": <1-5>, "confidence": <0.0-1.0>, "reasoning": ["step 1", "step 2", ...], \
"red_flags": ["..."]}"""


def build_user_prompt(intake: PatientIntake, redacted_complaint: str) -> str:
    v = intake.vitals
    age = f"{intake.age_months:.1f} months" if intake.age_months is not None \
        else f"{intake.age_years} years"
    vitals = ", ".join(
        f"{name}={val}" for name, val in [
            ("HR", v.hr), ("RR", v.rr), ("SpO2", v.spo2),
            ("TempC", v.temp_c), ("SBP", v.sbp), ("pain", v.pain),
        ] if val is not None
    ) or "NOT RECORDED"
    history = (
        f"medications: {', '.join(intake.medications) or 'none listed'}; "
        f"conditions: {', '.join(intake.conditions) or 'none listed'}"
        if intake.has_history
        else "NO PRIOR RECORD ON FILE (first-time patient — only observed data available)"
    )
    excerpts = rag.retrieve(f"{redacted_complaint} {intake.complaint_category}")
    excerpt_text = "\n".join(
        f"[ESI Handbook p.{c['page']}] {c['text'][:400]}" for c in excerpts
    ) or "(no relevant excerpts retrieved)"
    return (
        f"Patient (de-identified): age {age}, responsiveness {intake.responsiveness}\n"
        f"Chief complaint: {redacted_complaint}\n"
        f"Vitals: {vitals}\n"
        f"History: {history}\n\n"
        f"Relevant ESI handbook excerpts:\n{excerpt_text}"
    )


def _default_transport(system: str, user: str) -> str:
    from anthropic import AnthropicBedrockMantle

    client = AnthropicBedrockMantle(
        api_key=settings.llm_api_key, aws_region=settings.llm_region
    )
    resp = client.messages.create(
        model=settings.llm_model,
        max_tokens=700,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return resp.content[0].text


def _parse(raw: str) -> LLMResult:
    # reasoning models (Qwen3 family, Doctor-R1) prepend <think>...</think>
    cleaned = re.sub(r"<think>.*?(</think>|$)", "", raw, flags=re.DOTALL).strip()
    cleaned = re.sub(r"^```(json)?|```$", "", cleaned, flags=re.MULTILINE).strip()
    if "{" in cleaned:  # tolerate prose before/after the JSON object
        cleaned = cleaned[cleaned.index("{"): cleaned.rindex("}") + 1]
    data = json.loads(cleaned)
    data["esi"] = min(5, max(1, int(data["esi"])))
    data["confidence"] = min(1.0, max(0.0, float(data.get("confidence", 0.5))))
    return LLMResult(**data)


def assess(
    intake: PatientIntake,
    redacted_complaint: str,
    transport=None,
    use_cache: bool = True,
) -> LLMResult | None:
    # Cache only the real transport: injected test fakes must never hit disk
    use_cache = use_cache and transport is None
    transport = transport or _default_transport
    user = build_user_prompt(intake, redacted_complaint)
    key = hashlib.sha256(f"{settings.llm_model}|{SYSTEM}|{user}".encode()).hexdigest()
    cache_file = LLM_CACHE_DIR / f"{key}.json"

    if use_cache and cache_file.exists():
        return LLMResult(**json.loads(cache_file.read_text()))

    try:
        raw = transport(SYSTEM, user)
        result = _parse(raw)
    except (json.JSONDecodeError, KeyError, ValueError):
        try:  # one retry with a stricter instruction
            raw = transport(SYSTEM + "\nReturn ONLY the JSON object.", user)
            result = _parse(raw)
        except Exception:
            return None
    except Exception:
        return None

    if use_cache:
        LLM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(result.model_dump_json())
    return result
