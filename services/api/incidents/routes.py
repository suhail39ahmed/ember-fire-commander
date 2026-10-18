"""Incident reads, the digest, and supervisor decisions (contract 6.3 to 6.5).

Reads are open to both roles and scoped by role. Every write route is
supervisor-only and commits the change and its audit record together.
A task or WITHDRAW push runs only after that commit, and a failed push
does not undo it.
"""
import logging
from uuid import uuid4
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import detail as incident_detail, live_seat, members, nearby, rules, sent, store, volunteer_view, withdrawal
from incidents.errors import ApiError, conflict, error_response, not_found, validation
from notifications.send import deliver_task
from photos import paths as photo_paths, signing
from videos import paths as video_paths

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


_CLOSED_FIELDS = ("closedAt", "closedBy", "closedByName", "closeMessage")


def _task_for_client(snapshot):
    """Task record for clients: omit null lead-closed fields (#140)."""
    record = rules.with_receipt(rules.to_record(snapshot, rules.TASK_FIELDS))
    created_at = volunteer_view.task_created(snapshot)
    if created_at:
        record["createdAt"] = created_at
    if (snapshot.to_dict() or {}).get("reasonCode") == "reports_disagree":
        record["reasonCode"] = "reports_disagree"
    for key in _CLOSED_FIELDS:
        if record.get(key) is None:
            record.pop(key, None)
    return record


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
    # Joined through POST /incidents/{id}/join (#134), with or without a report or task.
    linked.update(store.get_many(store.INCIDENTS, [i for i in members.member_incident_ids(uid) if i not in linked]))
    return linked


def _scoped_incidents():
    user = g.user
    if user["role"] == "supervisor":
        snaps = store.where(store.INCIDENTS, "status", "in", list(rules.LIVE_STATUSES))
    else:
        snaps = list(_volunteer_incident_snapshots(user["id"]).values())
    return sorted(snaps, key=lambda s: s.id)


def _volunteer_on_incident(uid, data, observations, tasks, incident_id=None):
    """True when the caller has a task, a withdraw instruction, a join, or an observation on this incident."""
    if any(t["volunteerId"] == uid for t in tasks):
        return True
    if uid in ((data.get("withdraw") or {}).get("volunteerIds") or []):
        return True
    if incident_id and members.is_member(uid, incident_id):
        return True
    return any((obs.to_dict() or {}).get("volunteerId") == uid for obs in observations.values())


def _tasks_for(incident_id):
    tasks = [_task_for_client(s) for s in store.where(store.TASKS, "incidentId", "==", incident_id)]
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
    snapshots = _scoped_incidents()
    records = [rules.to_record(s, rules.INCIDENT_FIELDS) for s in snapshots]
    if g.user["role"] == "supervisor":
        # Supervisor only: counts and flags read from the stored reports, so the list needs no read per incident.
        extras = incident_detail.list_extras(snapshots)
        for record in records:
            record.update(extras[record["id"]])
    withdrawal.present(records, g.user)
    return jsonify(records), 200


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
    all_tasks = tasks
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
        if not _volunteer_on_incident(user["id"], data, found, tasks, incident_id):
            raise not_found("incident")
        tasks = [t for t in tasks if t["volunteerId"] == user["id"]]
        # The volunteer detail lists every report linked to this incident, including conflict sides.
        shown_ids = list(dict.fromkeys(shown_ids + list(data.get("observationIds") or [])))

    observations = [rules.to_record(found[obs_id], rules.OBSERVATION_FIELDS) for obs_id in shown_ids if obs_id in found]

    body = {
        "incident": rules.to_record(snapshot, rules.INCIDENT_FIELDS),
        "observations": observations,
        "conflict": conflict_body,
        "tasks": tasks,
    }
    withdrawal.present([body["incident"]], user)
    if user["role"] != "supervisor":
        metadata, contexts, task_metadata, _ = volunteer_view.load([snapshot], user["id"], known_reports=found, known_tasks=all_tasks)
        body["incident"].update(metadata[incident_id])
        body["conflictSummary"] = contexts[incident_id]
        for task in tasks:
            task.update(task_metadata.get(task["id"], {}))
        for record in observations:
            name = rules.reporter_name(found[record["id"]].to_dict() or {})
            if name:
                record["volunteerName"] = name
        # Optional join fields for the joined-incident screen (#135). Absent when they only have a report or task.
        membership = members.read_member(incident_id, user["id"])
        if membership is not None:
            body["membership"] = membership
    if user["role"] == "supervisor":
        # Stored report names, plus the supervisor-only factors behind evidenceScore.
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
            # Supervisor only: volunteer self-safe answers from the PWA (POST /incidents/{id}/withdraw/answer).
            named = set(withdraw["volunteerIds"])
            self_safe = []
            for snap in store.where("withdraw_answers", "incidentId", "==", incident_id):
                row = snap.to_dict() or {}
                uid = row.get("volunteerId")
                if row.get("state") == "safe" and uid in named and withdrawal.belongs(row, withdraw):
                    self_safe.append(uid)
            if self_safe and body.get("incident", {}).get("withdraw"):
                body["incident"]["withdraw"]["selfSafeVolunteerIds"] = self_safe
        # Supervisor only: volunteer cards, a timeline and the advisory summary, from stored records.
        known = [found[i].to_dict() | {"id": i} for i in dict.fromkeys(wanted_ids) if i in found]
        body.update(incident_detail.build(incident_id, data, known, conflict_body, tasks))
        body["liveSeat"] = live_seat.seat_for_response(incident_id, observations)
    return jsonify(body), 200


