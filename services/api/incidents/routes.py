"""Incident reads, the digest, and supervisor decisions (contract 6.3 to 6.5).

Reads are open to both roles and scoped by role. Every write route is
supervisor-only and commits the change and its audit record together.
A task or WITHDRAW push runs only after that commit, and a failed push
does not undo it.
"""
import logging

from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import rules, store
from incidents.errors import ApiError, conflict, error_response, not_found, validation
from notifications.send import deliver_task

logger = logging.getLogger(__name__)

incidents_bp = Blueprint("incidents", __name__)


@incidents_bp.errorhandler(ApiError)
def _handle_api_error(exc):
    return error_response(exc)


def _require_supervisor():
    if g.user["role"] != "supervisor":
        raise AuthError(403, "forbidden", "Only a supervisor can do this")


def _ref(collection, doc_id):
    return store.db().collection(collection).document(doc_id)


def _get(collection, doc_id, transaction=None):
    snapshot = _ref(collection, doc_id).get(transaction=transaction)
    return snapshot if snapshot.exists else None


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "validation_error", "Body must be a JSON object", {"body": "send a JSON object"})
    return body


# Reads ---------------------------------------------------------------------

def _my_observation_ids(uid):
    return {snap.id for snap in store.where(store.OBSERVATIONS, "volunteerId", "==", uid)}


def _incident_observation_ids(data, conflict_data):
    if conflict_data:
        return list(conflict_data.get("observationIds") or [])
    return list(data.get("observationIds") or [])


def _volunteer_incident_ids(uid):
    """Incidents linked to the caller's observations, tasks or withdraw instruction."""
    linked = {snap.to_dict().get("incidentId") for snap in store.where(store.TASKS, "volunteerId", "==", uid)}
    mine = _my_observation_ids(uid)
    if mine:
        for snap in store.db().collection(store.CONFLICTS).stream():
            data = snap.to_dict() or {}
            if mine.intersection(data.get("observationIds") or []):
                linked.add(data.get("incidentId"))
    for snap in store.db().collection(store.INCIDENTS).stream():
        data = snap.to_dict() or {}
        withdraw = data.get("withdraw") or {}
        if mine.intersection(data.get("observationIds") or []) or uid in (withdraw.get("volunteerIds") or []):
            linked.add(snap.id)
    linked.discard(None)
    return linked


def _scoped_incidents():
    user = g.user
    snaps = list(store.db().collection(store.INCIDENTS).stream())
    if user["role"] == "supervisor":
        snaps = [s for s in snaps if (s.to_dict() or {}).get("status") in rules.LIVE_STATUSES]
    else:
        linked = _volunteer_incident_ids(user["id"])
        snaps = [s for s in snaps if s.id in linked]
    return sorted(snaps, key=lambda s: s.id)


def _tasks_for(incident_id):
    tasks = [rules.to_record(s, rules.TASK_FIELDS) for s in store.where(store.TASKS, "incidentId", "==", incident_id)]
    return sorted(tasks, key=lambda t: t["id"])


def _open_conflict_ids(incident_id, conflict_id):
    open_ids = {
        s.id for s in store.where(store.CONFLICTS, "incidentId", "==", incident_id)
        if (s.to_dict() or {}).get("status") == "open"
    }
    if conflict_id:
        open_ids.add(conflict_id)
    return open_ids


@incidents_bp.route("/incidents", methods=["GET"])
def list_incidents():
    return jsonify([rules.to_record(s, rules.INCIDENT_FIELDS) for s in _scoped_incidents()]), 200


@incidents_bp.route("/incidents/<incident_id>", methods=["GET"])
def get_incident(incident_id):
    user = g.user
    snapshot = _get(store.INCIDENTS, incident_id)
    if snapshot is None:
        raise not_found("incident")
    if user["role"] != "supervisor" and incident_id not in _volunteer_incident_ids(user["id"]):
        raise not_found("incident")
    data = snapshot.to_dict() or {}

    conflict_body = None
    if data.get("conflictId"):
        conflict_snap = _get(store.CONFLICTS, data["conflictId"])
        if conflict_snap is not None:
            conflict_body = rules.to_record(conflict_snap, rules.CONFLICT_FIELDS)

    observations = []
    for obs_id in _incident_observation_ids(data, conflict_body):
        obs = _get(store.OBSERVATIONS, obs_id)
        if obs is not None:
            observations.append(rules.to_record(obs, rules.OBSERVATION_FIELDS))

    tasks = _tasks_for(incident_id)
    if user["role"] != "supervisor":
        tasks = [t for t in tasks if t["volunteerId"] == user["id"]]

    return jsonify({
        "incident": rules.to_record(snapshot, rules.INCIDENT_FIELDS),
        "observations": observations,
        "conflict": conflict_body,
        "tasks": tasks,
    }), 200


