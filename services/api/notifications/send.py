"""Send one push and record the outcome.

The incident and task are already committed before this runs. A failed or
skipped send is written to notificationAttempts and does not change them.
Transient failures are tried three times. A missing token is a skip: this
service does not register devices.
"""
import logging

from firebase_admin import messaging

from incidents import store
from notifications.message import message_for
from observations.store import utc_now_iso

logger = logging.getLogger(__name__)

ATTEMPTS = 3
ATTEMPTS_COLLECTION = "notificationAttempts"
_TRANSIENT_CODES = {"UNAVAILABLE", "INTERNAL", "DEADLINE_EXCEEDED", "RESOURCE_EXHAUSTED"}
_TRANSIENT_TYPES = {"QuotaExceededError", "InternalError", "DeadlineExceeded", "ServiceUnavailable"}


class TransientPushError(Exception):
    """A send that is worth trying again."""


class FirebaseSender:
    def send(self, token, title, body, data):
        messaging.send(messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={key: str(value) for key, value in data.items()},
            token=token,
        ))


def default_sender():
    return FirebaseSender()


def _transient(exc):
    if isinstance(exc, TransientPushError):
        return True
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    if type(exc).__name__ in _TRANSIENT_TYPES:
        return True
    return getattr(exc, "code", None) in _TRANSIENT_CODES


def tokens_for(volunteer_id):
    if not volunteer_id:
        return []
    snapshot = store.db().collection("volunteers").document(volunteer_id).get()
    if not snapshot.exists:
        return []
    raw = (snapshot.to_dict() or {}).get("fcmTokens") or []
    if not isinstance(raw, list):
        return []
    return [token.strip() for token in raw if isinstance(token, str) and token.strip()]


def _record(task, result, attempts):
    ref = store.db().collection(ATTEMPTS_COLLECTION).document()
    ref.set({
        "kind": "withdraw" if task.get("type") == "withdraw" else "task",
        "targetId": task.get("id"),
        "volunteerId": task.get("volunteerId"),
        "result": result,
        "attempts": attempts,
        "at": utc_now_iso(),
    })
    return ref.id


def _send_token(sender, token, message):
    for attempt in range(1, ATTEMPTS + 1):
        try:
            sender.send(token, message["title"], message["body"], dict(message["data"]))
            return attempt, True
        except Exception as exc:
            if not _transient(exc) or attempt == ATTEMPTS:
                logger.warning("push failed after %s attempt(s): %s", attempt, type(exc).__name__)
                return attempt, False
    return ATTEMPTS, False


def deliver_task(task, sender=None):
    """Push this task to the volunteer's stored tokens. Returns the record outcome."""
    message = message_for(task)
    tokens = tokens_for(task.get("volunteerId"))
    if not tokens:
        _record(task, "skipped", 0)
        return {"result": "skipped", "attempts": 0}
    sender = sender or default_sender()
    attempts = 0
    sent = False
    for token in tokens:
        used, ok = _send_token(sender, token, message)
        attempts += used
        sent = sent or ok
    result = "sent" if sent else "failed"
    _record(task, result, attempts)
    return {"result": result, "attempts": attempts}