@incidents_bp.route("/tasks", methods=["GET"])
def list_tasks():
    """Supervisor only: the tasks waiting for a decision, each with its incident and the volunteer's name.

    `status=proposed` is the only filter. Tasks are sorted by incident id, then task id.
    """
    _require_supervisor()
    if request.args.get("status") != "proposed":
        raise validation("status", "use proposed")
    tasks = sorted(
        (rules.with_receipt(rules.to_record(s, rules.TASK_FIELDS)) for s in store.where(store.TASKS, "status", "==", "proposed")),
        key=lambda t: (t["incidentId"] or "", t["id"]),
    )
    incident_snaps = store.get_many(store.INCIDENTS, [t["incidentId"] for t in tasks if t["incidentId"]])
    incident_data = {i: snap.to_dict() or {} for i, snap in incident_snaps.items()}
    names = incident_detail.volunteer_names(incident_data, [t["volunteerId"] for t in tasks if t["volunteerId"]])
    items = []
    for task in tasks:
        data = incident_data.get(task["incidentId"])
        items.append({
            "task": task,
            "incident": None if data is None else {
                "id": task["incidentId"], "name": data.get("name"), "area": data.get("area"),
                "label": rules.incident_label(data), "status": data.get("status"), "severity": data.get("severity"),
                "conflictId": data.get("conflictId"),
            },
            "volunteerName": names.get(task["volunteerId"]),
        })
    return jsonify(items), 200


@incidents_bp.route("/digest", methods=["GET"])
def digest():
    user = g.user
    scoped = _scoped_incidents()
    incidents = [rules.to_record(s, rules.SUMMARY_FIELDS) for s in scoped]
    my_tasks = []
    season_stats = None
    if user["role"] == "volunteer":
        my_tasks = sorted(
            (_task_for_client(s) for s in store.where(store.TASKS, "volunteerId", "==", user["id"])),
            key=lambda t: t["id"],
        )
        metadata, _, task_metadata, _ = volunteer_view.load(scoped, user["id"])
        for incident in incidents:
            incident.update(metadata[incident["id"]])
        for task in my_tasks:
            task.update(task_metadata.get(task["id"], {}))
        # Nearby fires the volunteer has not joined (#134). Needs the phone's lat/lng; otherwise [].
        position = nearby.parse_position(request.args)
        if position is not None:
            nearby_rows = nearby.nearby_incidents(position, {s.id for s in scoped})
        else:
            nearby_rows = []
        # All-time credit for this volunteer's task-linked satellite checks (#140).
        checked_leads = [snap.to_dict() or {} for snap in store.where("leadChecks", "volunteerId", "==", user["id"])]
        checked_lead_ids = {check.get("leadId") for check in checked_leads if check.get("leadId")}
        false_alarm_lead_ids = {
            check.get("leadId") for check in checked_leads
            if check.get("leadId") and check.get("outcome") == "checked_no_fire"
        }
        season_stats = {
            "checksDone": len(checked_lead_ids),
            "falseAlarmsCleared": len(false_alarm_lead_ids),
        }
    withdrawal.present(incidents, user)
    body = {"updatedAt": rules.now_iso(), "incidents": incidents, "myTasks": my_tasks}
    if user["role"] == "volunteer":
        body["nearby"] = nearby_rows
        body["myJoinRequests"] = nearby.join_request_summaries(
            store.where(store.JOIN_REQUESTS, "volunteerId", "==", user["id"])
        )
    if user["role"] == "volunteer":
        body["seasonStats"] = season_stats
    if user["role"] == "volunteer" and "sentSince" in request.args:
        # The reports this volunteer sent since their own start of day (#131). Left out when it cannot be read.
        try:
            body["sentToday"] = sent.sent_today(user["id"], request.args.get("sentSince"))
        except Exception:
            logger.warning("sent today could not be read", exc_info=True)
    return jsonify(body), 200