@incidents_bp.route("/digest", methods=["GET"])
def digest():
    user = g.user
    incidents = [rules.to_record(s, rules.SUMMARY_FIELDS) for s in _scoped_incidents()]
    my_tasks = []
    if user["role"] == "volunteer":
        my_tasks = sorted(
            (rules.to_record(s, rules.TASK_FIELDS) for s in store.where(store.TASKS, "volunteerId", "==", user["id"])),
            key=lambda t: t["id"],
        )
    return jsonify({"updatedAt": rules.now_iso(), "incidents": incidents, "myTasks": my_tasks}), 200


# Supervisor decisions ------------------------------------------------------

def _commit_with_audit(transaction, target_ref, changes, action, target_id):
    audit_ref = store.db().collection(store.AUDIT).document()
    if changes:
        transaction.update(target_ref, changes)
    transaction.set(audit_ref, rules.audit_record(audit_ref.id, g.user["id"], action, target_id))
    return audit_ref.id


def _decide_task(task_id, action, apply):
    """Load the task in a transaction, let apply() validate it, then write task and audit."""
    _require_supervisor()
    pre = _get(store.TASKS, task_id)
    if pre is None:
        raise not_found("task")
    pre_data = pre.to_dict() or {}
    open_conflicts = set()
    if action == "task.approve" and pre_data.get("type") == "investigate":
        incident = _get(store.INCIDENTS, pre_data.get("incidentId") or "")
        conflict_id = (incident.to_dict() or {}).get("conflictId") if incident else None
        open_conflicts = _open_conflict_ids(pre_data.get("incidentId"), conflict_id)

    def run(transaction):
        ref = _ref(store.TASKS, task_id)
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise not_found("task")
        task = snapshot.to_dict() or {}
        held = False
        for conflict_id in open_conflicts:
            con = _ref(store.CONFLICTS, conflict_id).get(transaction=transaction)
            if con.exists and (con.to_dict() or {}).get("status") == "open":
                held = True
        changes = apply(task, held)
        audit_id = _commit_with_audit(transaction, ref, changes, action, task_id)
        task.update(changes)
        task["id"] = task_id
        return rules.pick(task, rules.TASK_FIELDS), audit_id

    task, audit_id = store.run_transaction(run)
    return task, audit_id


def _task_response(task, audit_id):
    return jsonify({"task": task, "auditId": audit_id}), 200


def _push_after_commit(task):
    """Send after the task write. A failure here leaves the task as it was committed."""
    try:
        deliver_task(task)
    except Exception:
        logger.exception("push failed for task %s", task.get("id"))


def _check_proposed(task, verb):
    if task.get("type") == "withdraw":
        raise conflict(f"A withdraw task is never proposed and cannot be {verb}")
    if task.get("status") != "proposed":
        raise conflict(f"Only a proposed task can be {verb}")


@incidents_bp.route("/tasks/<task_id>/approve", methods=["POST"])
def approve_task(task_id):
    def apply(task, held):
        _check_proposed(task, "approved")
        if task.get("type") == "investigate" and held:
            raise conflict("Dispatch is held while this incident has an open conflict")
        return {"status": "approved"}

    task, audit_id = _decide_task(task_id, "task.approve", apply)
    _push_after_commit(task)
    return _task_response(task, audit_id)


@incidents_bp.route("/tasks/<task_id>/reject", methods=["POST"])
def reject_task(task_id):
    def apply(task, held):
        _check_proposed(task, "rejected")
        return {"status": "rejected"}

    return _task_response(*_decide_task(task_id, "task.reject", apply))


@incidents_bp.route("/tasks/<task_id>/edit", methods=["POST"])
def edit_task(task_id):
    _require_supervisor()
    instruction = _body().get("instruction")
    if not isinstance(instruction, str) or not instruction.strip():
        raise validation("instruction", "required, a non-empty string")
    if len(instruction) > rules.INSTRUCTION_MAX:
        raise validation("instruction", f"at most {rules.INSTRUCTION_MAX} characters")

    def apply(task, held):
        if task.get("type") == "withdraw":
            raise conflict("A withdraw instruction cannot be edited")
        return {"instruction": instruction.strip()}

    return _task_response(*_decide_task(task_id, "task.edit", apply))


def _decide_incident(incident_id, action, apply):
    _require_supervisor()
    if _get(store.INCIDENTS, incident_id) is None:
        raise not_found("incident")

    def run(transaction):
        ref = _ref(store.INCIDENTS, incident_id)
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise not_found("incident")
        incident = snapshot.to_dict() or {}
        changes = apply(incident)
        audit_id = _commit_with_audit(transaction, ref, changes, action, incident_id)
        incident.update(changes)
        incident["id"] = incident_id
        return rules.pick(incident, rules.INCIDENT_FIELDS), audit_id

    incident, audit_id = store.run_transaction(run)
    return jsonify({"incident": incident, "auditId": audit_id}), 200


