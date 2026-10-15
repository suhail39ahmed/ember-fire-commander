"""Private spotter routes. Cloud Run IAM limits callers to backend services.

POST /internal/observations/<id>/triage   advisory photo triage
POST /internal/incidents/<id>/summary     advisory EN/ID summary

A model or storage failure stores a photo_triage record with status "error"
and returns 502; an oversized photo returns 413 before it is downloaded.

Optional JSON body for triage: {"callerId": "<uid>"}. When the calling
service passes the signed-in uid, the photo path must belong to it too.
"""
import logging

from flask import Blueprint, jsonify, request

from clock import now_iso as _now
from spotter import model as model_module
from spotter.store import get_store
from spotter.summary import summarize
from spotter.triage import (
    PhotoRejected,
    PhotoTooLarge,
    TriageFailed,
    error_record,
    rejected_record,
    triage,
)

logger = logging.getLogger(__name__)

bp = Blueprint("spotter", __name__)


def _error(status, code, message):
    return jsonify({"error": {"code": code, "message": message}}), status


@bp.post("/internal/observations/<observation_id>/triage")
def photo_triage(observation_id):
    store = get_store()
    observation = store.get("observations", observation_id)
    if observation is None:
        return _error(404, "not_found", "observation not found")
    observation["id"] = observation_id
    body = request.get_json(silent=True) or {}
    caller_id = body.get("callerId") if isinstance(body, dict) else None
    now = _now()
    try:
        record = triage(
            observation,
            store.read_photo,
            model_module.get_model(),
            now,
            caller_id,
            photo_size=store.photo_size,
        )
    except PhotoTooLarge as exc:
        store.put("photo_triage", rejected_record(observation, exc.reason, now))
        return _error(413, "photo_too_large", exc.reason)
    except PhotoRejected as exc:
        store.put("photo_triage", rejected_record(observation, exc.reason, now))
        return _error(403, "forbidden", exc.reason)
    except TriageFailed as exc:
        logger.warning(
            "photo triage failed for observation %s: %s", observation_id, exc.reason,
            exc_info=exc.__cause__,
        )
        store.put("photo_triage", error_record(observation, exc.reason, now))
        return _error(502, "triage_failed", exc.reason)
    store.put("photo_triage", record)
    return jsonify(record), 200


@bp.post("/internal/incidents/<incident_id>/summary")
def incident_summary(incident_id):
    store = get_store()
    incident = store.get("incidents", incident_id)
    if incident is None:
        return _error(404, "not_found", "incident not found")
    ids = list(incident.get("observationIds") or [])
    conflict = store.get("conflicts", incident["conflictId"]) if incident.get("conflictId") else None
    record = summarize(
        incident,
        store.observations_for(ids),
        conflict,
        store.triages_for(ids),
        model_module.get_model(),
        _now(),
    )
    store.put("incident_summaries", record)
    return jsonify(record), 200
