"""Calls from ember-api to the private ember-agents assist routes.

Same mechanism as observations/notify.py: the call carries a Cloud Run ID
token for EMBER_AGENTS_URL. With no URL set (local runs, tests) nothing is
called and AgentsUnavailable is raised, so a caller can answer plainly.
"""
import json
import logging
import os
import urllib.error
import urllib.request

from observations.notify import cloud_run_token

logger = logging.getLogger(__name__)

# Model calls can take a while. agents stops its own model call after 30 s by default.
ASSIST_TIMEOUT_SECONDS = 40
# Photo triage downloads the photo and then calls the model.
TRIAGE_TIMEOUT_SECONDS = 70


class AgentsUnavailable(Exception):
    """agents is not configured, did not answer, or failed."""


class AgentsRejected(Exception):
    """agents answered with a 4xx. `status` and `message` are its own."""

    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def agents_url():
    return os.getenv("EMBER_AGENTS_URL", "").strip().rstrip("/")


def post(path, payload=None, timeout=ASSIST_TIMEOUT_SECONDS):
    """POST to agents and return the parsed JSON body."""
    base = agents_url()
    if not base:
        raise AgentsUnavailable("EMBER_AGENTS_URL is not set")
    data = json.dumps(payload).encode() if payload is not None else b""
    try:
        request = urllib.request.Request(
            f"{base}{path}",
            data=data,
            method="POST",
            headers={"Authorization": f"Bearer {cloud_run_token(base)}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        message = ""
        try:
            message = (json.loads(exc.read() or b"{}").get("error") or {}).get("message", "")
        except Exception:
            pass
        if 400 <= exc.code < 500:
            raise AgentsRejected(exc.code, message) from exc
        raise AgentsUnavailable(f"agents answered {exc.code}") from exc
    except Exception as exc:
        raise AgentsUnavailable("agents did not answer") from exc
