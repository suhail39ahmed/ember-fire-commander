"""Public runtime config for the browser.

Issue #89: the simulated-demo strip is driven by `demoMode`, not hard-coded
console copy. The document is `ops/config` in ember-db; a missing document or
field falls back to the DEMO_MODE env var (default false).
"""
import os

from flask import Blueprint, jsonify

from incidents import store

config_bp = Blueprint("config", __name__)

OPS = "ops"
CONFIG_DOC = "config"


def _env_demo_mode():
    return os.getenv("DEMO_MODE", "false").strip().lower() == "true"


def read_demo_mode():
    """True when the strip should show. Firestore wins over the env fallback."""
    try:
        snapshot = store.db().collection(OPS).document(CONFIG_DOC).get()
    except Exception:
        return _env_demo_mode()
    if not snapshot.exists:
        return _env_demo_mode()
    value = (snapshot.to_dict() or {}).get("demoMode")
    if isinstance(value, bool):
        return value
    return _env_demo_mode()


@config_bp.route("/config", methods=["GET"])
def config():
    """Public. Sign-in needs the demo strip before a token exists."""
    return jsonify({"demoMode": read_demo_mode()}), 200
