"""Governance search over the append-only audit trail.

A compliance reader asks questions the patient board cannot answer: every
override this shift, who acknowledged which alert, which triages the two paths
disagreed on. The trail is DuckDB with a JSON payload column, so those are SQL
questions rather than model questions.

Two properties matter more than the querying itself.

A field name cannot be bound as a SQL parameter, only a value can. So names
come from the allowlist below and an unrecognised one is refused rather than
ignored: silently dropping a filter would answer a different question from the
one asked and return rows that look like they passed it.

And a result that was cut short says so. A truncated compliance answer read as
complete is the same class of failure, and it is the one that matters when
someone is counting overrides.
"""

import json

# name -> SQL expression. Every payload field is read through DuckDB's JSON
# extraction; nothing is interpolated but these fixed expressions.
FIELDS = {
    "event_type": "event_type",
    "patient_id": "patient_id",
    "clinician_id": "json_extract_string(payload, '$.clinician_id')",
    "kind": "json_extract_string(payload, '$.kind')",
    "cell": "json_extract_string(payload, '$.cell')",
    "confidence": "json_extract_string(payload, '$.confidence')",
    "esi": "CAST(json_extract(payload, '$.esi') AS BIGINT)",
    "new_esi": "CAST(json_extract(payload, '$.new_esi') AS BIGINT)",
    "original_esi": "CAST(json_extract(payload, '$.original_esi') AS BIGINT)",
    "paths_agree": "CAST(json_extract(payload, '$.paths_agree') AS BOOLEAN)",
    "clinician_flag": "CAST(json_extract(payload, '$.clinician_flag') AS BOOLEAN)",
    "surge_mode": "CAST(json_extract(payload, '$.surge_mode') AS BOOLEAN)",
    "under_triage": "CAST(json_extract(payload, '$.under_triage') AS BOOLEAN)",
}

DEFAULT_LIMIT = 50
MAX_LIMIT = 500


def search(log, *, filters: dict | None = None, since_min: float | None = None,
           until_min: float | None = None, limit: int = DEFAULT_LIMIT) -> dict:
    """Matching audit events, newest first.

    Raises ValueError for a field outside FIELDS. That is deliberate: the
    caller asked to filter on something this trail cannot filter on, and
    returning unfiltered rows would misrepresent them as filtered.
    """
    filters = filters or {}
    unknown = sorted(set(filters) - set(FIELDS))
    if unknown:
        raise ValueError(
            f"cannot filter the audit trail on {', '.join(unknown)}; "
            f"known fields are {', '.join(sorted(FIELDS))}")

    limit = max(1, min(int(limit), MAX_LIMIT))
    where, params = [], []
    for name, value in filters.items():
        where.append(f"{FIELDS[name]} = ?")
        params.append(value)
    if since_min is not None:
        where.append("sim_min >= ?")
        params.append(float(since_min))
    if until_min is not None:
        where.append("sim_min <= ?")
        params.append(float(until_min))

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    # One row over the limit, so "there is more" is measured rather than
    # inferred from a full page.
    rows = log.conn.execute(
        f"SELECT id, sim_min, patient_id, event_type, payload FROM events "
        f"{clause} ORDER BY id DESC LIMIT ?",
        [*params, limit + 1],
    ).fetchall()

    truncated = len(rows) > limit
    return {
        "events": [
            {"id": r[0], "sim_min": r[1], "patient_id": r[2],
             "event_type": r[3], "payload": json.loads(r[4])}
            for r in rows[:limit]
        ],
        "truncated": truncated,
    }
