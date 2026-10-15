"""POST /internal/observations/<id>/intake, called by ember-api and voice-gateway.

The Cloud Run service is private, so IAM has already checked the caller's
ID token before a request reaches this code. The request has no body.
"""
import logging

from flask import Blueprint, jsonify

from clock import now_iso as _now
from fusion.notify import notify_withdraw
from fusion.rules import fuse
from fusion.settings import Settings
from fusion.store import get_store

logger = logging.getLogger(__name__)

bp = Blueprint("fusion", __name__)


@bp.post("/internal/observations/<observation_id>/intake")
def intake(observation_id):
    store = get_store()
    observation = store.get_observation(observation_id)
    if observation is None:
        return jsonify({
            "error": {"code": "not_found", "message": "observation not found"}
        }), 404
    observation["id"] = observation_id
    try:
        wind = store.wind_kmh()
    except Exception:
        logger.exception("wind lookup failed; the wind rule is skipped for this intake")
        wind = None
    plan = fuse(
        observation,
        store.load_state(),
        new_id=store.new_id,
        now=_now(),
        wind_kmh=wind,
        settings=Settings.from_env(),
    )
    if not plan.skipped:
        store.apply(plan)
        notify_withdraw(plan)
    return jsonify({"observationId": observation_id}), 202
