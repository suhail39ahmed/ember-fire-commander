"""Supervisor routes that call the advisory agents routes (contract 6.13).

POST /incidents/{id}/suggestions                       make fresh suggestions, stored for the incident
POST /incidents/{id}/ask                               answer a question from stored facts
POST /incidents/{id}/observations/{oid}/translate      English translation of one report's text

Supervisor only. Every answer is advisory text: none of these routes changes an
incident, a severity, a task or a withdraw. When agents or the model is not
available the answer is a 502 or 503 and nothing is stored.
"""
import logging

from flask import Blueprint, g, jsonify, request

from assist import client
from identity import AuthError
from incidents import store
from incidents.errors import ApiError, error_response, not_found, validation

logger = logging.getLogger(__name__)

assist_bp = Blueprint("assist", __name__)

QUESTION_MAX = 500


@assist_bp.errorhandler(ApiError)
def _handle_api_error(exc):
    return error_response(exc)


def _require_supervisor():
    if g.user["role"] != "supervisor":
        raise AuthError(403, "forbidden", "Only a supervisor can do this")


def _incident(incident_id):
    snapshot = store.db().collection(store.INCIDENTS).document(incident_id).get()
    if not snapshot.exists:
        raise not_found("incident")
    return snapshot.to_dict() or {}


def _call(path, payload=None):
    """Call agents and map its failures to this API's errors."""
    try:
        return client.post(path, payload)
    except client.AgentsRejected as exc:
        if exc.status == 404:
            raise ApiError(404, "not_found", exc.message or "not found")
        if exc.status == 400:
            raise ApiError(400, "validation_error", exc.message or "request is not valid")
        logger.warning("agents refused %s with %s", path, exc.status)
        raise ApiError(502, "agents_unavailable", "The agents service could not do this")
    except client.AgentsUnavailable as exc:
        logger.warning("agents call %s failed: %s", path, exc)
        status = 503 if not client.agents_url() else 502
        raise ApiError(status, "agents_unavailable", "The agents service is not available right now")


@assist_bp.post("/incidents/<incident_id>/suggestions")
def make_suggestions(incident_id):
    _require_supervisor()
    _incident(incident_id)
    record = _call(f"/internal/incidents/{incident_id}/suggestions")
    # The same shape the supervisor's incident read carries as `suggestions`.
    items = [
        {"text": i.get("text"), "rationale": i.get("rationale")}
        for i in record.get("suggestions") or [] if isinstance(i, dict) and i.get("text")
    ]
    return jsonify({"items": items, "source": record.get("source"), "generatedAt": record.get("generatedAt")}), 200


@assist_bp.post("/incidents/<incident_id>/ask")
def ask(incident_id):
    _require_supervisor()
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "validation_error", "Body must be a JSON object", {"body": "send a JSON object"})
    question = body.get("question")
    if not isinstance(question, str) or not question.strip() or len(question.strip()) > QUESTION_MAX:
        raise validation("question", f"required, not blank, at most {QUESTION_MAX} characters")
    volunteer_id = body.get("volunteerId")
    if volunteer_id is not None and (not isinstance(volunteer_id, str) or not volunteer_id.strip()):
        raise validation("volunteerId", "a volunteer id, or leave it out")
    _incident(incident_id)
    payload = {"question": question.strip()}
    if volunteer_id:
        payload["volunteerId"] = volunteer_id.strip()
    record = _call(f"/internal/incidents/{incident_id}/ask", payload)
    return jsonify({k: record.get(k) for k in ("answer", "enoughData", "at")}), 200


@assist_bp.post("/incidents/<incident_id>/observations/<observation_id>/translate")
def translate(incident_id, observation_id):
    _require_supervisor()
    data = _incident(incident_id)
    known = set(data.get("observationIds") or [])
    if data.get("conflictId"):
        snapshot = store.db().collection(store.CONFLICTS).document(data["conflictId"]).get()
        if snapshot.exists:
            known |= set((snapshot.to_dict() or {}).get("observationIds") or [])
    if observation_id not in known:
        raise not_found("observation")
    record = _call(f"/internal/observations/{observation_id}/translate")
    return jsonify({k: record.get(k) for k in ("observationId", "sourceLanguage", "english", "at")}), 200
