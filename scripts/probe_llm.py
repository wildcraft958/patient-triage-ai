"""One-time connectivity probe for the OpenAI-compatible Bedrock gateway.

Run from repo root:  cd backend && uv run python ../scripts/probe_llm.py
Requires LLM_BASE_URL / LLM_API_KEY (and optionally LLM_MODEL) in .env.
"""

import sys

from openai import OpenAI

sys.path.insert(0, "backend") if "backend" not in sys.path[0] else None
from app.config import settings  # noqa: E402

if not settings.llm_base_url or not settings.llm_api_key:
    sys.exit("Fill LLM_BASE_URL and LLM_API_KEY in .env first (cp env.example .env).")

client = OpenAI(base_url=settings.llm_base_url, api_key=settings.llm_api_key)

try:
    models = [m.id for m in client.models.list()]
    print(f"Gateway exposes {len(models)} models:")
    for m in models:
        print(f"  - {m}")
except Exception as exc:
    print(f"/models not supported or failed ({exc}); relying on LLM_MODEL from .env")
    models = []

model = settings.llm_model or (models[0] if models else None)
if not model:
    sys.exit("No model available — set LLM_MODEL in .env.")

resp = client.chat.completions.create(
    model=model,
    max_tokens=50,
    messages=[{"role": "user", "content": "Reply with exactly: TRIAGE-LINK-OK"}],
)
print(f"\nRound trip via {model}: {resp.choices[0].message.content!r}")
print(f"Usage: {resp.usage}")
