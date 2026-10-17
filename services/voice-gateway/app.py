"""voice-gateway: WebSocket relay to Gemini Live for EMBER fire commander.

The upgrade at / accepts two authentication paths (§7):
  - Browser (PWA): a voice ticket in Sec-WebSocket-Protocol, issued by ember-api.
  - Native: Authorization: Bearer <Firebase ID token> + X-Firebase-AppCheck.

App Check follows APP_CHECK_ENFORCE for the native path. An accepted socket runs
one push-to-talk Live relay. GET /healthz stays public.
"""
import os

from flask import Flask, jsonify, request

from auth.upgrade import handle_upgrade

app = Flask(__name__)


@app.route("/healthz")
def healthz():
    """Health check endpoint for Cloud Run."""
    return jsonify({
        "status": "ok",
        "service": "voice-gateway",
        "firestore_database": os.getenv("FIRESTORE_DATABASE", "not-set"),
    }), 200


def start_gemini_session(user, ws):
    """Relay one accepted socket. Gemini opens only after session.start."""
    from live.session import run_session
    run_session(user, ws)


@app.route("/", websocket=True)
def gateway():
    """WebSocket upgrade endpoint.

    Creates the flask_sock Server directly so we can echo back the
    Sec-WebSocket-Protocol the browser sent — required for browsers to accept
    the upgrade when a subprotocol was proposed.
    """
    from flask_sock import Server as WsServer

    protocol_header = request.headers.get("Sec-WebSocket-Protocol", "")
    proposed = [p.strip() for p in protocol_header.split(",") if p.strip()]
    subprotocols = proposed if proposed else None

    ws = WsServer(request.environ, subprotocols=subprotocols)
    handle_upgrade(ws, request.headers, start_gemini_session)
    return ""


if __name__ == "__main__":
    port = int(os.getenv("PORT") or os.getenv("EMBER_VOICE_GATEWAY_PORT", "8084"))
    app.run(host="0.0.0.0", port=port)
