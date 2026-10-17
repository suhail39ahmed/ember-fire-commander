"""Live incidents near a volunteer's phone, for `GET /digest?lat=&lng=` (contract 5.6).

The phone's position is read from the request and used for this read only. It
is never stored. Wind and what a supervisor asked for are not here, because no
service stores them.
"""
import math
import os

from incidents import detail, rules, store
from incidents.errors import validation

DEFAULT_RADIUS_M = 5000
LIMIT = 5


def radius_m():
    """`EMBER_NEARBY_RADIUS_M`, else 5000. A bad or non-positive value falls back to the default."""
    try:
        value = float(os.getenv("EMBER_NEARBY_RADIUS_M", DEFAULT_RADIUS_M))
    except ValueError:
        return DEFAULT_RADIUS_M
    return value if value > 0 else DEFAULT_RADIUS_M


def parse_position(args):
    """(lat, lng) from the query string, None when neither is sent, 400 when only one is or a value is out of range."""
    raw_lat, raw_lng = args.get("lat"), args.get("lng")
    if raw_lat is None and raw_lng is None:
        return None
    if raw_lat is None:
        raise validation("lat", "send lat together with lng")
    if raw_lng is None:
        raise validation("lng", "send lng together with lat")
    lat = _number("lat", raw_lat, 90)
    lng = _number("lng", raw_lng, 180)
    return lat, lng


def _number(field, raw, limit):
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise validation(field, f"send a number from -{limit} to {limit}") from None
    if not math.isfinite(value) or abs(value) > limit:
        raise validation(field, f"send a number from -{limit} to {limit}")
    return value


def bearing_deg(lat1, lng1, lat2, lng2):
    """Compass bearing from point 1 to point 2, a whole number from 0 to 359."""
    rad = math.pi / 180
    d_lng = (lng2 - lng1) * rad
    y = math.sin(d_lng) * math.cos(lat2 * rad)
    x = math.cos(lat1 * rad) * math.sin(lat2 * rad) - math.sin(lat1 * rad) * math.cos(lat2 * rad) * math.cos(d_lng)
    return round(math.degrees(math.atan2(y, x)) + 360) % 360


def _crew(incident_id, observations):
    """Distinct volunteers with a report or an approved task on the incident."""
    ids = {(obs.to_dict() or {}).get("volunteerId") for obs in observations}
    for snap in store.where(store.TASKS, "incidentId", "==", incident_id):
        task = snap.to_dict() or {}
        if task.get("status") == "approved":
            ids.add(task.get("volunteerId"))
    return {i for i in ids if i}


def _first_reporter(observations):
    """The volunteer id on the earliest report, or None."""
    ordered = sorted(observations, key=lambda s: str((s.to_dict() or {}).get("capturedAt") or ""))
    for snap in ordered:
        volunteer_id = (snap.to_dict() or {}).get("volunteerId")
        if volunteer_id:
            return volunteer_id
    return None


def nearby_incidents(position, linked_ids):
    """Live incidents within the radius that the caller is not linked to, nearest first, at most LIMIT."""
    lat, lng = position
    limit_m = radius_m()
    candidates = []
    for snap in store.where(store.INCIDENTS, "status", "in", list(rules.LIVE_STATUSES)):
        if snap.id in linked_ids:
            continue
        data = snap.to_dict() or {}
        distance = detail.distance_m(lat, lng, data.get("lat"), data.get("lng"))
        if distance is None or distance > limit_m:
            continue
        candidates.append((distance, snap))
    candidates.sort(key=lambda pair: (pair[0], pair[1].id))

    rows = []
    for distance, snap in candidates[:LIMIT]:
        data = snap.to_dict() or {}
        report_ids = [i for i in (data.get("observationIds") or []) if isinstance(i, str) and i]
        observations = list(store.get_many(store.OBSERVATIONS, report_ids).values())
        record = rules.to_record(snap, rules.SUMMARY_FIELDS)
        record["distanceM"] = distance
        record["bearingDeg"] = bearing_deg(lat, lng, data["lat"], data["lng"])
        record["crewOnSite"] = len(_crew(snap.id, observations))
        record["_reporter"] = _first_reporter(observations)
        rows.append((record, data))

    names = detail.volunteer_names({r["id"]: d for r, d in rows}, [r["_reporter"] for r, _ in rows])
    result = []
    for record, _ in rows:
        reporter = record.pop("_reporter")
        record["reporterName"] = names.get(reporter) if reporter else None
        result.append(record)
    return result


def join_request_summaries(snapshots):
    """The caller's own join requests: incident, status and when, newest first."""
    rows = []
    for snap in snapshots:
        data = snap.to_dict() or {}
        rows.append({"incidentId": data.get("incidentId"), "status": data.get("status"), "createdAt": data.get("createdAt")})
    return sorted(rows, key=lambda r: str(r.get("createdAt") or ""), reverse=True)
