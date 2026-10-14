"""Tell ember-agents that an observation was stored.

The call is skipped when EMBER_AGENTS_URL is unset, so local runs and tests
do not need Cloud Run. A failed call is logged and does not undo the write.
"""
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)


def notify_observation(observation_id):
    base = os.getenv("EMBER_AGENTS_URL", "").strip().rstrip("/")
    if not base:
        return
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
        with urllib.request.urlopen(request, timeout=10) as response:
            response.read()
    except Exception:
        logger.exception("agents intake failed for observation %s", observation_id)


def _id_token(audience):
    import google.auth.transport.requests
    import google.oauth2.id_token

    auth_request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(auth_request, audience)
