"""Ownership checks for private photo object paths.

Same layout ember-api issues: photos/<uid>/<yyyymmdd>/<32 hex>.(jpg|webp).
"""
import re

_PATH_RE = re.compile(
    r"^photos/(?P<uid>[A-Za-z0-9_-]{1,128})/\d{8}/[0-9a-f]{32}\.(?P<ext>jpg|webp)$"
)
MIME = {"jpg": "image/jpeg", "webp": "image/webp"}


def owner_of(path):
    match = _PATH_RE.match(path or "")
    return match.group("uid") if match else None


def is_owned(path, uid):
    return bool(uid) and owner_of(path) == uid


def mime_type(path):
    match = _PATH_RE.match(path or "")
    return MIME[match.group("ext")] if match else None
