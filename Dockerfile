# PatientTriage.ai: single-container deployment (site + console + API).
# Runs key-free out of the box: the committed LLM replay cache serves full
# Claude reasoning for the demo scenario; anything uncached falls back to
# the deterministic rules path.

FROM node:20-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock backend/
RUN cd backend && uv sync --frozen --no-dev

COPY backend/ backend/
COPY scripts/ scripts/
COPY config/ config/
COPY data/ data/
COPY eval/ eval/
COPY --from=frontend /build/dist frontend/dist

# Fetch the ESI handbook, eval sets, and MIMIC demo (~3 MB) at build time
RUN cd backend && uv run python ../scripts/fetch_data.py

ENV HOSPITAL_PROFILE=urban_500
EXPOSE 7860
CMD ["sh", "-c", "cd backend && uv run uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
