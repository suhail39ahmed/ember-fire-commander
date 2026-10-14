"""Structured, advisory photo triage.

The model describes what it sees. Code keeps only the fields below, drops
anything else (a `severity` key, for example), and never applies the result
to the incident or the observation.
"""
from spotter.paths import is_owned, mime_type, owner_of

MAX_BYTES = 8 * 1024 * 1024
FLAME = ("none", "small", "large", "unclear")
CONFIDENCE = ("low", "medium", "high")

PROMPT = """You are describing a field photo sent by a peatland fire volunteer.
Describe only what is visible. Do not judge danger, give instructions, or rate severity.
Reply with one JSON object with exactly these keys:
  "smokeVisible": true or false,
  "flameVisible": "none" | "small" | "large" | "unclear",
  "burnScarVisible": true or false,
  "notes": a short factual description in English, at most 200 characters,
  "confidence": "low" | "medium" | "high"
"""


class PhotoRejected(Exception):
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


def check_photo(observation, caller_id=None):
    """Raise PhotoRejected unless the photo belongs to the reporting volunteer.

    When `caller_id` is given it must also own the path.
    """
    path = observation.get("photoPath")
    if not path:
        raise PhotoRejected("observation has no photo")
    owner = owner_of(path)
    if owner is None:
        raise PhotoRejected("photo path is not a valid private object path")
    if not is_owned(path, observation.get("volunteerId")):
        raise PhotoRejected("photo path is not owned by the reporting volunteer")
    if caller_id is not None and not is_owned(path, caller_id):
        raise PhotoRejected("photo path is not owned by the caller")
    return path


def clean(raw):
    """Keep only the schema fields, with safe defaults for bad values."""
    raw = raw if isinstance(raw, dict) else {}
    flame = raw.get("flameVisible")
    confidence = raw.get("confidence")
    notes = raw.get("notes")
    return {
        "smokeVisible": raw.get("smokeVisible") is True,
        "flameVisible": flame if flame in FLAME else "unclear",
        "burnScarVisible": raw.get("burnScarVisible") is True,
        "notes": notes.strip()[:200] if isinstance(notes, str) else "",
        "confidence": confidence if confidence in CONFIDENCE else "low",
    }


def triage(observation, read_photo, model, now, caller_id=None):
    """Return the triage record to store. Raises PhotoRejected before any read."""
    path = check_photo(observation, caller_id)
    image = read_photo(path)
    if len(image) > MAX_BYTES:
        raise PhotoRejected("photo is larger than 8 MB")
    result = clean(model.json(PROMPT, image=image, mime_type=mime_type(path)))
    return {
        "id": observation["id"],
        "observationId": observation["id"],
        "volunteerId": observation["volunteerId"],
        "photoPath": path,
        "status": "ok",
        "advisory": True,
        "model": model.name,
        "result": result,
        "at": now,
    }


def rejected_record(observation, reason, now):
    return {
        "id": observation["id"],
        "observationId": observation["id"],
        "volunteerId": observation.get("volunteerId"),
        "photoPath": observation.get("photoPath"),
        "status": "rejected",
        "reason": reason,
        "advisory": True,
        "model": None,
        "result": None,
        "at": now,
    }
