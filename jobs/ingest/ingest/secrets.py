"""Read API keys at run time.

The job reads Secret Manager itself (sa-ember-ingest has secretAccessor) rather
than mounting the secret, so a secret with no version yet fails only the FIRMS
step, not the whole job.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def get_secret(name: str, project: str) -> str | None:
    value = os.environ.get(name)
    if value:
        return value.strip()
    if not project:
        return None
    try:
        from google.cloud import secretmanager

        client = secretmanager.SecretManagerServiceClient()
        resp = client.access_secret_version(name=f"projects/{project}/secrets/{name}/versions/latest")
        return resp.payload.data.decode("utf-8").strip() or None
    except Exception as exc:  # NotFound / no version yet / permission
        log.warning("secret %s unavailable: %s", name, type(exc).__name__)
        return None
