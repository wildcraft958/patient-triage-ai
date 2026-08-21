"""Append-only audit trail (DuckDB).

Assumed jurisdiction: HIPAA (US). Every recommendation is logged with both
reasoning chains and confidence; a clinician override must legally record
the original recommendation, the new level, the clinician identifier, the
timestamp, and a stated reason — OverrideRecord makes the reason and
clinician mandatory at the type level, so an incomplete override cannot
even be constructed.
"""

import json

import duckdb
from pydantic import BaseModel, Field

from app.config import REPO_ROOT

DEFAULT_DB = REPO_ROOT / "data" / "audit.duckdb"


class OverrideRecord(BaseModel):
    original_esi: int
    new_esi: int
    clinician_id: str = Field(min_length=1)
    reason: str = Field(min_length=3)
    sim_min: float


class AuditLog:
    def __init__(self, path: str | None = None):
        db = path if path is not None else str(DEFAULT_DB)
        if db != ":memory:":
            DEFAULT_DB.parent.mkdir(parents=True, exist_ok=True)
        self.conn = duckdb.connect(db)
        self.conn.execute("""
            CREATE SEQUENCE IF NOT EXISTS event_seq;
            CREATE TABLE IF NOT EXISTS events (
                id BIGINT DEFAULT nextval('event_seq'),
                ts_wall TIMESTAMP DEFAULT current_timestamp,
                sim_min DOUBLE,
                patient_id TEXT,
                event_type TEXT,
                payload JSON
            )
        """)

    def log(self, event_type: str, patient_id: str, sim_min: float, payload: dict) -> None:
        self.conn.execute(
            "INSERT INTO events (sim_min, patient_id, event_type, payload) VALUES (?, ?, ?, ?)",
            [sim_min, patient_id, event_type, json.dumps(payload)],
        )

    def log_override(self, patient_id: str, record: OverrideRecord) -> None:
        self.log("override", patient_id, record.sim_min, record.model_dump())

    def events_for(self, patient_id: str) -> list[dict]:
        rows = self.conn.execute(
            "SELECT sim_min, event_type, payload FROM events "
            "WHERE patient_id = ? ORDER BY id",
            [patient_id],
        ).fetchall()
        return [
            {"sim_min": r[0], "event_type": r[1], "payload": json.loads(r[2])}
            for r in rows
        ]

    def all_events(self) -> list[dict]:
        rows = self.conn.execute(
            "SELECT sim_min, patient_id, event_type, payload FROM events ORDER BY id"
        ).fetchall()
        return [
            {"sim_min": r[0], "patient_id": r[1], "event_type": r[2],
             "payload": json.loads(r[3])}
            for r in rows
        ]
