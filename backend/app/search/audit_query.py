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


def _boolean(raw):
    if isinstance(raw, bool):
        return raw
    word = str(raw).strip().lower()
    if word in ("true", "1", "yes"):
        return True
    if word in ("false", "0", "no"):
        return False
    raise ValueError(f"expected true or false, got {raw!r}")


# name -> (SQL expression, how to read it off a query string). Payload fields
# are read through DuckDB's JSON extraction; nothing is interpolated into the
# statement but these fixed expressions. This table is the whole vocabulary,
# for the module and for the route, so the two cannot drift.
FIELDS = {
    "event_type": ("event_type", str),
    "patient_id": ("patient_id", str),
    "clinician_id": ("json_extract_string(payload, '$.clinician_id')", str),
    "kind": ("json_extract_string(payload, '$.kind')", str),
    "cell": ("json_extract_string(payload, '$.cell')", str),
    "confidence": ("json_extract_string(payload, '$.confidence')", str),
    "esi": ("CAST(json_extract(payload, '$.esi') AS BIGINT)", int),
    "new_esi": ("CAST(json_extract(payload, '$.new_esi') AS BIGINT)", int),
    "original_esi": ("CAST(json_extract(payload, '$.original_esi') AS BIGINT)", int),
    "paths_agree": ("CAST(json_extract(payload, '$.paths_agree') AS BOOLEAN)", _boolean),
    "clinician_flag": ("CAST(json_extract(payload, '$.clinician_flag') AS BOOLEAN)",
                       _boolean),
    "surge_mode": ("CAST(json_extract(payload, '$.surge_mode') AS BOOLEAN)", _boolean),
    "under_triage": ("CAST(json_extract(payload, '$.under_triage') AS BOOLEAN)",
                     _boolean),
}

WINDOW = {"since_min": float, "until_min": float}

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
        where.append(f"{FIELDS[name][0]} = ?")
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


def parse_query(params: dict) -> dict:
    """Read a query string into search() arguments, refusing any name outside
    the vocabulary.

    The route needs this rather than a parameter per field: a framework
    ignores query parameters it was not declared to expect, so a typo in a
    compliance filter would come back as a confidently unfiltered answer.
    """
    filters, kwargs = {}, {}
    for name, raw in params.items():
        if name in FIELDS:
            filters[name] = FIELDS[name][1](raw)
        elif name in WINDOW:
            kwargs[name] = WINDOW[name](raw)
        elif name == "limit":
            kwargs["limit"] = int(raw)
        else:
            raise ValueError(
                f"cannot filter the audit trail on {name!r}; known filters are "
                f"{', '.join(sorted([*FIELDS, *WINDOW, 'limit']))}")
    got = kwargs.get("limit", DEFAULT_LIMIT)
    if not 1 <= got <= MAX_LIMIT:
        raise ValueError(f"limit must be between 1 and {MAX_LIMIT}")
    return {"filters": filters, **kwargs}