@incidents_bp.route("/incidents/<incident_id>/join", methods=["POST"])
def join_incident(incident_id):
    """Join now (#134): add this volunteer to the incident with no approval step."""
    if g.user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only a volunteer can do this")
    snapshot = _get(store.INCIDENTS, incident_id)
    if snapshot is None:
        raise not_found("incident")
    data = snapshot.to_dict() or {}
    if data.get("status") not in rules.LIVE_STATUSES:
        raise conflict("Only a live incident can be joined")

    uid = g.user["id"]
    existing = members.read_member(incident_id, uid)
    if existing is not None:
        return jsonify({"membership": existing, "auditId": None}), 200

    record = members.join_record(incident_id, uid, g.user.get("displayName"))

    def run(transaction):
        ref = members.member_ref(incident_id, uid)
        if ref.get(transaction=transaction).exists:
            return None
        transaction.set(ref, record)
        audit_ref = store.db().collection(store.AUDIT).document()
        transaction.set(
            audit_ref,
            rules.audit_record(audit_ref.id, uid, "incident.join", incident_id, uid, g.user.get("displayName")),
        )
        return audit_ref.id

    audit_id = store.run_transaction(run)
    membership = members.read_member(incident_id, uid) or _public_join(record)
    return jsonify({"membership": membership, "auditId": audit_id}), 200


def _public_join(record):
    return members._public_member(record)


@incidents_bp.route("/incidents/<incident_id>/en-route", methods=["POST"])
def en_route(incident_id):
    """I'm on my way (#135): mark this joined volunteer as en route. Persists across reload."""
    if g.user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only a volunteer can do this")
    snapshot = _get(store.INCIDENTS, incident_id)
    if snapshot is None:
        raise not_found("incident")
    uid = g.user["id"]
    if not members.is_member(uid, incident_id) and not _volunteer_linked_without_member(uid, incident_id, snapshot.to_dict() or {}):
        # Must be on the incident. Prefer a join membership; a task or report also allows en-route.
        raise not_found("incident")

    def run(transaction):
        ref = members.member_ref(incident_id, uid)
        snap = ref.get(transaction=transaction)
        if snap.exists:
            data = snap.to_dict() or {}
            if data.get("enRouteAt"):
                return members._public_member(data | {"id": snap.id}), None
            at = rules.now_iso()
            transaction.update(ref, {"enRouteAt": at})
            audit_ref = store.db().collection(store.AUDIT).document()
            transaction.set(
                audit_ref,
                rules.audit_record(audit_ref.id, uid, "incident.en_route", incident_id, uid, g.user.get("displayName")),
            )
            return members._public_member(data | {"enRouteAt": at}), audit_ref.id
        # Linked by task/report but no join row yet: create one with enRouteAt set.
        record = members.join_record(incident_id, uid, g.user.get("displayName"))
        record["enRouteAt"] = rules.now_iso()
        transaction.set(ref, record)
        audit_ref = store.db().collection(store.AUDIT).document()
        transaction.set(
            audit_ref,
            rules.audit_record(audit_ref.id, uid, "incident.en_route", incident_id, uid, g.user.get("displayName")),
        )
        return members._public_member(record), audit_ref.id

    membership, audit_id = store.run_transaction(run)
    return jsonify({"membership": membership, "auditId": audit_id}), 200


def _volunteer_linked_without_member(uid, incident_id, data):
    """True when the volunteer is on the incident via a task, report or withdraw (not only a join)."""
    if uid in ((data.get("withdraw") or {}).get("volunteerIds") or []):
        return True
    if any((s.to_dict() or {}).get("volunteerId") == uid for s in store.where(store.TASKS, "incidentId", "==", incident_id)):
        return True
    mine = _my_observation_ids(uid)
    if mine & set(data.get("observationIds") or []):
        return True
    for snap in store.where(store.CONFLICTS, "incidentId", "==", incident_id):
        if mine & set((snap.to_dict() or {}).get("observationIds") or []):
            return True
    return False



