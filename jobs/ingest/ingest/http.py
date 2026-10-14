"""Tiny HTTP helper (stdlib only) so tests can swap it for recorded fixtures."""
from __future__ import annotations

import urllib.request


def get_text(url: str, *, headers: dict | None = None, timeout: float = 20.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "ember-ingest/1", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed https URLs)
        return resp.read().decode("utf-8")
