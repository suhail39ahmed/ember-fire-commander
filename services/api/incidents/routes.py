"""Incident reads, the digest, and supervisor decisions (contract 6.3 to 6.5).

Reads are open to both roles and scoped by role. Every write route is
supervisor-only and commits the change and its audit record together.
A task or WITHDRAW push runs only after that commit, and a failed push
does not undo it.
"""
import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import detail as incident_detail, rules, store
from incidents.errors import ApiError, conflict, error_response, not_found, validation
from notifications.send import deliver_task
from photos import paths as photo_paths, signing

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


def _volunteer_incident_snapshots(uid):
    """Incidents linked to the caller's observations, tasks or withdraw instruction, by id.

    Every step is a filtered query, so the cost follows the caller's own data,
    not the size of the incidents and conflicts collections.
    """
    linked = {}
    task_incident_ids = [
        (snap.to_dict() or {}).get("incidentId") for snap in store.where(store.TASKS, "volunteerId", "==", uid)
    ]
    linked.update(store.get_many(store.INCIDENTS, [i for i in task_incident_ids if i]))

    mine = sorted(_my_observation_ids(uid))
    conflict_incident_ids = [
        (snap.to_dict() or {}).get("incidentId")
        for snap in store.where_any(store.CONFLICTS, "observationIds", "array_contains_any", mine)
    ]
    linked.update(store.get_many(store.INCIDENTS, [i for i in conflict_incident_ids if i and i not in linked]))

    for snap in store.where_any(store.INCIDENTS, "observationIds", "array_contains_any", mine):
        linked[snap.id] = snap
    for snap in store.where(store.INCIDENTS, "withdraw.volunteerIds", "array_contains", uid):
        linked[snap.id] = snap
    return linked


def _scoped_incidents():
    user = g.user
    if user["role"] == "supervisor":
        snaps = store.where(store.INCIDENTS, "status", "in", list(rules.LIVE_STATUSES))
    else:
        snaps = list(_volunteer_incident_snapshots(user["id"]).values())
    return sorted(snaps, key=lambda s: s.id)


def _volunteer_on_incident(uid, data, observations, tasks):
    """True when the caller has a task, a withdraw instruction or an observation on this incident."""
    if any(t["volunteerId"] == uid for t in tasks):
        return True
    if uid in ((data.get("withdraw") or {}).get("volunteerIds") or []):
        return True
    return any((obs.to_dict() or {}).get("volunteerId") == uid for obs in observations.values())


def _tasks_for(incident_id):
    tasks = [rules.with_receipt(rules.to_record(s, rules.TASK_FIELDS)) for s in store.where(store.TASKS, "incidentId", "==", incident_id)]
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
    data = snapshot.to_dict() or {}

    conflict_body = None
    if data.get("conflictId"):
        conflict_snap = _get(store.CONFLICTS, data["conflictId"])
        if conflict_snap is not None:
            conflict_body = rules.to_record(conflict_snap, rules.CONFLICT_FIELDS)

    tasks = _tasks_for(incident_id)
    shown_ids = _incident_observation_ids(data, conflict_body)
    wanted_ids = list(shown_ids)
    if user["role"] != "supervisor":
        # Observations from any conflict on this incident also link a volunteer to it.
        for snap in store.where(store.CONFLICTS, "incidentId", "==", incident_id):
            wanted_ids += (snap.to_dict() or {}).get("observationIds") or []
        wanted_ids += data.get("observationIds") or []
    else:
        # The supervisor extras cover every report the incident knows, not only the two sides of a conflict.
        wanted_ids += (data.get("observationIds") or []) + ((conflict_body or {}).get("observationIds") or [])
    found = store.get_many(store.OBSERVATIONS, wanted_ids)  # one batched read

    if user["role"] != "supervisor":
        if not _volunteer_on_incident(user["id"], data, found, tasks):
            raise not_found("incident")
        tasks = [t for t in tasks if t["volunteerId"] == user["id"]]

    observations = [rules.to_record(found[obs_id], rules.OBSERVATION_FIELDS) for obs_id in shown_ids if obs_id in found]

    body = {
        "incident": rules.to_record(snapshot, rules.INCIDENT_FIELDS),
        "observations": observations,
        "conflict": conflict_body,
        "tasks": tasks,
    }
    if user["role"] == "supervisor":
        # Supervisor only: the reporter's name, when one was stored, and the factors behind evidenceScore.
        for record in observations:
            name = rules.reporter_name(found[record["id"]].to_dict() or {})
            if name:
                record["volunteerName"] = name
        body["evidenceFactors"] = rules.evidence_factors(data)
        # Supervisor only: the phone numbers stored for the volunteers on an active withdraw.
        withdraw = data.get("withdraw") or {}
        if withdraw.get("active") and withdraw.get("volunteerIds"):
            phones = {}
            for uid, snap in store.get_many(store.VOLUNTEERS, withdraw["volunteerIds"]).items():
                phone = rules.phone_of(snap.to_dict() or {})
                if phone:
                    phones[uid] = phone
            body["volunteerPhones"] = phones
        # Supervisor only: volunteer cards, a timeline and the advisory summary, from stored records.
        known = [found[i].to_dict() | {"id": i} for i in dict.fromkeys(wanted_ids) if i in found]
        body.update(incident_detail.build(incident_id, data, known, conflict_body, tasks))
    return jsonify(body), 200


