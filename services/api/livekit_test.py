"""Opt-in LiveKit media test. No incident, task, or call-workflow state."""
import hashlib
import hmac
import os
import re
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from dotenv import dotenv_values
from flask import Blueprint, g, jsonify, request
from test_calls import register_call

livekit_test_bp = Blueprint("livekit_test", __name__)


def _error(code, message, status):
    return jsonify({"error": {"code": code, "message": message}}), status


@livekit_test_bp.post("/livekit/test-token")
def create_test_token():
    # Local/staging checkout settings. Injected Cloud Run env always wins.
    settings = dotenv_values(Path(__file__).resolve().parent.parent.parent / ".env")
    def setting(name):
        return os.environ.get(name, settings.get(name) or "").strip()

    if setting("EMBER_LIVEKIT_TEST_ENABLED").lower() != "true":
        return _error("not_found", "LiveKit test is disabled.", 404)
    # Authentication and App Check run through the existing middleware.
    if g.user.get("role") not in ("volunteer", "supervisor"):
        return _error("forbidden", "A volunteer or supervisor account is required.", 403)
    body = request.get_json(silent=True)
    code = body.get("roomCode") if isinstance(body, dict) else None
    if not isinstance(code, str) or not re.fullmatch(r"[a-zA-Z0-9-]{8,48}", code):
        return _error("validation", "Use a test code of 8–48 letters, digits, or hyphens.", 400)
    server_url = setting("LIVEKIT_URL")
    key = setting("LIVEKIT_API_KEY")
    secret = setting("LIVEKIT_API_SECRET")
    parsed = urlparse(server_url)
    if not key or not secret or parsed.scheme != "wss" or not parsed.hostname:
        return _error("unavailable", "Configure LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET on ember-api.", 503)

    from livekit import api

    # An opaque stable identity avoids exposing Firebase UIDs to media logs.
    identity = hmac.new(secret.encode(), g.user["id"].encode(), hashlib.sha256).hexdigest()[:32]
    room = f"ember-test-{code.lower()}"
    try:
        call_id = register_call(room, g.user, identity)
    except ValueError as exc:
        return _error("conflict", str(exc), 409)
    token = (
        api.AccessToken(key, secret)
        .with_identity(identity)
        .with_name(g.user["role"].capitalize())
        .with_ttl(timedelta(minutes=5))
        .with_grants(api.VideoGrants(
            room_join=True, room=room,
            can_publish=True, can_subscribe=True, can_publish_data=False,
            can_publish_sources=["camera", "microphone"],
        ))
        .to_jwt()
    )
    response = jsonify({"serverUrl": server_url, "participantToken": token, "callId": call_id, "speakerId": identity})
    response.headers["Cache-Control"] = "no-store"
    return response, 201