# Supervisor decisions ------------------------------------------------------

def _commit_with_audit(transaction, target_ref, changes, action, target_id, subject_id=None):
    audit_ref = store.db().collection(store.AUDIT).document()
    if changes:
        transaction.update(target_ref, changes)
    record = rules.audit_record(audit_ref.id, g.user["id"], action, target_id, subject_id, g.user.get("displayName"))
    withdraw = (changes or {}).get("withdraw") or {}
    if withdrawal.key(withdraw):
        record["sessionId"] = withdrawal.key(withdraw)
    if action == "withdraw.clear":
        record["reason"] = withdraw.get("clearReason")
    transaction.set(audit_ref, record)
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
        if action == "task.approve":
            incident_snap = _ref(store.INCIDENTS, task.get("incidentId") or "").get(transaction=transaction)
            if ((incident_snap.to_dict() or {}).get("withdraw") or {}).get("active"):
                raise conflict("Instructions stay paused until the withdraw is cleared")
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
        if task.get("status") != "approved" or task.get("closedAt"):
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


@incidents_bp.route("/incidents/<incident_id>/live/make-live", methods=["POST"])
def make_live(incident_id):
    """Hold the live seat for a volunteer with 3G or better. Does not reopen the incident."""
    _require_supervisor()
    body = _body()
    volunteer_id = body.get("volunteerId")
    seat, audit_id = live_seat.make_live(incident_id, volunteer_id)
    return jsonify({
        "liveSeat": live_seat.client_seat(seat),
        "auditId": audit_id,
    }), 200


@incidents_bp.route("/incidents/<incident_id>/live/retry", methods=["POST"])
def retry_live(incident_id):
    """Retry live for a dropped volunteer when their signal is 3G or better."""
    _require_supervisor()
    body = _body()
    volunteer_id = body.get("volunteerId")
    seat, audit_id = live_seat.retry_live(incident_id, volunteer_id)
    return jsonify({
        "liveSeat": live_seat.client_seat(seat),
        "auditId": audit_id,
    }), 200


@incidents_bp.route("/incidents/<incident_id>/verify", methods=["POST"])
def verify_incident(incident_id):
    """Mark the incident verified and close open verify tasks so volunteers see the thank-you (#140)."""
    _require_supervisor()
    if _get(store.INCIDENTS, incident_id) is None:
        raise not_found("incident")
    actor = g.user

    def run(transaction):
        ref = _ref(store.INCIDENTS, incident_id)
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise not_found("incident")
        incident = snapshot.to_dict() or {}
        if incident.get("status") not in ("open", "held"):
            raise conflict(f"An incident that is {incident.get('status')} cannot be verified")
        task_snaps = store.where(store.TASKS, "incidentId", "==", incident_id)
        verify_tasks = {
            snap.id: (snap.to_dict() or {})
            for snap in task_snaps
            if (snap.to_dict() or {}).get("type") == "verify"
        }
        observations = store.get_many(store.OBSERVATIONS, incident.get("observationIds") or [])
        task_observations = {}
        for observation in (snap.to_dict() or {} for snap in observations.values()):
            task_id = observation.get("checkTaskId")
            if task_id not in verify_tasks or observation.get("volunteerId") != verify_tasks[task_id].get("volunteerId"):
                continue
            previous = task_observations.get(task_id)
            is_no_fire = observation.get("source") == "photo" and (observation.get("text") or "").startswith("Bukan kebakaran:")
            was_no_fire = previous and previous.get("source") == "photo" and (previous.get("text") or "").startswith("Bukan kebakaran:")
            if previous is None or (is_no_fire and not was_no_fire) or (is_no_fire == was_no_fire and observation.get("capturedAt", "") > previous.get("capturedAt", "")):
                task_observations[task_id] = observation
        lead_id = incident.get("satelliteLeadId") if task_observations else None
        lead_ref = _ref("leads", lead_id) if isinstance(lead_id, str) and lead_id else None
        lead_snapshot = lead_ref.get(transaction=transaction) if lead_ref else None
        lead = (lead_snapshot.to_dict() or {}) if lead_snapshot and lead_snapshot.exists else None
        check_refs = {}
        existing_checks = {}
        if lead_ref and lead:
            check_refs = {
                task_id: _ref("leadChecks", f"{lead_id}__{task_id}")
                for task_id in task_observations
            }
            existing_checks = {
                task_id: ref.get(transaction=transaction)
                for task_id, ref in check_refs.items()
            }
        changes = {"status": "verified"}
        audit_id = _commit_with_audit(transaction, ref, changes, "incident.verify", incident_id)
        closed_at = rules.now_iso()
        close_fields = {
            "closedAt": closed_at,
            "closedBy": actor["id"],
            "closedByName": (actor.get("displayName") or "").strip() or None,
            "closeMessage": "False alarm cleared. Nobody else has to walk out there.",
        }
        for snap in task_snaps:
            task = snap.to_dict() or {}
            if task.get("type") != "verify" or task.get("closedAt"):
                continue
            transaction.update(_ref(store.TASKS, snap.id), close_fields)
        if lead_ref and lead:
            for task_id, observation in task_observations.items():
                if existing_checks[task_id].exists:
                    continue
                no_fire = observation.get("source") == "photo" and (observation.get("text") or "").startswith("Bukan kebakaran:")
                transaction.set(check_refs[task_id], {
                    "id": f"{lead_id}__{task_id}",
                    "leadId": lead_id,
                    "taskId": task_id,
                    "incidentId": incident_id,
                    "observationId": observation["id"],
                    "volunteerId": verify_tasks[task_id]["volunteerId"],
                    "outcome": "checked_no_fire" if no_fire else "verified_fire",
                    "checkedAt": closed_at,
                })
                if no_fire and not lead.get("verifiedBy"):
                    transaction.update(lead_ref, {
                        "status": "checked_no_fire",
                        "verifiedBy": verify_tasks[task_id]["volunteerId"],
                        "verifiedAt": closed_at,
                        "incidentId": incident_id,
                    })
        incident.update(changes)
        incident["id"] = incident_id
        return rules.pick(incident, rules.INCIDENT_FIELDS), audit_id

    incident, audit_id = store.run_transaction(run)
    return jsonify({"incident": incident, "auditId": audit_id}), 200


