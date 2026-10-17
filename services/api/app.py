"""ember-api: REST API for EMBER fire commander.

GET /me verifies a Firebase ID token and returns the signed-in user.
GET /config returns public runtime flags such as demoMode.
POST /observations stores one immutable chip, text, or photo observation.
POST /photos/upload-url issues a short-lived signed PUT URL for one photo.
GET /incidents, GET /digest and the supervisor decision routes live in incidents/.
POST /incidents/{id}/suggestions, /ask and /observations/{id}/translate live in assist/ (advisory text from ember-agents).
GET /dashboard returns the supervisor chrome, the live-fire banner, season impact, charts, and a re-ignition alert when one is open.
POST /sites/{id}/alerts/{id}/dismiss and /recheck handle the re-ignition alert.
GET /audit returns the append-only supervisor action log.
POST /internal/notifications/withdraw sends a code WITHDRAW push.
GET /healthz stays public.
"""
import os

from flask import Flask, g, jsonify
from flask_cors import CORS

from auth import install_auth
from identity import AuthError
from observations.routes import bp as observations_bp
from photos import photos_bp
from videos import videos_bp
from assist import assist_bp
from incidents import incidents_bp
from notifications import notifications_bp
from dashboard import dashboard_bp
from config_route import config_bp
from audit_routes import audit_bp
from sites_routes import sites_bp
import volunteer_routes
from training_routes import training_bp
import join_routes
from withdraw_events import events_bp
from voice_ticket import voice_ticket_bp

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
app.register_blueprint(observations_bp)
app.register_blueprint(photos_bp)
app.register_blueprint(videos_bp)
app.register_blueprint(incidents_bp)
app.register_blueprint(assist_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(config_bp)
app.register_blueprint(audit_bp)
app.register_blueprint(sites_bp)
app.register_blueprint(volunteer_routes.volunteer_bp)
app.register_blueprint(training_bp)
app.register_blueprint(join_routes.join_bp)
app.register_blueprint(events_bp)
app.register_blueprint(voice_ticket_bp)


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
    """Return the signed-in user. Role comes only from the ID token; a volunteer's crew comes from their profile."""
    body = dict(g.user)
    if body.get("role") == "volunteer":
        body.update(volunteer_routes.profile_of(body["id"]))
    return jsonify(body), 200


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
