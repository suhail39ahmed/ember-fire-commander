"""Validate a chip, text or photo observation before it is stored."""
import math
from datetime import datetime, timezone

from photos.paths import owner_of

CHIPS = ("asap", "api", "aman", "butuh_bantuan")
CHIP_SEVERITY = {
    "asap": "smoke",
    "api": "small_flame",
    "aman": "none",
    "butuh_bantuan": "unknown",
}
MAX_NOTE_LENGTH = 280
SOURCES = ("chip", "text", "photo")
_REJECTED_SOURCES = ("live",)


class ValidationError(Exception):
    def __init__(self, message, fields):
        super().__init__(message)
        self.message = message
        self.fields = fields


def prepare_observation(body):
    """Return the client fields the server is willing to store.

    Server-owned fields on the body (id, volunteerId, severity, and the rest)
    are ignored. Severity is filled from the chip, or `unknown` for text and
    photo reports. A photo report must carry a well-formed photoPath; whether
    the caller owns it is checked by the route.
    """
    if not isinstance(body, dict):
        raise ValidationError(
            "Request body must be a JSON object",
            {"body": "JSON object required"},
        )

    fields = {}
    source = body.get("source")
    if source in _REJECTED_SOURCES:
        fields["source"] = "live observations are not accepted on this route"
    elif source not in SOURCES:
        fields["source"] = "source must be chip, text or photo"

    captured = _captured_at(body.get("capturedAt"))
    if captured is None:
        fields["capturedAt"] = "capturedAt must be an ISO-8601 UTC timestamp"

    lat = _coordinate(body.get("lat"), "lat", -90, 90, fields)
    lng = _coordinate(body.get("lng"), "lng", -180, 180, fields)
    accuracy = _accuracy(body, fields)
    chip, text = _chip_and_text(source, body, fields)
    photo_path = _photo_path(source, body, fields)

    if fields:
        raise ValidationError(next(iter(fields.values())), fields)

    severity = CHIP_SEVERITY[chip] if source == "chip" else "unknown"
    return {
        "source": source,
        "capturedAt": captured,
        "lat": lat,
        "lng": lng,
        "accuracyM": accuracy,
        "chip": chip,
        "text": text,
        "severity": severity,
        "photoPath": photo_path,
    }


def _captured_at(value):
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    offset = parsed.utcoffset()
    if offset is None or offset.total_seconds() != 0:
        return None
    utc = parsed.astimezone(timezone.utc)
    text = utc.strftime("%Y-%m-%dT%H:%M:%S")
    if utc.microsecond:
        text += f".{utc.microsecond // 1000:03d}"
    return text + "Z"


def _coordinate(value, name, low, high, fields):
    number = _finite_number(value)
    if number is None:
        fields[name] = f"{name} must be a number"
        return None
    if number < low or number > high:
        fields[name] = f"{name} must be between {low} and {high}"
        return None
    return value


def _accuracy(body, fields):
    if "accuracyM" not in body or body.get("accuracyM") is None:
        return None
    number = _finite_number(body.get("accuracyM"))
    if number is None:
        fields["accuracyM"] = "accuracyM must be a non-negative number or null"
        return None
    if number < 0:
        fields["accuracyM"] = "accuracyM must be a non-negative number or null"
        return None
    return body.get("accuracyM")


def _chip_and_text(source, body, fields):
    chip = body.get("chip", None)
    text = body.get("text", None)
    if text is None:
        note = None
    elif not isinstance(text, str):
        fields["text"] = "text must be a string or null"
        note = None
    else:
        note = text.strip()
        if len(note) > MAX_NOTE_LENGTH:
            fields["text"] = f"text must be at most {MAX_NOTE_LENGTH} characters"
        if not note:
            note = None

    if source == "chip":
        if chip not in CHIPS:
            fields["chip"] = "use asap, api, aman, or butuh_bantuan"
        return chip if chip in CHIPS else None, note
    if source == "text":
        if chip is not None:
            fields["chip"] = "a text report omits the chip"
        if "text" not in fields and note is None:
            fields["text"] = "text is required"
        return None, note
    if source == "photo":
        if chip is not None:
            fields["chip"] = "a photo report omits the chip"
        return None, note
    return None, note


def _photo_path(source, body, fields):
    if source != "photo":
        return None
    path = body.get("photoPath")
    if not isinstance(path, str) or not path:
        fields["photoPath"] = "photoPath is required for a photo report"
        return None
    if owner_of(path) is None:
        fields["photoPath"] = "photoPath must be a path issued by /photos/upload-url"
        return None
    return path


def _finite_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value