@incidents_bp.route("/incidents/<incident_id>/extinguish", methods=["POST"])
def extinguish_incident(incident_id):
    def apply(incident):
        if incident.get("status") == "extinguished":
            raise conflict("The incident is already extinguished")
        if (incident.get("withdraw") or {}).get("active"):
            raise conflict("Clear the withdraw before closing this incident")
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
    mark_body = _body()
    volunteer_id = mark_body.get("volunteerId")
    if not isinstance(volunteer_id, str) or not volunteer_id.strip():
        raise validation("volunteerId", "required, a volunteer id")

    def apply(incident):
        current = incident.get("withdraw") or {}
        if not current.get("active"):
            raise conflict("This incident has no active withdraw")
        if current.get("id") and mark_body.get("sessionId") != current["id"]:
            raise conflict("This withdrawal has changed")
        if volunteer_id not in (current.get("volunteerIds") or []):
            raise validation("volunteerId", "not part of this withdraw")
        safe = list(current.get("safeVolunteerIds") or [])
        if volunteer_id in safe:
            raise conflict("This volunteer is already marked safe")
        return {"withdraw": dict(current, safeVolunteerIds=safe + [volunteer_id])}

    return _decide_incident(incident_id, "withdraw.safe", apply, subject_id=volunteer_id)


@incidents_bp.route("/incidents/<incident_id>/withdraw/clear", methods=["POST"])
def clear_withdraw(incident_id):
    _require_supervisor()
    body = _body()
    reason = body.get("reason")
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 500:
        raise validation("reason", "required, at most 500 characters")

    def run(transaction):
        ref = _ref(store.INCIDENTS, incident_id)
        snapshot = ref.get(transaction=transaction)
        if not snapshot.exists:
            raise not_found("incident")
        incident = snapshot.to_dict() or {}
        current = incident.get("withdraw") or {}
        if not current.get("active"):
            raise conflict("There is no active withdraw")
        if body.get("sessionId") != withdrawal.key(current):
            raise conflict("This withdrawal has changed; refresh before clearing")
        safe = withdrawal.safe_ids(current)
        # Legacy sessions stored answers separately. Read those inside the same
        # transaction, so a changing answer cannot race the all-safe check.
        for uid in current.get("volunteerIds") or []:
            answer = _ref("withdraw_answers", f"{incident_id}__{uid}").get(transaction=transaction)
            row = answer.to_dict() or {}
            if row.get("state") == "safe" and withdrawal.belongs(row, current):
                safe.add(uid)
        if not current.get("volunteerIds") or not set(current["volunteerIds"]).issubset(safe):
            raise conflict("Every volunteer must be safe before clearing")
        task_refs = [_ref(store.TASKS, snap.id) for snap in store.where(store.TASKS, "incidentId", "==", incident_id)
                     if (snap.to_dict() or {}).get("type") == "withdraw"]
        closed = dict(current, active=False, clearedAt=rules.now_iso(), clearedBy=g.user["id"],
                      clearedByName=g.user.get("displayName"), clearReason=reason.strip())
        audit_id = _commit_with_audit(transaction, ref, {"withdraw": closed}, "withdraw.clear", incident_id)
        for task_ref in task_refs:
            transaction.update(task_ref, {"status": "rejected", "closedAt": closed["clearedAt"]})
        incident.update(withdraw=closed, id=incident_id)
        return rules.pick(incident, rules.INCIDENT_FIELDS), audit_id

    incident, audit_id = store.run_transaction(run)
    return jsonify({"incident": incident, "auditId": audit_id}), 200


