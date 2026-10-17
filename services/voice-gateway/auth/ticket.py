"""Verify and consume a single-use voice ticket from Firestore.

ember-api writes voiceTickets/{ticket} with uid, displayName, role, expiresAt,
and consumed=false. The gateway checks expiry and consumed atomically in a
transaction, marks the ticket consumed, and returns the user dict.

This module shares the same Firebase app as upgrade.py (firebase_admin._apps).
"""
import logging
import os
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

VOICE_TICKETS = "voiceTickets"

try:
    from google.cloud import firestore as gcloud_firestore
except ImportError:  # pragma: no cover
    gcloud_firestore = None  # type: ignore[assignment]


class TicketError(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


def _db(client=None):
    if client is not None:
        return client
    import firebase_admin
    from firebase_admin import firestore as admin_firestore

    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={
            "projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
        })
    return admin_firestore.client(database_id=os.environ["FIRESTORE_DATABASE"])


def _parse_expires(value):
    """Parse an ISO-8601 UTC timestamp string to a timezone-aware datetime."""
    if not isinstance(value, str):
        return None
    text = value.rstrip("Z") + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def verify_and_consume(ticket_str, db_client=None):
    """Look up, validate, and atomically consume one voice ticket.

    Returns the user dict {id, displayName, role} on success.
    Raises TicketError when the ticket is missing, unknown, expired, or consumed.
    """
    if not ticket_str or not isinstance(ticket_str, str):
        raise TicketError("voice ticket is missing")

    db = _db(db_client)
    ref = db.collection(VOICE_TICKETS).document(ticket_str)

    @gcloud_firestore.transactional
    def _run(transaction):
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            raise TicketError("voice ticket not found")
        data = snap.to_dict() or {}
        if data.get("consumed"):
            raise TicketError("voice ticket already consumed")
        expires_at = _parse_expires(data.get("expiresAt"))
        if expires_at is None or datetime.now(timezone.utc) > expires_at:
            raise TicketError("voice ticket expired")
        transaction.update(ref, {"consumed": True})
        return data

    try:
        data = _run(db.transaction())
    except TicketError:
        raise
    except Exception as exc:
        logger.warning("ticket lookup failed: %s", exc)
        raise TicketError("voice ticket lookup failed")

    return {
        "id": data["uid"],
        "displayName": data.get("displayName") or "",
        "role": data["role"],
    }
