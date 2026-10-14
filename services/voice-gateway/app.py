"""voice-gateway: WebSocket relay to Gemini Live for EMBER fire commander.

The upgrade at / requires a Firebase ID token. App Check follows
APP_CHECK_ENFORCE. An accepted socket stays open and does not start Gemini.
Audio relay, Live-minute caps, and observation writes are a later change.
GET /healthz stays public.
"""
import os

from flask import Flask, jsonify, request
from flask_sock import Sock

from auth.upgrade import handle_upgrade

app = Flask(__name__)
sock = Sock(app)


@app.route("/healthz")
def healthz():
    """Health check endpoint for Cloud Run."""
    return jsonify({
        "status": "ok",
        "service": "voice-gateway",
        "firestore_database": os.getenv("FIRESTORE_DATABASE", "not-set"),
    }), 200


class LiveSession:
    """Gemini Live session. A later change constructs this after the upgrade."""

    def __init__(self, user):
        self.user = user


def start_gemini_session(user):
    """Open Gemini Live for an authenticated user. Not called by the upgrade."""
    return LiveSession(user)


@sock.route("/")
def gateway(ws):
    handle_upgrade(ws, request.headers, start_gemini_session)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
