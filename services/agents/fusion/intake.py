"""POST /internal/observations/<id>/intake, called by ember-api and voice-gateway.

The Cloud Run service is private, so IAM has already checked the caller's
ID token before a request reaches this code. The request has no body.
"""
import logging

from flask import Blueprint, jsonify

from clock import now_iso as _now
from fusion.notify import notify_withdraw
from fusion.places import incident_name, place_label
from fusion.rules import fuse
from fusion.settings import Settings
from fusion.store import get_store

logger = logging.getLogger(__name__)

bp = Blueprint("fusion", __name__)


def _reporter_name(store, observation):
    """The first reporter's display name: stored on the report, else the volunteer record, else None."""
    name = observation.get("volunteerName")
    if name:
        return name
    try:
        return store.volunteer_name(observation.get("volunteerId"))
    except Exception:
        logger.warning("volunteer name lookup failed for %s", observation.get("volunteerId"), exc_info=True)
        return None


def _name_incident(store, incident, observation):
    """Give a new incident its area ("Bengkalis, Riau") and readable name ("Bengkalis, Riau · Pak Dedi · #3").

    The area needs no lookup, so it is always written. A counter or name failure leaves
    the incident without a name and the console shows a short form of its id.
    Intake must never fail because of a label.
    """
    incident["area"] = place_label(incident["lat"], incident["lng"])
    try:
        number = store.next_incident_number()
        incident["name"] = incident_name(
            incident["lat"], incident["lng"], _reporter_name(store, observation), number
        )
    except Exception:
        logger.exception("could not name incident %s; it is created without a name", incident["id"])


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
        if plan.incident_is_new:
            _name_incident(store, plan.incident, observation)
        store.apply(plan)
        notify_withdraw(plan)
    return jsonify({"observationId": observation_id}), 202
