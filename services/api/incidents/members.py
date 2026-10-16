"""Volunteer join and nearby-fire helpers for #134 / #135.

`incident_members` links a volunteer to a live incident without a task or report.
Nearby distance and bearing are computed when the phone sends lat/lng on GET /digest.
"""
from __future__ import annotations

import math
import os

from incidents import detail as incident_detail, rules, store

MEMBERS = "incident_members"
# How far a live fire can be to appear as nearby. Override with EMBER_NEARBY_RADIUS_M.
DEFAULT_NEARBY_RADIUS_M = 5000

MEMBER_FIELDS = (
    "incidentId",
    "volunteerId",
    "joinedAt",
    "addedBy",
    "addedByName",
    "teamRole",
    "enRouteAt",
    "destination",
    "approach",
    "meetPoint",
    "meetPerson",
    "meetNote",
)


def member_id(incident_id: str, volunteer_id: str) -> str:
    return f"{incident_id}__{volunteer_id}"


def member_ref(incident_id: str, volunteer_id: str):
    return store.db().collection(MEMBERS).document(member_id(incident_id, volunteer_id))


def read_member(incident_id: str, volunteer_id: str) -> dict | None:
    snap = member_ref(incident_id, volunteer_id).get()
    if not snap.exists:
        return None
    data = snap.to_dict() or {}
    data["id"] = snap.id
    return _public_member(data)


def member_incident_ids(volunteer_id: str) -> list[str]:
    """Incident ids this volunteer has joined, newest join first is not required — callers sort by id."""
    ids = []
    for snap in store.where(MEMBERS, "volunteerId", "==", volunteer_id):
        data = snap.to_dict() or {}
        incident_id = data.get("incidentId")
        if isinstance(incident_id, str) and incident_id:
            ids.append(incident_id)
    return ids


def is_member(volunteer_id: str, incident_id: str) -> bool:
    return member_ref(incident_id, volunteer_id).get().exists


def crew_on_site(incident_id: str, data: dict) -> int:
    """How many distinct volunteers are linked to this incident (members, tasks, reports)."""
    people = set()
    for snap in store.where(MEMBERS, "incidentId", "==", incident_id):
        uid = (snap.to_dict() or {}).get("volunteerId")
        if isinstance(uid, str) and uid:
            people.add(uid)
    for snap in store.where(store.TASKS, "incidentId", "==", incident_id):
        uid = (snap.to_dict() or {}).get("volunteerId")
        if isinstance(uid, str) and uid:
            people.add(uid)
    for obs_id in data.get("observationIds") or []:
        snap = store.get_many(store.OBSERVATIONS, [obs_id]).get(obs_id)
        if snap:
            uid = (snap.to_dict() or {}).get("volunteerId")
            if isinstance(uid, str) and uid:
                people.add(uid)
    return len(people)


def _public_member(data: dict) -> dict:
    """Only the fields the phone may show. Blank optional strings become null."""
    out = {}
    for key in MEMBER_FIELDS:
        value = data.get(key)
        if key in ("destination", "approach", "meetPoint", "meetPerson", "meetNote", "teamRole", "addedByName", "enRouteAt"):
            if isinstance(value, str) and value.strip():
                out[key] = value.strip()
            else:
                out[key] = None
        else:
            out[key] = value
    return out


def bearing_deg(lat1, lng1, lat2, lng2):
    """Initial bearing from point 1 to point 2 in degrees (0 = north). None when coords are bad."""
    values = (lat1, lng1, lat2, lng2)
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        return None
    rad = math.pi / 180
    y = math.sin((lng2 - lng1) * rad) * math.cos(lat2 * rad)
    x = math.cos(lat1 * rad) * math.sin(lat2 * rad) - math.sin(lat1 * rad) * math.cos(lat2 * rad) * math.cos(
        (lng2 - lng1) * rad
    )
    return round((math.atan2(y, x) * 180 / math.pi + 360) % 360)


def parse_position(args) -> tuple[float, float] | None:
    """Optional lat/lng query pair for GET /digest. Both must be present and in range."""
    raw_lat, raw_lng = args.get("lat"), args.get("lng")
    if raw_lat is None and raw_lng is None:
        return None
    try:
        lat = float(raw_lat)
        lng = float(raw_lng)
    except (TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def nearby_radius_m() -> int:
    raw = os.getenv("EMBER_NEARBY_RADIUS_M", str(DEFAULT_NEARBY_RADIUS_M))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_NEARBY_RADIUS_M
    return value if value > 0 else DEFAULT_NEARBY_RADIUS_M


def nearby_for(volunteer_id: str, lat: float, lng: float, linked_ids: set[str]) -> list[dict]:
    """Live incidents within range that this volunteer is not already on, closest first."""
    radius = nearby_radius_m()
    candidates = []
    for snap in store.where(store.INCIDENTS, "status", "in", list(rules.LIVE_STATUSES)):
        if snap.id in linked_ids:
            continue
        data = snap.to_dict() or {}
        distance = incident_detail.distance_m(lat, lng, data.get("lat"), data.get("lng"))
        if distance is None or distance > radius:
            continue
        bearing = bearing_deg(lat, lng, data.get("lat"), data.get("lng"))
        summary = rules.to_record(snap, rules.SUMMARY_FIELDS)
        summary["distanceM"] = distance
        summary["bearingDeg"] = bearing
        summary["crewOnSite"] = crew_on_site(snap.id, data)
        # Supervisor ask text is not stored yet; omit rather than invent.
        summary["ask"] = None
        candidates.append(summary)
    candidates.sort(key=lambda row: (row["distanceM"], row["id"]))
    return candidates


def join_record(incident_id: str, volunteer_id: str, actor_name: str | None) -> dict:
    """Fields written on a new membership. Self-join: addedBy is the volunteer."""
    name = actor_name.strip() if isinstance(actor_name, str) and actor_name.strip() else None
    return {
        "incidentId": incident_id,
        "volunteerId": volunteer_id,
        "joinedAt": rules.now_iso(),
        "addedBy": volunteer_id,
        "addedByName": name,
        "teamRole": None,
        "enRouteAt": None,
        "destination": None,
        "approach": None,
        "meetPoint": None,
        "meetPerson": None,
        "meetNote": None,
    }
