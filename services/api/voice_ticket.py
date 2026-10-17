"""POST /voice/ticket — issue a short-lived single-use voice ticket for §7 browser upgrades.

The caller must already hold a valid Firebase ID token with an allowed role and
pass the App Check token following the same policy as every other protected route
(APP_CHECK_ENFORCE). On success, a 60-second single-use ticket is written to
Firestore (voiceTickets/{ticket} in ember-db) and returned to the caller.

The ticket is a 32-byte cryptographically-random URL-safe base64 string.
voice-gateway verifies and atomically consumes it at WebSocket upgrade time.
"""
import base64
import os
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify

from incidents.store import db

TICKET_TTL_SECONDS = 60
VOICE_TICKETS = "voiceTickets"

voice_ticket_bp = Blueprint("voice_ticket", __name__)


def _utc_now():
    return datetime.now(timezone.utc)


def _expires_at(now=None):
    if now is None:
        now = _utc_now()
    return now + timedelta(seconds=TICKET_TTL_SECONDS)


def _iso(dt):
    text = dt.strftime("%Y-%m-%dT%H:%M:%S")
    if dt.microsecond:
        text += f".{dt.microsecond // 1000:03d}"
    return text + "Z"


def issue_ticket(user, now=None, store=None):
    """Create and store one voice ticket. Returns (ticket_str, expires_at_iso)."""
    token = secrets.token_urlsafe(32)
    expires_at = _expires_at(now)
    record = {
        "uid": user["id"],
        "displayName": user.get("displayName") or "",
        "role": user["role"],
        "expiresAt": _iso(expires_at),
        "consumed": False,
    }
    if store is None:
        db().collection(VOICE_TICKETS).document(token).set(record)
    else:
        store.collection(VOICE_TICKETS).document(token).set(record)
    return token, _iso(expires_at)


@voice_ticket_bp.post("/voice/ticket")
def create_voice_ticket():
    """Issue a short-lived single-use ticket so the browser PWA can open the voice WebSocket."""
    token, expires_at = issue_ticket(g.user)
    return jsonify({"ticket": token, "expiresAt": expires_at}), 201