@incidents_bp.route("/incidents/<incident_id>/withdraw/help", methods=["POST"])
def request_withdraw_help(incident_id):
    _require_supervisor()
    body = _body()
    target, helper = body.get("volunteerId"), body.get("helperId")

    def run(transaction):
        ref = _ref(store.INCIDENTS, incident_id)
        snap = ref.get(transaction=transaction)
        if not snap.exists:
            raise not_found("incident")
        current = (snap.to_dict() or {}).get("withdraw") or {}
        named = current.get("volunteerIds") or []
        if not current.get("active") or body.get("sessionId") != withdrawal.key(current):
            raise conflict("This withdrawal is no longer active")
        if target not in named or helper not in named or target == helper:
            raise validation("helperId", "choose another volunteer on this withdrawal")
        if helper not in withdrawal.safe_ids(current):
            raise conflict("Choose a volunteer already confirmed safe")
        assignments = dict(current.get("helpers") or {})
        if assignments.get(target) == helper:
            raise conflict("This volunteer has already been asked to help")
        assignments[target] = helper
        task_ref = store.db().collection(store.TASKS).document()
        task = {"incidentId": incident_id, "volunteerId": helper, "type": "instruct", "status": "approved",
                "instruction": body.get("instruction") if isinstance(body.get("instruction"), str) else "Contact your supervisor to help a withdrawn volunteer. Stay upwind; do not re-enter danger.",
                "sentAt": rules.now_iso(), "sendCount": 1}
        task["instruction"] = task["instruction"][:500]
        transaction.set(task_ref, task)
        audit_id = _commit_with_audit(transaction, ref, {"withdraw": dict(current, helpers=assignments)}, "withdraw.help", incident_id, target)
        return dict(task, id=task_ref.id), audit_id

    task, audit_id = store.run_transaction(run)
    return jsonify({"task": task, "auditId": audit_id}), 200


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
    volunteers.update((s.to_dict() or {}).get("volunteerId") for s in store.where("incident_members", "incidentId", "==", incident_id))
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


@incidents_bp.route("/incidents/<incident_id>/videos/<observation_id>", methods=["GET"])
def incident_video(incident_id, observation_id):
    """A short-lived signed read URL for one video report on this incident. Supervisor only; the object stays private."""
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
    path = obs_data.get("videoPath")
    if not video_paths.is_owned_video_path(path, obs_data.get("volunteerId")):
        raise not_found("video")
    ttl = signing.read_ttl_seconds()
    try:
        url = signing.sign_get_url(signing.photo_bucket(), path, ttl)
    except Exception:
        logger.exception("could not sign a read URL for video observation %s", observation_id)
        raise ApiError(503, "unavailable", "The video cannot be read right now")
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
        if current.get("active"):
            raise conflict("This incident already has an active withdraw")
        if incident.get("status") == "extinguished":
            raise conflict("An extinguished incident cannot receive a withdraw")
        # Each send creates one distinct session; transaction retries cannot duplicate it.
        targets = list(dict.fromkeys(list(current.get("volunteerIds") or []) + volunteer_ids)) if current.get("active") else volunteer_ids
        active = bool(current.get("active"))
        changes = {"withdraw": {
            "active": True,
            "id": uuid4().hex,
            "createdBy": g.user["id"],
            "createdByName": g.user.get("displayName"),
            "answers": {},
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
