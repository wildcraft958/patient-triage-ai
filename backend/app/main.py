from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import router
from app.config import REPO_ROOT, settings

app = FastAPI(title="PatientTriage.ai", version="0.1.0")


@app.on_event("startup")
def warm_intake_classifier() -> None:
    # eager-load the distilled classifier so its one-time model load never
    # lands inside a patient's triage latency (fail-safe if unavailable)
    from app.engine import complaint_ml

    complaint_ml.available()


app.include_router(router)
# same surface under /api for single-origin production serving
app.include_router(router, prefix="/api", include_in_schema=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "profile": settings.hospital_profile}


# Production: serve the built React app (site + console) from this process.
DIST = REPO_ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        candidate = DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
