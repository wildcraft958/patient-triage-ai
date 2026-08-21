# PatientTriage.ai

AI-assisted emergency department triage that does not stop at the door: it scores patients at arrival with a dual-path engine (deterministic ESI rules + LLM clinical reasoning), then keeps watching everyone in the waiting room and tells the nurse who to check on next.

Built by Team NamoFans (IIT Kharagpur) for the Accenture Innovation Challenge 2026, Round 2 — Problem Track 2.

> The system recommends. The clinician decides. Always.

## Status

Under active development for the 30 Aug 2026 submission. Full architecture, evaluation results, and run instructions land here as phases complete.

## Quick start (current state)

```bash
# Backend
cd backend
uv sync
uv run pytest
uv run uvicorn app.main:app --reload   # http://localhost:8000/health

# Frontend
cd frontend
npm install
npm run dev                            # http://localhost:5173

# LLM connectivity (needs .env — see env.example)
cd backend && uv run python ../scripts/probe_llm.py
```
