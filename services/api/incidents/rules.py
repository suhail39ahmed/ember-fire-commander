"""Deterministic rules from the shared contract (sections 1, 5 and 6.5).

No route here lets a client clear `withdraw`, raise severity, or set an
incident to `open` or `held`. Those belong to code in ember-agents.
"""
from datetime import datetime, timedelta

from observations.store import utc_now_iso

SEVERITY_ORDER = ("none", "smoke", "small_flame", "large_flame")
SEVERITIES = SEVERITY_ORDER + ("unknown",)
LIVE_STATUSES = ("open", "held", "verified")
INSTRUCTION_MAX = 500

INCIDENT_FIELDS = (
    "id", "name", "area", "status", "severity", "evidenceScore", "conflictId", "withdraw", "lat", "lng",
)
SUMMARY_FIELDS = ("id", "name", "area", "status", "severity", "withdraw", "lat", "lng")
TASK_FIELDS = (
    "id", "incidentId", "volunteerId", "type", "status", "instruction", "sentAt", "heardAt", "sendCount", "resendAt",
    "acceptedAt", "acceptResponse", "acceptNote", "declinedAt", "declineReason", "declineNote",
    # Lead closed thank-you (#140). Absent until a supervisor closes the check.
    "closedAt", "closedBy", "closedByName", "closeMessage",
)
# A task that was sent and not heard can be sent again after this long.
RESEND_AFTER_SECONDS = 60
CONFLICT_FIELDS = (
    "id", "incidentId", "observationIds", "higherSeverity", "status", "dispatchHeld",
)
OBSERVATION_FIELDS = (
    "id", "volunteerId", "capturedAt", "receivedAt", "source", "lat", "lng",
    "accuracyM", "chip", "text", "severity", "photoPath", "videoPath", "immutable",
)


EVIDENCE_FACTOR_FIELDS = ("factor", "points", "detail")


def evidence_factors(data):
    """The stored evidence factors, as the supervisor read returns them. Anything malformed is left out."""
    factors = data.get("evidenceFactors")
    if not isinstance(factors, list):
        return []
    return [pick(f, EVIDENCE_FACTOR_FIELDS) for f in factors if isinstance(f, dict) and isinstance(f.get("factor"), str)]


def reporter_name(data):
    """The reporter's display name stored on the observation, or None when there is none."""
    name = data.get("volunteerName")
    return name.strip() if isinstance(name, str) and name.strip() else None


def coordinate_label(lat, lng):
    """"13.05°N 77.63°E", or None when either coordinate is missing or not a number."""
    for value in (lat, lng):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None
    return f"{abs(lat):.2f}\u00b0{'N' if lat >= 0 else 'S'} {abs(lng):.2f}\u00b0{'E' if lng >= 0 else 'W'}"


def incident_label(data):
    """The one readable name for an incident, so no screen shows a raw id.

    The stored `name`, else "Incident · <area>", else "Incident · <coordinates>", else "Incident".
    """
    name = data.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    area = data.get("area")
    place = area.strip() if isinstance(area, str) and area.strip() else coordinate_label(data.get("lat"), data.get("lng"))
    return f"Incident \u00b7 {place}" if place else "Incident"


def incident_number(data):
    """The `#<n>` at the end of the stored name, such as `#3`, or None."""
    name = data.get("name")
    name = name.strip() if isinstance(name, str) and name.strip() else None
    if name and " \u00b7 " in name:
        last = name.rsplit(" \u00b7 ", 1)[1].strip()
    else:
        last = name or ""
    return last if last.startswith("#") and last[1:].isdigit() else None


def incident_code(data, incident_id):
    """The short code a screen shows: `#3`, or `INC-` and the last 4 characters of the id when no number is stored."""
    return incident_number(data) or f"INC-{str(incident_id)[-4:].upper()}"


def place_name(data):
    """The stored area, else the place part of the stored name, else the position as a label. None when none exists."""
    area = data.get("area")
    if isinstance(area, str) and area.strip():
        return area.strip()
    name = data.get("name")
    if isinstance(name, str) and name.strip():
        head = name.split(" \u00b7 ")[0].strip()
        if head and not (head.startswith("#") and head[1:].isdigit()):
            return head
    return coordinate_label(data.get("lat"), data.get("lng"))


def phone_of(data):
    """A volunteer's stored phone number, or None when there is none."""
    phone = data.get("phone")
    return phone.strip() if isinstance(phone, str) and phone.strip() else None


def _parse(iso):
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None


def with_receipt(record):
    """Add `resendAt` to a task record: the moment a sent, unheard task can be sent again. None otherwise."""
    sent = _parse(record.get("sentAt")) if record.get("sentAt") else None
    waiting = record.get("status") == "approved" and not record.get("heardAt") and sent is not None
    record["resendAt"] = (
        (sent + timedelta(seconds=RESEND_AFTER_SECONDS)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if waiting else None
    )
    return record


def now_iso():
    """Same server timestamp format as stored observations."""
    return utc_now_iso()


def is_lower(new, current):
    """True when new is strictly lower than current on the known scale.

    `unknown` never lowers a known severity, and nothing lowers `unknown`.
    """
    if new not in SEVERITY_ORDER or current not in SEVERITY_ORDER:
        return False
    return SEVERITY_ORDER.index(new) < SEVERITY_ORDER.index(current)


def pick(record, fields):
    return {field: record.get(field) for field in fields}


def to_record(snapshot, fields):
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    return pick(data, fields)


def audit_record(audit_id, actor_id, action, target_id, subject_id=None, actor_name=None):
    """`subjectId` is the volunteer an action is about, written only when there is one (found safe).

    `actorName` is the display name from the actor's token at the time, written only when the token has one.
    """
    record = {"id": audit_id, "actorId": actor_id, "action": action, "targetId": target_id, "at": now_iso()}
    if subject_id:
        record["subjectId"] = subject_id
    if isinstance(actor_name, str) and actor_name.strip():
        record["actorName"] = actor_name.strip()[:80]
    return record