@incidents_bp.route("/digest", methods=["GET"])
def digest():
    user = g.user
    incidents = [rules.to_record(s, rules.SUMMARY_FIELDS) for s in _scoped_incidents()]
    my_tasks = []
    if user["role"] == "volunteer":
        my_tasks = sorted(
            (rules.with_receipt(rules.to_record(s, rules.TASK_FIELDS)) for s in store.where(store.TASKS, "volunteerId", "==", user["id"])),
            key=lambda t: t["id"],
        )
    return jsonify({"updatedAt": rules.now_iso(), "incidents": incidents, "myTasks": my_tasks}), 200


# Supervisor decisions ------------------------------------------------------

def _commit_with_audit(transaction, target_ref, changes, action, target_id, subject_id=None):
    audit_ref = store.db().collection(store.AUDIT).document()
    if changes:
        transaction.update(target_ref, changes)
    transaction.set(
        audit_ref,
        rules.audit_record(audit_ref.id, g.user["id"], action, target_id, subject_id, g.user.get("displayName")),
    )
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
        return rules.with_receipt(rules.pick(task, rules.TASK_FIELDS)), audit_id

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
        # The approval is the send: the volunteer's phone gets it now (§6.6).
        return {"status": "approved", "sentAt": rules.now_iso(), "sendCount": 1}

    task, audit_id = _decide_task(task_id, "task.approve", apply)
    _push_after_commit(task)
    return _task_response(task, audit_id)


@incidents_bp.route("/tasks/<task_id>/reject", methods=["POST"])
def reject_task(task_id):
    def apply(task, held):
        _check_proposed(task, "rejected")
        return {"status": "rejected"}

    return _task_response(*_decide_task(task_id, "task.reject", apply))


@incidents_bp.route("/tasks/<task_id>/heard", methods=["POST"])
def task_heard(task_id):
    """The volunteer's app says this instruction was shown or spoken to them. Recorded once."""
    user = g.user
    if user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only the volunteer who got the instruction can confirm it")
    snapshot = _get(store.TASKS, task_id)
    if snapshot is None or (snapshot.to_dict() or {}).get("volunteerId") != user["id"]:
        raise not_found("task")

    def run(transaction):
        ref = _ref(store.TASKS, task_id)
        current = ref.get(transaction=transaction)
        if not current.exists:
            raise not_found("task")
        task = current.to_dict() or {}
        if task.get("status") != "approved":
            raise conflict("Only a sent instruction can be heard")
        if task.get("heardAt"):
            # Already recorded. A repeat changes nothing and writes no second audit entry.
            task["id"] = task_id
            return rules.with_receipt(rules.pick(task, rules.TASK_FIELDS)), None
        changes = {"heardAt": rules.now_iso()}
        audit_id = _commit_with_audit(transaction, ref, changes, "task.heard", task_id)
        task.update(changes)
        task["id"] = task_id
        return rules.with_receipt(rules.pick(task, rules.TASK_FIELDS)), audit_id

    task, audit_id = store.run_transaction(run)
    return jsonify({"task": task, "auditId": audit_id}), 200


