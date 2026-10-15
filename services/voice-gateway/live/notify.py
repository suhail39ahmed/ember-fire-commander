"""Tell ember-agents that a live observation was stored.

Skipped when EMBER_AGENTS_URL is unset. A failed call does not undo the write.
"""
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)


def notify_observation(observation_id):
    base = os.getenv("EMBER_AGENTS_URL", "").strip().rstrip("/")
    if not base:
        return True
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
        with urllib.request.urlopen(request, timeout=3) as response:
            response.read()
        return True
    except Exception:
        logger.warning("agents intake failed for observation %s", observation_id, exc_info=True)
        return False


def _id_token(audience):
    import google.auth.transport.requests
    import google.oauth2.id_token

    auth_request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(auth_request, audience)
