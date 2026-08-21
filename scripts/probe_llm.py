"""One-time connectivity probe for Claude on AWS Bedrock (Mantle endpoint).

Run:  cd backend && uv run python ../scripts/probe_llm.py
Requires LLM_API_KEY (and optionally LLM_REGION / LLM_MODEL) in .env or local.env.
"""

import sys
from pathlib import Path

from anthropic import AnthropicBedrockMantle

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.config import settings  # noqa: E402

if not settings.llm_api_key:
    sys.exit("Fill LLM_API_KEY in .env first (cp env.example .env).")

client = AnthropicBedrockMantle(api_key=settings.llm_api_key, aws_region=settings.llm_region)

resp = client.messages.create(
    model=settings.llm_model,
    max_tokens=32,
    messages=[{"role": "user", "content": "Reply with exactly: TRIAGE-LINK-OK"}],
)
print(f"Round trip via {settings.llm_model}: {resp.content[0].text!r}")
print(f"Usage: {resp.usage.input_tokens} in / {resp.usage.output_tokens} out")
