"""Object paths in the private video bucket (same bucket as photos, different prefix).

Every object lives under videos/<uid>/, so the owner of a path is readable
from the path itself. A path is never a URL and never carries a host.
"""
import re
import uuid
from datetime import datetime, timezone

PREFIX = "videos"

CONTENT_TYPES = {
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
}

# Maximum upload size enforced server-side: 10 MB
# At 500 kbps for 60 s a clip is ~3.75 MB; 10 MB gives comfortable headroom.
MAX_VIDEO_BYTES = 10 * 1024 * 1024

_UID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_PATH_RE = re.compile(
    r"^videos/(?P<uid>[A-Za-z0-9_-]{1,128})/\d{8}/[0-9a-f]{32}\.(mp4|webm|mov)$"
)


def new_video_path(uid, content_type, now=None):
    """Return a fresh, unguessable object path owned by uid."""
    if not _UID_RE.match(uid or ""):
        raise ValueError("uid cannot be used in an object path")
    ext = CONTENT_TYPES[content_type]
    day = (now or datetime.now(timezone.utc)).strftime("%Y%m%d")
    return f"{PREFIX}/{uid}/{day}/{uuid.uuid4().hex}.{ext}"


def owner_of(path):
    match = _PATH_RE.match(path or "")
    return match.group("uid") if match else None


def is_owned_video_path(path, uid):
    """True only for a well-formed video path under this uid's prefix."""
    return bool(uid) and owner_of(path) == uid
