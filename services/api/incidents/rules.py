"""Deterministic rules from the shared contract (sections 1, 5 and 6.5).

No route here lets a client clear `withdraw`, raise severity, or set an
incident to `open` or `held`. Those belong to code in ember-agents.
"""
from observations.store import utc_now_iso

SEVERITY_ORDER = ("none", "smoke", "small_flame", "large_flame")
SEVERITIES = SEVERITY_ORDER + ("unknown",)
LIVE_STATUSES = ("open", "held", "verified")
INSTRUCTION_MAX = 500

INCIDENT_FIELDS = (
    "id", "name", "area", "status", "severity", "evidenceScore", "conflictId", "withdraw", "lat", "lng",
)
SUMMARY_FIELDS = ("id", "name", "area", "status", "severity", "withdraw", "lat", "lng")
TASK_FIELDS = ("id", "incidentId", "volunteerId", "type", "status", "instruction")
CONFLICT_FIELDS = (
    "id", "incidentId", "observationIds", "higherSeverity", "status", "dispatchHeld",
)
OBSERVATION_FIELDS = (
    "id", "volunteerId", "capturedAt", "receivedAt", "source", "lat", "lng",
    "accuracyM", "chip", "text", "severity", "photoPath", "immutable",
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


def audit_record(audit_id, actor_id, action, target_id):
    return {"id": audit_id, "actorId": actor_id, "action": action, "targetId": target_id, "at": now_iso()}
