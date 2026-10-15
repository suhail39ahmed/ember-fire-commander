"""POST /internal/notifications/withdraw, called by ember-agents after a code WITHDRAW.

The incident is already stored. This route only sends. It reads the instruction
from the stored task, so the caller cannot put extra text in the push.

POST and DELETE /notifications/token let a signed-in volunteer add or drop one
of their own device tokens. The browser never writes Firestore.
"""
from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import store
from incidents.errors import ApiError, error_response, not_found, validation
from notifications import tokens
from notifications.caller import require_agents
from notifications.send import deliver_task

bp = Blueprint("notifications", __name__)


@bp.errorhandler(ApiError)
def _handle_api_error(exc):
    return error_response(exc)


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise validation("body", "send a JSON object")
    incident_id = body.get("incidentId")
    if not isinstance(incident_id, str) or not incident_id:
        raise validation("incidentId", "required, a non-empty string")
    tasks = body.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise validation("tasks", "required, a non-empty list")
    cleaned = []
    seen = set()
    for item in tasks:
        if not isinstance(item, dict):
            raise validation("tasks", "each item is an object with id and volunteerId")
        task_id = item.get("id")
        volunteer_id = item.get("volunteerId")
        if not isinstance(task_id, str) or not task_id:
            raise validation("tasks", "id is required")
        if not isinstance(volunteer_id, str) or not volunteer_id:
            raise validation("tasks", "volunteerId is required")
        if task_id in seen:
            continue
        seen.add(task_id)
        cleaned.append({"id": task_id, "volunteerId": volunteer_id})
    return incident_id, cleaned


def _withdraw_task(incident_id, volunteer_ids, item):
    snapshot = store.db().collection(store.TASKS).document(item["id"]).get()
    if not snapshot.exists:
        raise not_found("task")
    task = snapshot.to_dict() or {}
    if item["volunteerId"] not in volunteer_ids:
        raise validation("tasks", "volunteer is not on this withdraw")
    if (
        task.get("incidentId") != incident_id
        or task.get("volunteerId") != item["volunteerId"]
        or task.get("type") != "withdraw"
        or task.get("status") != "approved"
    ):
        raise validation("tasks", "task is not an approved withdraw task on this incident")
    task["id"] = snapshot.id
    return task


@bp.post("/internal/notifications/withdraw")
def withdraw_push():
    require_agents()
    incident_id, requested = _body()
    snapshot = store.db().collection(store.INCIDENTS).document(incident_id).get()
    if not snapshot.exists:
        raise not_found("incident")
    incident = snapshot.to_dict() or {}
    withdraw = incident.get("withdraw") or {}
    if not withdraw.get("active"):
        raise validation("incidentId", "withdraw is not active")
    volunteer_ids = set(withdraw.get("volunteerIds") or [])
    tasks = [_withdraw_task(incident_id, volunteer_ids, item) for item in requested]
    return jsonify({"results": [deliver_task(task) for task in tasks]}), 202


def _own_token():
    """The caller's own token from the body. The uid always comes from the ID token."""
    if g.user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only volunteers register devices")
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise validation("body", "send a JSON object")
    claimed = body.get("volunteerId")
    if claimed is not None and claimed != g.user["id"]:
        raise AuthError(403, "forbidden", "A volunteer can only change their own tokens")
    return tokens.clean(body.get("token"))


@bp.post("/notifications/token")
def register_token():
    token = _own_token()
    return jsonify({"stored": tokens.add(g.user["id"], token)}), 200


@bp.delete("/notifications/token")
def remove_token():
    token = _own_token()
    return jsonify({"removed": tokens.remove(g.user["id"], token)}), 200