@incidents_bp.route("/tasks/<task_id>/resend", methods=["POST"])
def resend_task(task_id):
    """Send a sent, unheard instruction again. Records another attempt and an audit entry."""
    def apply(task, held):
        if task.get("status") != "approved":
            raise conflict("Only a sent instruction can be sent again")
        if task.get("heardAt"):
            raise conflict("This instruction was already heard")
        return {"sentAt": rules.now_iso(), "sendCount": int(task.get("sendCount") or 1) + 1}

    task, audit_id = _decide_task(task_id, "task.resend", apply)
    _push_after_commit(task)
    return _task_response(task, audit_id)


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

    response, status = _task_response(*_decide_task(task_id, "task.edit", apply))
    # The editor's own name, so the screen can say who saved it. Absent when the token has no name.
    name = (g.user.get("displayName") or "").strip()
    if name:
        body = response.get_json()
        body["editedBy"] = name
        response = jsonify(body)
    return response, status


def _decide_incident(incident_id, action, apply, subject_id=None):
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
        audit_id = _commit_with_audit(transaction, ref, changes, action, incident_id, subject_id)
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


@incidents_bp.route("/incidents/<incident_id>/withdraw/safe", methods=["POST"])
def mark_safe(incident_id):
    """Record that a supervisor found a withdrawn volunteer safe. It never clears the withdraw."""
    _require_supervisor()
    volunteer_id = _body().get("volunteerId")
    if not isinstance(volunteer_id, str) or not volunteer_id.strip():
        raise validation("volunteerId", "required, a volunteer id")

    def apply(incident):
        current = incident.get("withdraw") or {}
        if not current.get("active"):
            raise conflict("This incident has no active withdraw")
        if volunteer_id not in (current.get("volunteerIds") or []):
            raise validation("volunteerId", "not part of this withdraw")
        safe = list(current.get("safeVolunteerIds") or [])
        if volunteer_id in safe:
            raise conflict("This volunteer is already marked safe")
        return {"withdraw": dict(current, safeVolunteerIds=safe + [volunteer_id])}

    return _decide_incident(incident_id, "withdraw.safe", apply, subject_id=volunteer_id)


def _volunteers_on(incident_id, data):
    """Volunteers who already have an observation or a task on this incident."""
    volunteers = {(s.to_dict() or {}).get("volunteerId") for s in store.where(store.TASKS, "incidentId", "==", incident_id)}
    obs_ids = set(data.get("observationIds") or [])
    if data.get("conflictId"):
        con = _get(store.CONFLICTS, data["conflictId"])
        if con is not None:
            obs_ids.update((con.to_dict() or {}).get("observationIds") or [])
    for obs in store.get_many(store.OBSERVATIONS, obs_ids).values():
        volunteers.add((obs.to_dict() or {}).get("volunteerId"))
    volunteers.discard(None)
    return volunteers


def _known_volunteer(incident_id, data, volunteer_id):
    """True when the volunteer has a report, a task or a withdraw entry on this incident."""
    if volunteer_id in _volunteers_on(incident_id, data):
        return True
    return volunteer_id in ((data.get("withdraw") or {}).get("volunteerIds") or [])