@incidents_bp.route("/incidents/<incident_id>/verify", methods=["POST"])
def verify_incident(incident_id):
    def apply(incident):
        if incident.get("status") not in ("open", "held"):
            raise conflict(f"An incident that is {incident.get('status')} cannot be verified")
        return {"status": "verified"}

    return _decide_incident(incident_id, "incident.verify", apply)


@incidents_bp.route("/incidents/<incident_id>/extinguish", methods=["POST"])
def extinguish_incident(incident_id):
    def apply(incident):
        if incident.get("status") == "extinguished":
            raise conflict("The incident is already extinguished")
        return {"status": "extinguished"}

    return _decide_incident(incident_id, "incident.extinguish", apply)


@incidents_bp.route("/incidents/<incident_id>/severity", methods=["POST"])
def lower_severity(incident_id):
    _require_supervisor()
    severity = _body().get("severity")
    if severity not in rules.SEVERITY_ORDER:
        raise validation("severity", "use none, smoke, small_flame, or large_flame")

    def apply(incident):
        if not rules.is_lower(severity, incident.get("severity")):
            raise conflict("Severity can only be lowered by this route")
        # Only severity changes. An active withdraw stays in effect.
        return {"severity": severity}

    return _decide_incident(incident_id, "incident.severity.lower", apply)


def _withdraw_body():
    body = _body()
    volunteer_ids = body.get("volunteerIds")
    if (
        not isinstance(volunteer_ids, list)
        or not volunteer_ids
        or not all(isinstance(v, str) and v for v in volunteer_ids)
    ):
        raise validation("volunteerIds", "required, a non-empty list of volunteer ids")
    instruction = body.get("instruction")
    if not isinstance(instruction, str) or not instruction.strip():
        raise validation("instruction", "required, a non-empty string")
    if len(instruction) > rules.INSTRUCTION_MAX:
        raise validation("instruction", f"at most {rules.INSTRUCTION_MAX} characters")
    reasons = body.get("reasons", [])
    if not isinstance(reasons, list) or not all(isinstance(r, str) for r in reasons):
        raise validation("reasons", "a list of strings")
    return list(dict.fromkeys(volunteer_ids)), instruction.strip(), reasons


def _volunteers_on(incident_id, data):
    """Volunteers who already have an observation or a task on this incident."""
    volunteers = {(s.to_dict() or {}).get("volunteerId") for s in store.where(store.TASKS, "incidentId", "==", incident_id)}
    obs_ids = set(data.get("observationIds") or [])
    if data.get("conflictId"):
        con = _get(store.CONFLICTS, data["conflictId"])
        if con is not None:
            obs_ids.update((con.to_dict() or {}).get("observationIds") or [])
    for obs_id in obs_ids:
        obs = _get(store.OBSERVATIONS, obs_id)
        if obs is not None:
            volunteers.add((obs.to_dict() or {}).get("volunteerId"))
    volunteers.discard(None)
    return volunteers


@incidents_bp.route("/incidents/<incident_id>/withdraw", methods=["POST"])
def withdraw(incident_id):
    """Issue a withdraw instruction now. This is not an approval and never waits."""
    _require_supervisor()
    volunteer_ids, instruction, reasons = _withdraw_body()
    pre = _get(store.INCIDENTS, incident_id)
    if pre is None:
        raise not_found("incident")
    unknown = [v for v in volunteer_ids if v not in _volunteers_on(incident_id, pre.to_dict() or {})]
    if unknown:
        raise validation("volunteerIds", "each volunteer needs an observation or a task on this incident")

    def run(transaction):
        ref = _ref(store.INCIDENTS, incident_id)
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise not_found("incident")
        incident = snapshot.to_dict() or {}
        current = incident.get("withdraw") or {}
        # Volunteers already withdrawn stay withdrawn.
        targets = list(dict.fromkeys(list(current.get("volunteerIds") or []) + volunteer_ids)) if current.get("active") else volunteer_ids
        changes = {"withdraw": {
            "active": True,
            "instruction": instruction,
            "reasons": reasons,
            "volunteerIds": targets,
        }}
        created = []
        for volunteer_id in volunteer_ids:
            task_ref = store.db().collection(store.TASKS).document()
            task = {
                "incidentId": incident_id,
                "volunteerId": volunteer_id,
                "type": "withdraw",
                "status": "approved",
                "instruction": instruction,
            }
            transaction.set(task_ref, task)
            created.append(dict(task, id=task_ref.id))
        audit_id = _commit_with_audit(transaction, ref, changes, "task.withdraw", incident_id)
        incident.update(changes)
        incident["id"] = incident_id
        return rules.pick(incident, rules.INCIDENT_FIELDS), audit_id, created

    incident, audit_id, created = store.run_transaction(run)
    for task in created:
        _push_after_commit(task)
    return jsonify({"incident": incident, "auditId": audit_id}), 200
