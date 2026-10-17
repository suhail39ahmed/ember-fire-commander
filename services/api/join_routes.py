"""Join requests: a volunteer asks to join a live fire near them, a supervisor decides (contract 6.12).

Approval adds the volunteer the normal way, with an approved `instruct` task, so the digest rules and the
push path stay as they are. Every write commits the request change and its audit rows in one transaction.
The push goes out after the commit and a failed push does not undo it.
"""
import logging

from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import rules, store
from incidents.errors import ApiError, conflict, error_response, not_found, validation
from incidents.routes import _known_volunteer
from notifications.send import deliver_task

logger = logging.getLogger(__name__)

join_bp = Blueprint("join", __name__)

REQUEST_FIELDS = ("id", "incidentId", "volunteerId", "volunteerName", "status", "createdAt", "decidedAt", "decidedBy", "taskId")


@join_bp.errorhandler(ApiError)
def _handle_api_error(exc):
    return error_response(exc)


def _require(role):
    if g.user["role"] != role:
        raise AuthError(403, "forbidden", f"Only a {role} can do this")


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "validation_error", "Body must be a JSON object", {"body": "send a JSON object"})
    return body


def _ref(collection, doc_id):
    return store.db().collection(collection).document(doc_id)


def _audit(transaction, action, target_id, subject_id=None):
    audit_ref = store.db().collection(store.AUDIT).document()
    transaction.set(
        audit_ref,
        rules.audit_record(audit_ref.id, g.user["id"], action, target_id, subject_id, g.user.get("displayName")),
    )
    return audit_ref.id


def _record(request_id, data):
    return rules.pick(dict(data, id=request_id), REQUEST_FIELDS)


def _push_after_commit(task):
    try:
        deliver_task(task)
    except Exception:
        logger.exception("push failed for task %s", task.get("id"))


# Volunteer -------------------------------------------------------------------

@join_bp.route("/incidents/<incident_id>/join-requests", methods=["POST"])
def request_join(incident_id):
    """Ask to join a live fire. One request per volunteer and incident, so a repeat changes nothing."""
    _require("volunteer")
    uid = g.user["id"]
    incident_snap = _ref(store.INCIDENTS, incident_id).get()
    if not incident_snap.exists:
        raise not_found("incident")
    incident = incident_snap.to_dict() or {}
    if incident.get("status") == "extinguished":
        raise conflict("This fire is out")
    if _known_volunteer(incident_id, incident, uid):
        raise conflict("You are already on this incident")
    request_id = f"{incident_id}__{uid}"
    name = g.user.get("displayName")

    def run(transaction):
        ref = _ref(store.JOIN_REQUESTS, request_id)
        existing = ref.get(transaction=transaction)
        if existing.exists:
            data = existing.to_dict() or {}
            if data.get("status") == "pending":
                return _record(request_id, data), None, 200
            raise conflict("Your request was already answered")
        data = {
            "incidentId": incident_id,
            "volunteerId": uid,
            "volunteerName": name.strip()[:80] if isinstance(name, str) and name.strip() else None,
            "status": "pending",
            "createdAt": rules.now_iso(),
            "decidedAt": None,
            "decidedBy": None,
            "taskId": None,
        }
        transaction.set(ref, data)
        return _record(request_id, data), _audit(transaction, "join.request", incident_id, uid), 201

    record, audit_id, status = store.run_transaction(run)
    return jsonify({"joinRequest": record, "auditId": audit_id}), status


# Supervisor ------------------------------------------------------------------

@join_bp.route("/join-requests", methods=["GET"])
def list_join_requests():
    """Pending join requests, oldest first, each with a summary of its incident."""
    _require("supervisor")
    if request.args.get("status") != "pending":
        raise validation("status", "send status=pending")
    pending = sorted(
        (s for s in store.where(store.JOIN_REQUESTS, "status", "==", "pending")),
        key=lambda s: (str((s.to_dict() or {}).get("createdAt") or ""), s.id),
    )
    incidents = store.get_many(store.INCIDENTS, [(s.to_dict() or {}).get("incidentId") for s in pending if (s.to_dict() or {}).get("incidentId")])
    rows = []
    for snap in pending:
        data = snap.to_dict() or {}
        incident = incidents.get(data.get("incidentId"))
        summary = None
        if incident is not None:
            summary = rules.to_record(incident, rules.SUMMARY_FIELDS)
            summary["label"] = rules.incident_label(incident.to_dict() or {})
        rows.append({"request": _record(snap.id, data), "incident": summary, "volunteerName": data.get("volunteerName")})
    return jsonify(rows), 200


def _decide(request_id, action, apply):
    """Read the request in a transaction, let apply() validate it and add writes, and append the audit row."""
    _require("supervisor")
    if not _ref(store.JOIN_REQUESTS, request_id).get().exists:
        raise not_found("join request")

    def run(transaction):
        ref = _ref(store.JOIN_REQUESTS, request_id)
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise not_found("join request")
        data = snapshot.to_dict() or {}
        if data.get("status") != "pending":
            raise conflict("This request was already answered")
        changes, extra = apply(transaction, data)
        changes = dict(changes, decidedAt=rules.now_iso(), decidedBy=g.user["id"])
        transaction.update(ref, changes)
        audit_id = _audit(transaction, action, request_id, data.get("volunteerId"))
        return _record(request_id, data | changes), extra, audit_id

    return store.run_transaction(run)


@join_bp.route("/join-requests/<request_id>/approve", methods=["POST"])
def approve_join(request_id):
    """Add the volunteer: an approved `instruct` task is created and pushed, like a supervisor's own instruction."""
    _require("supervisor")
    instruction = _body().get("instruction")
    if not isinstance(instruction, str) or not instruction.strip():
        raise validation("instruction", "required, a non-empty string")
    if len(instruction) > rules.INSTRUCTION_MAX:
        raise validation("instruction", f"at most {rules.INSTRUCTION_MAX} characters")

    def apply(transaction, data):
        incident = _ref(store.INCIDENTS, data["incidentId"]).get(transaction=transaction)
        if not incident.exists:
            raise not_found("incident")
        if (incident.to_dict() or {}).get("status") == "extinguished":
            raise conflict("An extinguished incident takes no new instruction")
        task_ref = store.db().collection(store.TASKS).document()
        task = {
            "incidentId": data["incidentId"],
            "volunteerId": data["volunteerId"],
            "type": "instruct",
            "status": "approved",
            "instruction": instruction.strip(),
            "sentAt": rules.now_iso(),
            "sendCount": 1,
        }
        transaction.set(task_ref, task)
        _audit(transaction, "task.instruct", task_ref.id)
        body = rules.with_receipt(rules.pick(dict(task, id=task_ref.id), rules.TASK_FIELDS))
        return {"status": "approved", "taskId": task_ref.id}, body

    join_request, task, audit_id = _decide(request_id, "join.approve", apply)
    _push_after_commit(task)
    return jsonify({"joinRequest": join_request, "task": task, "auditId": audit_id}), 200


@join_bp.route("/join-requests/<request_id>/decline", methods=["POST"])
def decline_join(request_id):
    join_request, _, audit_id = _decide(request_id, "join.decline", lambda transaction, data: ({"status": "declined"}, None))
    return jsonify({"joinRequest": join_request, "auditId": audit_id}), 200
