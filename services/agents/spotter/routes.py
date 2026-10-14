"""Private spotter routes. Cloud Run IAM limits callers to backend services.

POST /internal/observations/<id>/triage   advisory photo triage
POST /internal/incidents/<id>/summary     advisory EN/ID summary

Optional JSON body for triage: {"callerId": "<uid>"}. When the calling
service passes the signed-in uid, the photo path must belong to it too.
"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from spotter import model as model_module
from spotter.store import get_store
from spotter.summary import summarize
from spotter.triage import PhotoRejected, rejected_record, triage

logger = logging.getLogger(__name__)

bp = Blueprint("spotter", __name__)


def _now():
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


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
        record = triage(observation, store.read_photo, model_module.get_model(), now, caller_id)
    except PhotoRejected as exc:
        store.put("photo_triage", rejected_record(observation, exc.reason, now))
        return _error(403, "forbidden", exc.reason)
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