@incidents_bp.route("/incidents/<incident_id>/volunteers/<volunteer_id>/instruct", methods=["POST"])
def instruct_volunteer(incident_id, volunteer_id):
    """Send one free-text instruction to one volunteer. It is sent now: the supervisor's decision is the approval.

    It creates an `instruct` task already `approved`, pushes it, and appends a `task.instruct` audit row. It is
    never WITHDRAW and cannot hold or replace one: while the volunteer is on an active withdraw and not marked
    safe, it is refused.
    """
    _require_supervisor()
    instruction = _body().get("instruction")
    if not isinstance(instruction, str) or not instruction.strip():
        raise validation("instruction", "required, a non-empty string")
    if len(instruction) > rules.INSTRUCTION_MAX:
        raise validation("instruction", f"at most {rules.INSTRUCTION_MAX} characters")
    pre = _get(store.INCIDENTS, incident_id)
    if pre is None:
        raise not_found("incident")
    data = pre.to_dict() or {}
    if not _known_volunteer(incident_id, data, volunteer_id):
        raise validation("volunteerId", "needs a report, a task or a withdraw entry on this incident")

    def run(transaction):
        ref = _ref(store.INCIDENTS, incident_id)
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise not_found("incident")
        incident = snapshot.to_dict() or {}
        if incident.get("status") == "extinguished":
            raise conflict("An extinguished incident takes no new instruction")
        current = incident.get("withdraw") or {}
        if current.get("active") and volunteer_id in (current.get("volunteerIds") or []) \
                and volunteer_id not in (current.get("safeVolunteerIds") or []):
            raise conflict("This volunteer is on an active withdraw and is not marked safe")
        task_ref = store.db().collection(store.TASKS).document()
        task = {
            "incidentId": incident_id,
            "volunteerId": volunteer_id,
            "type": "instruct",
            "status": "approved",
            "instruction": instruction.strip(),
            "sentAt": rules.now_iso(),
            "sendCount": 1,
        }
        transaction.set(task_ref, task)
        audit_id = _commit_with_audit(transaction, task_ref, None, "task.instruct", task_ref.id)
        return rules.with_receipt(rules.pick(dict(task, id=task_ref.id), rules.TASK_FIELDS)), audit_id

    task, audit_id = store.run_transaction(run)
    _push_after_commit(task)
    return jsonify({"task": task, "auditId": audit_id}), 201


@incidents_bp.route("/incidents/<incident_id>/photos/<observation_id>", methods=["GET"])
def incident_photo(incident_id, observation_id):
    """A short-lived signed read URL for one photo report on this incident. Supervisor only; the object stays private."""
    _require_supervisor()
    snapshot = _get(store.INCIDENTS, incident_id)
    if snapshot is None:
        raise not_found("incident")
    data = snapshot.to_dict() or {}
    known = set(data.get("observationIds") or [])
    if data.get("conflictId"):
        con = _get(store.CONFLICTS, data["conflictId"])
        if con is not None:
            known.update((con.to_dict() or {}).get("observationIds") or [])
    obs = _get(store.OBSERVATIONS, observation_id) if observation_id in known else None
    obs_data = (obs.to_dict() or {}) if obs is not None else {}
    path = obs_data.get("photoPath")
    # Only a well-formed path under the reporter's own prefix is ever signed.
    if not photo_paths.is_owned_photo_path(path, obs_data.get("volunteerId")):
        raise not_found("photo")
    ttl = signing.read_ttl_seconds()
    try:
        url = signing.sign_get_url(signing.photo_bucket(), path, ttl)
    except Exception:
        logger.exception("could not sign a read URL for observation %s", observation_id)
        raise ApiError(503, "unavailable", "The photo cannot be read right now")
    expires = (datetime.now(timezone.utc) + timedelta(seconds=ttl)).replace(microsecond=0)
    response = jsonify({"url": url, "expiresAt": expires.isoformat().replace("+00:00", "Z")})
    response.headers["Cache-Control"] = "no-store"
    return response, 200


@incidents_bp.route("/incidents/<incident_id>/withdraw", methods=["POST"])
def withdraw(incident_id):
    """Issue a withdraw instruction now. This is not an approval and never waits."""
    _require_supervisor()
    volunteer_ids, instruction, reasons = _withdraw_body()
    pre = _get(store.INCIDENTS, incident_id)
    if pre is None:
        raise not_found("incident")
    on_incident = _volunteers_on(incident_id, pre.to_dict() or {})
    unknown = [v for v in volunteer_ids if v not in on_incident]
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
        active = bool(current.get("active"))
        changes = {"withdraw": {
            "active": True,
            "instruction": instruction,
            "reasons": reasons,
            "volunteerIds": targets,
            # The event keeps the source and time it was first sent with. Volunteers marked safe stay marked.
            "source": (current.get("source") or "supervisor") if active else "supervisor",
            "sentAt": (current.get("sentAt") or rules.now_iso()) if active else rules.now_iso(),
            "safeVolunteerIds": list(current.get("safeVolunteerIds") or []) if active else [],
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
                "sentAt": rules.now_iso(),
                "sendCount": 1,
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
