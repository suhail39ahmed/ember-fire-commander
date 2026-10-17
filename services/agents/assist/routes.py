"""Private assist routes. Cloud Run IAM limits callers to backend services.

POST /internal/incidents/<id>/suggestions     short advisory suggestions
POST /internal/incidents/<id>/ask             answer a supervisor's question
POST /internal/observations/<id>/translate    English translation of a report's text

Nothing here sets incident severity, status, withdraw or tasks. A model
failure never fails suggestions (a rule-based list is stored instead). For
ask and translate it returns 502 `model_unavailable` and stores nothing.
"""
import logging

from flask import Blueprint, jsonify, request

from assist import facts as facts_module
from assist.ask import QUESTION_MAX, AskFailed, ask
from assist.store import get_store
from assist.suggest import suggest
from assist.translate import TranslateFailed, record_for
from clock import now_iso as _now
from spotter import model as model_module

logger = logging.getLogger(__name__)

bp = Blueprint("assist", __name__)


def _error(status, code, message):
    return jsonify({"error": {"code": code, "message": message}}), status


def _facts_for(store, incident):
    ids = list(incident.get("observationIds") or [])
    conflict = store.get("conflicts", incident["conflictId"]) if incident.get("conflictId") else None
    observations = store.observations_for(ids)
    tasks = store.tasks_for(incident["id"])
    uids = {o.get("volunteerId") for o in observations} | {t.get("volunteerId") for t in tasks}
    uids.discard(None)
    return facts_module.build(
        incident, observations, conflict, store.triages_for(ids), tasks,
        store.volunteers_for(sorted(uids)) if uids else {}, store.weather(),
    )


@bp.post("/internal/incidents/<incident_id>/suggestions")
def incident_suggestions(incident_id):
    store = get_store()
    incident = store.get("incidents", incident_id)
    if incident is None:
        return _error(404, "not_found", "incident not found")
    record = suggest(incident_id, _facts_for(store, incident), model_module.get_model(), _now())
    store.put("incident_suggestions", record)
    return jsonify(record), 200


@bp.post("/internal/incidents/<incident_id>/ask")
def incident_ask(incident_id):
    body = request.get_json(silent=True)
    body = body if isinstance(body, dict) else {}
    question = body.get("question")
    volunteer_id = body.get("volunteerId")
    if not (isinstance(question, str) and question.strip()) or len(question.strip()) > QUESTION_MAX:
        return _error(400, "validation_error", f"question is required, at most {QUESTION_MAX} characters")
    if volunteer_id is not None and not isinstance(volunteer_id, str):
        return _error(400, "validation_error", "volunteerId must be a string")
    store = get_store()
    incident = store.get("incidents", incident_id)
    if incident is None:
        return _error(404, "not_found", "incident not found")
    facts = _facts_for(store, incident)
    if volunteer_id:
        facts = facts_module.focus(facts, volunteer_id)
        if facts is None:
            return _error(404, "not_found", "volunteer is not on this incident")
    try:
        return jsonify(ask(incident_id, question.strip(), facts, model_module.get_model(), _now())), 200
    except AskFailed as exc:
        logger.warning("ask failed for incident %s: %s", incident_id, exc, exc_info=exc.__cause__)
        return _error(502, "model_unavailable", "the model could not answer")


@bp.post("/internal/observations/<observation_id>/translate")
def observation_translate(observation_id):
    store = get_store()
    observation = store.get("observations", observation_id)
    if observation is None:
        return _error(404, "not_found", "observation not found")
    if not (isinstance(observation.get("text"), str) and observation["text"].strip()):
        return _error(400, "validation_error", "observation has no text")
    # A report never changes, so a stored translation is final. Repeat calls cost nothing.
    stored = store.get("observation_translations", observation_id)
    if stored is not None:
        return jsonify(stored), 200
    try:
        record = record_for(observation, model_module.get_model(), _now())
    except TranslateFailed as exc:
        logger.warning("translation failed for observation %s: %s", observation_id, exc, exc_info=exc.__cause__)
        return _error(502, "model_unavailable", "the model could not translate")
    store.put("observation_translations", record)
    return jsonify(record), 200
