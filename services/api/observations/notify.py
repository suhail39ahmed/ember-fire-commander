"""Tell ember-agents that an observation was stored.

The call is skipped when EMBER_AGENTS_URL is unset, so local runs and tests
do not need Cloud Run. It never undoes the write.

The call has a short timeout, and the ID token is fetched once per expiry
window. When it fails, the observation stays in the intakePending queue and is
sent again by `resend_pending`, which runs after later reports. After a
failure the call is skipped for a few seconds, so reports do not wait on an
agents service that is down. Intake on the agents side ignores an observation
it has already fused, so a repeated call does not double-count.
"""
import base64
import json
import logging
import os
import threading
import time
import urllib.request
from datetime import timedelta

logger = logging.getLogger(__name__)

INTAKE_TIMEOUT_SECONDS = 3
# How long to skip calling agents after a failure.
PAUSE_SECONDS = 20
# An ID token is reused until this many seconds before it expires.
TOKEN_REFRESH_MARGIN_SECONDS = 300

# Sweep settings: how often, how many per pass, how long to wait between tries
# of one observation, and when to stop trying.
SWEEP_EVERY_SECONDS = 15
SWEEP_BATCH = 3
RETRY_AFTER_SECONDS = 30
MAX_ATTEMPTS = 20

_lock = threading.Lock()
_tokens = {}
_paused_until = 0.0
_last_sweep = 0.0


def notify_observation(observation_id):
    """Call agents intake. Return True when it accepted the observation (or there is nothing to call)."""
    global _paused_until
    base = os.getenv("EMBER_AGENTS_URL", "").strip().rstrip("/")
    if not base:
        return True
    if time.monotonic() < _paused_until:
        return False
    url = f"{base}/internal/observations/{observation_id}/intake"
    try:
        token = _id_token(base)
        request = urllib.request.Request(
            url,
            data=b"",
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(request, timeout=INTAKE_TIMEOUT_SECONDS) as response:
            response.read()
        return True
    except Exception:
        _paused_until = time.monotonic() + PAUSE_SECONDS
        logger.warning("agents intake failed for observation %s", observation_id, exc_info=True)
        return False


def resend_pending(store, now, send=None):
    """Send observations whose intake call failed earlier. Call it after a call to agents succeeded.
    `now` is an aware UTC datetime.

    Runs at most every SWEEP_EVERY_SECONDS, handles SWEEP_BATCH observations,
    and stops at the first failure. An observation is dropped from the queue
    after MAX_ATTEMPTS; it stays stored either way.
    """
    global _last_sweep
    send = send or notify_observation
    if time.monotonic() - _last_sweep < SWEEP_EVERY_SECONDS:
        return
    _last_sweep = time.monotonic()
    retry_before = _iso(now - timedelta(seconds=RETRY_AFTER_SECONDS))
    for item in store.pending_intake(retry_before=retry_before, limit=SWEEP_BATCH):
        if send(item["id"]):
            store.intake_done(item["id"])
            continue
        if item.get("attempts", 0) + 1 >= MAX_ATTEMPTS:
            logger.error("giving up on agents intake for observation %s", item["id"])
            store.intake_done(item["id"])
        else:
            store.intake_failed(item["id"], _iso(now))
        return


def _iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def _id_token(audience):
    """Return a Cloud Run ID token for audience, reusing one until shortly before it expires."""
    with _lock:
        cached = _tokens.get(audience)
        if cached and cached[1] - time.time() > TOKEN_REFRESH_MARGIN_SECONDS:
            return cached[0]
        token = _fetch_id_token(audience)
        _tokens[audience] = (token, _expiry(token))
        return token


def cloud_run_token(audience):
    """A Cloud Run ID token for audience (reused until shortly before it expires). Shared with assist/client.py."""
    return _id_token(audience)


def _fetch_id_token(audience):
    import google.auth.transport.requests
    import google.oauth2.id_token

    auth_request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(auth_request, audience)


def _expiry(token):
    """The exp claim of a JWT in epoch seconds, or 0 (never reused) when it cannot be read."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return int(json.loads(base64.urlsafe_b64decode(payload))["exp"])
    except Exception:
        return 0
