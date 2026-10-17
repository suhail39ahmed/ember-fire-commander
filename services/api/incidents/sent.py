"""The reports a volunteer sent today, for the sent card and its list (#131).

Read from the volunteer's own observations and the join records agents wrote for them. Nothing is guessed:
a report that agents has not placed yet has `join: null`, and the phone then says nothing about an incident.
"""
from datetime import datetime, timedelta, timezone

from incidents import rules, store
from observations.store import JOINS_COLLECTION, join_view

DEFAULT_HOURS = 24
# However early the phone says its day began, the list never reaches back further than this.
MAX_HOURS = 48
LIMIT = 50
FIELDS = ("capturedAt", "receivedAt", "source", "chip", "text", "accuracyM")


def window_start(raw, now=None):
    """The instant the list starts from.

    `raw` is the phone's own start of day as an ISO time with a zone (`2026-10-16T00:00:00+05:30`). A missing,
    unreadable, zone-less or future value means the last 24 hours, and an earlier one is held to 48 hours.
    """
    now = now or datetime.now(timezone.utc)
    default = now - timedelta(hours=DEFAULT_HOURS)
    # A `+` that arrived unencoded in a query string is read as a space.
    parsed = rules._parse(raw.strip().replace(" ", "+")) if isinstance(raw, str) and raw.strip() else None
    if parsed is None or parsed.tzinfo is None or parsed > now:
        return default
    return max(parsed, now - timedelta(hours=MAX_HOURS))


def sent_today(volunteer_id, raw_since, now=None):
    """This volunteer's reports received since `raw_since`, oldest first, at most 50 (the newest ones)."""
    since = window_start(raw_since, now)
    rows = []
    for snap in store.where(store.OBSERVATIONS, "volunteerId", "==", volunteer_id):
        data = snap.to_dict() or {}
        received = rules._parse(data.get("receivedAt")) if data.get("receivedAt") else None
        if received is not None and received.tzinfo is None:
            received = received.replace(tzinfo=timezone.utc)
        if received is not None and received >= since:
            rows.append((received, snap.id, data))
    rows.sort(key=lambda r: (r[0], r[1]))
    rows = rows[-LIMIT:]
    joins = {i: (s.to_dict() or {}) for i, s in store.get_many(JOINS_COLLECTION, [r[1] for r in rows]).items()}
    incidents = {i: (s.to_dict() or {}) for i, s in store.get_many(store.INCIDENTS, {j.get("incidentId") for j in joins.values() if j.get("incidentId")}).items()}
    items = []
    for _, observation_id, data in rows:
        join = joins.get(observation_id)
        item = {"id": observation_id, **rules.pick(data, FIELDS)}
        if isinstance(data.get("clientId"), str):
            item["clientId"] = data["clientId"]
        item["join"] = join_view(join, incidents.get(join.get("incidentId"))) if join else None
        items.append(item)
    return items
