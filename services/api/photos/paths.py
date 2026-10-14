"""Object paths in the private photo bucket.

Every object lives under photos/<uid>/, so the owner of a path is readable
from the path itself. A path is never a URL and never carries a host.
"""
import re
import uuid
from datetime import datetime, timezone

PREFIX = "photos"

CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/webp": "webp",
}

_UID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_PATH_RE = re.compile(
    r"^photos/(?P<uid>[A-Za-z0-9_-]{1,128})/\d{8}/[0-9a-f]{32}\.(jpg|webp)$"
)


def new_photo_path(uid, content_type, now=None):
    """Return a fresh, unguessable object path owned by uid."""
    if not _UID_RE.match(uid or ""):
        raise ValueError("uid cannot be used in an object path")
    ext = CONTENT_TYPES[content_type]
    day = (now or datetime.now(timezone.utc)).strftime("%Y%m%d")
    return f"{PREFIX}/{uid}/{day}/{uuid.uuid4().hex}.{ext}"


def owner_of(path):
    match = _PATH_RE.match(path or "")
    return match.group("uid") if match else None


def is_owned_photo_path(path, uid):
    """True only for a well-formed photo path under this uid's prefix."""
    return bool(uid) and owner_of(path) == uid
