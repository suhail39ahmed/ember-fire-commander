"""Validate a chip, text, photo or video observation before it is stored."""
import math
import re
from datetime import datetime, timedelta, timezone

from photos.paths import owner_of
from videos.paths import owner_of as video_owner_of

CHIPS = ("asap", "api", "aman", "butuh_bantuan")
CHIP_SEVERITY = {
    "asap": "smoke",
    "api": "small_flame",
    "aman": "none",
    "butuh_bantuan": "unknown",
}
MAX_NOTE_LENGTH = 280
# What a phone may say about itself with a report. Each part is optional and best effort.
NETWORKS = ("2g", "3g", "4g", "wifi", "unknown")
LANGUAGES = ("id", "en")
# The outbox item id. Letters, digits, dot, dash and underscore, so it is safe to hash and log.
CLIENT_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
# A phone clock can be a little fast and the outbox can hold a report offline
# for days, so capturedAt has to fall inside this window around receipt.
MAX_FUTURE = timedelta(minutes=5)
MAX_AGE = timedelta(days=7)
SOURCES = ("chip", "text", "photo", "video")
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
    else:
        problem = _captured_at_range(captured)
        if problem:
            fields["capturedAt"] = problem
            captured = None

    lat = _coordinate(body.get("lat"), "lat", -90, 90, fields)
    lng = _coordinate(body.get("lng"), "lng", -180, 180, fields)
    accuracy = _accuracy(body, fields)
    chip, text = _chip_and_text(source, body, fields)
    photo_path = _photo_path(source, body, fields)
    video_path = _video_path(source, body, fields)
    client_id = _client_id(body, fields)
    device = _device(body.get("device"))

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
        "videoPath": video_path,
        "clientId": client_id,
        "device": device,
    }


def _device(value):
    """The battery, network and language a phone sent with a report, or None when it sent none that are usable.

    This is context for the supervisor, so it never fails a report: a part that is missing, the wrong type or
    out of range is left out, and so is any key that is not one of the three.
    """
    if not isinstance(value, dict):
        return None
    device = {}
    battery = value.get("batteryPct")
    if _finite_number(battery) is not None and 0 <= battery <= 100:
        device["batteryPct"] = int(round(battery))
    if value.get("network") in NETWORKS:
        device["network"] = value["network"]
    if value.get("language") in LANGUAGES:
        device["language"] = value["language"]
    return device or None


def _client_id(body, fields):
    value = body.get("clientId")
    if value is None:
        return None
    if not isinstance(value, str) or not CLIENT_ID_PATTERN.match(value):
        fields["clientId"] = "clientId must be 1 to 128 letters, digits, dots, dashes or underscores"
        return None
    return value


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


def _now():
    return datetime.now(timezone.utc)


def _captured_at_range(captured):
    """Return a message when captured (already normalised) is outside the allowed window."""
    moment = datetime.fromisoformat(captured[:-1] + "+00:00")
    now = _now()
    if moment > now + MAX_FUTURE:
        return "capturedAt must not be more than 5 minutes in the future"
    if moment < now - MAX_AGE:
        return "capturedAt must be within the last 7 days"
    return None


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
    if source in ("photo", "video"):
        if chip is not None:
            fields["chip"] = f"a {source} report omits the chip"
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


def _video_path(source, body, fields):
    if source != "video":
        return None
    path = body.get("videoPath")
    if not isinstance(path, str) or not path:
        fields["videoPath"] = "videoPath is required for a video report"
        return None
    if video_owner_of(path) is None:
        fields["videoPath"] = "videoPath must be a path issued by /videos/upload-url"
        return None
    return path


def _finite_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value
