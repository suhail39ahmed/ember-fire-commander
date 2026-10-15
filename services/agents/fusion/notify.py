"""Tell ember-api that code just committed a WITHDRAW.

Skipped when EMBER_API_URL is unset, so local runs and tests do not need
Cloud Run. The call is retried and then logged. It never undoes the write.
"""
import json
import logging
import os
import urllib.request

logger = logging.getLogger(__name__)

ATTEMPTS = 3


def notify_withdraw(plan):
    tasks = [task for task in plan.tasks if task.get("type") == "withdraw"]
    if not tasks or not plan.incident:
        return
    base = os.getenv("EMBER_API_URL", "").strip().rstrip("/")
    if not base:
        return
    url = f"{base}/internal/notifications/withdraw"
    payload = json.dumps({
        "incidentId": plan.incident["id"],
        "tasks": [{"id": task["id"], "volunteerId": task["volunteerId"]} for task in tasks],
    }).encode()
    for attempt in range(1, ATTEMPTS + 1):
        try:
            token = _id_token(base)
            request = urllib.request.Request(
                url,
                data=payload,
                method="POST",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                response.read()
            return
        except Exception:
            logger.warning(
                "withdraw notify attempt %s failed for incident %s",
                attempt, plan.incident["id"],
            )
    logger.error("withdraw notify failed for incident %s", plan.incident["id"])


def _id_token(audience):
    import google.auth.transport.requests
    import google.oauth2.id_token

    auth_request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(auth_request, audience)
