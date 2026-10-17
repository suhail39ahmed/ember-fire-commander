"""POST /observations for chip, text and photo reports, and a rejection for any later edit."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request

from assist import background as assist_background
from observations.notify import notify_observation, resend_pending
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

    record = assemble_record(prepared, g.user["id"], utc_now_iso(), g.user.get("displayName"))
    store = get_store()
    stored, created = store.create(record)
    if not created:
        # The same clientId was sent before (an outbox replay): answer with the stored report.
        return jsonify(_with_join(store, stored)), 200
    _hand_off(store, stored["id"])
    # The photo read and the English translation run after the report is stored and never delay it.
    assist_background.after_store(stored, g.user["id"])
    return jsonify(_with_join(store, stored)), 201


def _with_join(store, record):
    """The stored report, plus `join` when agents has already placed it. A failed read only leaves `join` out."""
    try:
        join = store.get_join(record["id"])
    except Exception:
        logger.warning("join read failed for observation %s", record.get("id"), exc_info=True)
        join = None
    return dict(record, join=join) if join else record


def _hand_off(store, observation_id):
    """Send the stored observation to agents. A failure leaves it queued for a later resend."""
    try:
        if notify_observation(observation_id):
            store.intake_done(observation_id)
            # Agents is answering, so this is a good moment to send any that missed it earlier.
            resend_pending(store, datetime.now(timezone.utc))
        else:
            store.intake_failed(observation_id, utc_now_iso())
    except Exception:
        logger.exception("agents hand-off failed for observation %s", observation_id)
