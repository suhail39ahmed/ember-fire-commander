"""ember-api: REST API for EMBER fire commander.

GET /me verifies a Firebase ID token and returns the signed-in user.
POST /photos/upload-url issues a short-lived signed PUT URL for one photo.
GET /healthz stays public.
"""
import os

from flask import Flask, g, jsonify
from flask_cors import CORS

from auth import install_auth
from identity import AuthError
from photos import photos_bp

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
install_auth(app)
app.register_blueprint(photos_bp)


def error_body(code, message):
    return jsonify({"error": {"code": code, "message": message}})


@app.errorhandler(AuthError)
def handle_auth_error(exc):
    return error_body(exc.code, exc.message), exc.status


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
    return jsonify(g.user), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
