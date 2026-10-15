"""Structured, advisory photo triage.

The model describes what it sees. Code keeps only the fields below, drops
anything else (a `severity` key, for example), and never applies the result
to the incident or the observation.
"""
from spotter.model import ModelError
from spotter.paths import is_owned, mime_type, owner_of
from spotter.store import PhotoMissing

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


class TriageFailed(Exception):
    """A storage or model failure. The reason is short and safe to store."""

    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason


class PhotoTooLarge(PhotoRejected):
    pass


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


def _stored_size(photo_size, path):
    try:
        return photo_size(path)
    except PhotoMissing as exc:
        raise TriageFailed("photo not found in storage") from exc
    except Exception as exc:
        raise TriageFailed("photo could not be read from storage") from exc


def _download(read_photo, path):
    try:
        return read_photo(path)
    except PhotoMissing as exc:
        raise TriageFailed("photo not found in storage") from exc
    except Exception as exc:
        raise TriageFailed("photo could not be read from storage") from exc


def _ask_model(model, image, path):
    try:
        raw = model.json(PROMPT, image=image, mime_type=mime_type(path))
    except (ModelError, ValueError) as exc:
        raise TriageFailed("model returned invalid output") from exc
    except Exception as exc:
        raise TriageFailed("model call failed") from exc
    if not isinstance(raw, dict):
        raise TriageFailed("model returned invalid output")
    return raw


def triage(observation, read_photo, model, now, caller_id=None, photo_size=None):
    """Return the triage record to store.

    Raises PhotoRejected before any download, PhotoTooLarge when the object
    metadata is over the limit, and TriageFailed for storage or model errors.
    """
    path = check_photo(observation, caller_id)
    if photo_size is not None and _stored_size(photo_size, path) > MAX_BYTES:
        raise PhotoTooLarge("photo is larger than 8 MB")
    image = _download(read_photo, path)
    if len(image) > MAX_BYTES:
        raise PhotoTooLarge("photo is larger than 8 MB")
    result = clean(_ask_model(model, image, path))
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


def error_record(observation, error, now):
    return {
        "id": observation["id"],
        "observationId": observation["id"],
        "volunteerId": observation.get("volunteerId"),
        "photoPath": observation.get("photoPath"),
        "status": "error",
        "error": error,
        "advisory": True,
        "model": None,
        "result": None,
        "at": now,
    }
