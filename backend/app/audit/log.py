"""Append-only audit trail (DuckDB).

Assumed jurisdiction: HIPAA (US). Every recommendation is logged with both
reasoning chains and confidence; a clinician override must legally record
the original recommendation, the new level, the clinician identifier, the
timestamp, and a stated reason - OverrideRecord makes the reason and
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
            "SELECT id, sim_min, event_type, payload FROM events "
            "WHERE patient_id = ? ORDER BY id",
            [patient_id],
        ).fetchall()
        return [
            {"id": r[0], "sim_min": r[1], "event_type": r[2],
             "payload": json.loads(r[3])}
            for r in rows
        ]

    def stats(self) -> dict:
        """Analytical rollup straight from DuckDB SQL over the audit trail -
        the reason this log is a columnar analytical store and not a row DB."""
        counts = dict(self.conn.execute(
            "SELECT event_type, COUNT(*) FROM events GROUP BY event_type"
        ).fetchall())
        overrides = counts.get("override", 0)
        decisions = overrides + counts.get("acceptance", 0)
        more_acute = self.conn.execute(
            "SELECT COUNT(*) FROM events WHERE event_type = 'override' "
            "AND CAST(payload->>'new_esi' AS INTEGER) "
            "  < CAST(payload->>'original_esi' AS INTEGER)"
        ).fetchone()[0]
        alerts_by_kind = dict(self.conn.execute(
            "SELECT payload->>'kind', COUNT(*) FROM events "
            "WHERE event_type = 'alert' GROUP BY 1"
        ).fetchall())
        mean_latency = self.conn.execute(
            "SELECT AVG(CAST(payload->>'latency_ms' AS DOUBLE)) FROM events "
            "WHERE event_type = 'triage'"
        ).fetchone()[0]
        axes = ["diagnostic_accuracy", "management_quality", "communication",
                "documentation", "safety"]
        axis_row = self.conn.execute(
            "SELECT " + ", ".join(
                f"AVG(CAST(json_extract_string(payload, '$.reward_axes.{a}') AS DOUBLE))"
                for a in axes
            ) + " FROM events WHERE json_extract(payload, '$.reward_axes') IS NOT NULL"
        ).fetchone()
        reward_axis_means = (
            {a: round(v, 3) for a, v in zip(axes, axis_row)}
            if axis_row and axis_row[0] is not None else None
        )
        return {
            "reward_axis_means": reward_axis_means,
            "events_by_type": counts,
            "override_rate_pct": (
                round(overrides / decisions * 100, 1) if decisions else None
            ),
            "overrides_toward_more_acute": more_acute,
            "alerts_by_kind": alerts_by_kind,
            "mean_triage_latency_ms": (
                round(mean_latency, 1) if mean_latency is not None else None
            ),
        }

    def all_events(self) -> list[dict]:
        # The sequence travels with the event: the console renders these as a
        # live list and needs a stable identity per row, or it keys them by
        # array position and one arrival rewrites the whole list.
        rows = self.conn.execute(
            "SELECT id, sim_min, patient_id, event_type, payload FROM events "
            "ORDER BY id"
        ).fetchall()
        return [
            {"id": r[0], "sim_min": r[1], "patient_id": r[2], "event_type": r[3],
             "payload": json.loads(r[4])}
            for r in rows
        ]
