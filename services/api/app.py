"""ember-api: REST API for EMBER fire commander.

GET /me verifies a Firebase ID token and returns the signed-in user.
GET /healthz stays public.
"""
import os

from flask import Flask, jsonify, request
from flask_cors import CORS

from identity import AuthError, user_from_token

app = Flask(__name__)

_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
CORS(
    app,
    origins=_origins,
    allow_headers=["Authorization", "Content-Type", "X-Firebase-AppCheck"],
)


def error_body(code, message):
    return jsonify({"error": {"code": code, "message": message}})


@app.errorhandler(AuthError)
def handle_auth_error(exc):
    return error_body(exc.code, exc.message), exc.status


def bearer_token():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme != "Bearer" or not token.strip():
        raise AuthError(401, "unauthorized", "Firebase ID token is missing")
    return token.strip()


@app.route("/healthz")
def healthz():
    """Health check endpoint for Cloud Run."""
    return jsonify({
        "status": "ok",
        "service": "ember-api",
        "firestore_database": os.getenv("FIRESTORE_DATABASE", "not-set"),
    }), 200


@app.route("/me")
def me():
    """Return the signed-in user. Role comes only from the ID token."""
    user = user_from_token(bearer_token())
    return jsonify(user), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
