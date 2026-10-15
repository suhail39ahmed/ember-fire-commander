"""POST /observations for chip, text and photo reports, and a rejection for any later edit."""
import logging

from flask import Blueprint, g, jsonify, request

from observations.notify import notify_observation
from observations.photo import check_photo_path
from observations.store import assemble_record, get_store, utc_now_iso
from observations.validate import ValidationError, prepare_observation

logger = logging.getLogger(__name__)

bp = Blueprint("observations", __name__)


def _conflict():
    return jsonify({
        "error": {
            "code": "conflict",
            "message": "Observations are immutable",
        }
    }), 409


@bp.route("/observations", methods=["PUT", "PATCH", "DELETE"])
@bp.route("/observations/<observation_id>", methods=["PUT", "PATCH", "DELETE"])
def reject_edit(observation_id=None):
    return _conflict()


@bp.post("/observations")
def create_observation():
    body = request.get_json(silent=True)
    try:
        prepared = prepare_observation(body)
    except ValidationError as exc:
        return jsonify({
            "error": {
                "code": "validation_error",
                "message": exc.message,
                "fields": exc.fields,
            }
        }), 400

    if prepared["source"] == "photo":
        check_photo_path(g.user["id"], prepared["photoPath"])

    record = assemble_record(prepared, g.user["id"], utc_now_iso())
    stored, created = get_store().create(record)
    if not created:
        # The same clientId was sent before (an outbox replay): answer with the stored report.
        return jsonify(stored), 200
    try:
        notify_observation(stored["id"])
    except Exception:
        logger.exception("agents notify failed for observation %s", stored["id"])
    return jsonify(stored), 201
