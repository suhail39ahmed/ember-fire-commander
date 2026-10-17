"""GET /audit — append-only log for the supervisor console (issue #99).

Clients never write. This route builds actor name, target label, and detail
from related documents so the browser does not invent those sentences.
"""
import base64
from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import rules, store

audit_bp = Blueprint("audit", __name__)

DEFAULT_LIMIT = 50
MAX_LIMIT = 100
CODE_ACTOR_NAME = "AI"
EMPTY_DETAIL = "—"
# Actions a volunteer's device writes. Every other action is a supervisor's.
VOLUNTEER_ACTIONS = ("observation.create", "task.heard")
MAX_NAME_OBSERVATIONS = 300


def _require_supervisor():
    if g.user["role"] != "supervisor":
        raise AuthError(403, "forbidden", "Only a supervisor can do this")


def _limit():
    raw = request.args.get("limit", str(DEFAULT_LIMIT))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_LIMIT
    return max(1, min(value, MAX_LIMIT))


def _decode_cursor(value):
    if not value:
        return None
    try:
        text = base64.urlsafe_b64decode(value.encode("ascii")).decode("utf-8")
        at, _, doc_id = text.partition("|")
        if not at or not doc_id:
            return None
        return at, doc_id
    except Exception:
        return None


def _encode_cursor(at, doc_id):
    return base64.urlsafe_b64encode(f"{at}|{doc_id}".encode("utf-8")).decode("ascii")


def _name_map(uids):
    """displayName from volunteers/{uid}, falling back to the uid."""
    names = {}
    if not uids:
        return names
    for doc_id, snap in store.get_many(store.VOLUNTEERS, list(uids)).items():
        data = snap.to_dict() or {}
        name = data.get("displayName")
        if isinstance(name, str) and name.strip():
            names[doc_id] = name.strip()
    return names


def _actor_name(row, names):
    """A readable actor, never a raw id.

    The name stored on the row when it was written, else the volunteer record, else the name on one of
    their reports, else the role: a volunteer for what only a device does, a supervisor for the rest.
    """
    actor_id = row.get("actorId")
    if actor_id == "code":
        return CODE_ACTOR_NAME
    stored = row.get("actorName")
    if isinstance(stored, str) and stored.strip():
        return stored.strip()
    named = names.get(actor_id)
    if named:
        return named
    if row.get("action") in VOLUNTEER_ACTIONS:
        return "Volunteer"
    return "Supervisor"


def _volunteer_label(volunteer_id, names):
    if not volunteer_id:
        return EMPTY_DETAIL
    return names.get(volunteer_id) or "Volunteer"


def _incident_label(incident):
    if not incident:
        return EMPTY_DETAIL
    return rules.incident_label(incident)


def _load_related(rows):
    """Batch-load tasks, incidents, and observations named by the page of rows."""
    task_ids, incident_ids, observation_ids, actor_ids = set(), set(), set(), set()
    for row in rows:
        actor_id = row.get("actorId")
        if isinstance(actor_id, str) and actor_id:
            actor_ids.add(actor_id)
        action = row.get("action") or ""
        target = row.get("targetId") or ""
        if action.startswith("task.") and action != "task.withdraw":
            task_ids.add(target)
        elif action == "observation.create":
            observation_ids.add(target)
        else:
            incident_ids.add(target)

    tasks = {i: (s.to_dict() or {}) | {"id": i} for i, s in store.get_many(store.TASKS, list(task_ids)).items()}
    for task in tasks.values():
        if task.get("incidentId"):
            incident_ids.add(task["incidentId"])
        if task.get("volunteerId"):
            actor_ids.add(task["volunteerId"])

    observations = {
        i: (s.to_dict() or {}) | {"id": i}
        for i, s in store.get_many(store.OBSERVATIONS, list(observation_ids)).items()
    }
    for obs in observations.values():
        if obs.get("volunteerId"):
            actor_ids.add(obs["volunteerId"])

    incidents = {
        i: (s.to_dict() or {}) | {"id": i}
        for i, s in store.get_many(store.INCIDENTS, list(incident_ids)).items()
    }
    obs_to_incident = {}
    for inc_id, incident in incidents.items():
        for obs_id in incident.get("observationIds") or []:
            if isinstance(obs_id, str):
                obs_to_incident[obs_id] = inc_id
        withdraw = incident.get("withdraw") or {}
        for vid in withdraw.get("volunteerIds") or []:
            if isinstance(vid, str):
                actor_ids.add(vid)

    # Observations whose incident was not already pulled (target is the observation id).
    missing_obs = [oid for oid in observation_ids if oid not in obs_to_incident]
    for obs_id in missing_obs:
        for snap in store.where(store.INCIDENTS, "observationIds", "array_contains", obs_id):
            data = snap.to_dict() or {}
            incidents[snap.id] = data | {"id": snap.id}
            obs_to_incident[obs_id] = snap.id
            break

    names = _name_map(actor_ids)
    # Volunteer records rarely hold a name. The name on their reports is the one the console already shows.
    unnamed = {a for a in actor_ids if a not in names}
    if unnamed:
        report_ids = set(observations)
        for incident in incidents.values():
            report_ids.update(i for i in incident.get("observationIds") or [] if isinstance(i, str))
        reports = store.get_many(store.OBSERVATIONS, sorted(report_ids)[:MAX_NAME_OBSERVATIONS])
        for snap in reports.values():
            data = snap.to_dict() or {}
            name = rules.reporter_name(data)
            if name and data.get("volunteerId") in unnamed:
                names[data["volunteerId"]] = name
    return tasks, incidents, observations, names, obs_to_incident


def _target_and_incident(action, target_id, tasks, incidents, observations, names, obs_to_incident):
    if action == "observation.create":
        obs = observations.get(target_id) or {}
        volunteer = _volunteer_label(obs.get("volunteerId"), names)
        return f"obs · {volunteer}", obs_to_incident.get(target_id)

    if action.startswith("task.") and action != "task.withdraw":
        task = tasks.get(target_id) or {}
        kind = task.get("type") or "task"
        volunteer = _volunteer_label(task.get("volunteerId"), names)
        return f"{kind} · {volunteer}", task.get("incidentId")

    incident = incidents.get(target_id)
    return _incident_label(incident) if incident else (target_id or EMPTY_DETAIL), target_id or None


def _detail(action, target_id, tasks, incidents, observations, names):
    if action == "task.edit":
        return "Instruction replaced"
    if action == "task.approve":
        task = tasks.get(target_id) or {}
        incident = incidents.get(task.get("incidentId") or "") or {}
        if incident.get("conflictId"):
            return "Approved while conflict open (allowed)"
        return EMPTY_DETAIL
    if action == "task.withdraw":
        incident = incidents.get(target_id) or {}
        withdraw = incident.get("withdraw") or {}
        people = [
            _volunteer_label(vid, names)
            for vid in (withdraw.get("volunteerIds") or [])
            if isinstance(vid, str)
        ]
        severity = incident.get("severity") or ""
        if isinstance(severity, str) and severity:
            head = severity.replace("_", " ")
            head = head[0].upper() + head[1:] if head else ""
        else:
            head = ""
        if head and people:
            return f"{head} · {', '.join(people)}"
        if people:
            return ", ".join(people)
        return EMPTY_DETAIL
    if action == "observation.create":
        obs = observations.get(target_id) or {}
        chip = obs.get("chip")
        severity = obs.get("severity") or "unknown"
        if chip:
            return f"chip {chip} · {severity}"
        return f"text · {severity}"
    if action in ("incident.severity.lower", "incident.severity.raise"):
        incident = incidents.get(target_id) or {}
        severity = incident.get("severity")
        if isinstance(severity, str) and severity:
            return f"→ {severity}"
        return EMPTY_DETAIL
    if action == "withdraw.safe":
        return "Volunteer marked safe"
    if action == "task.instruct":
        return "Instruction sent to one volunteer"
    if action == "task.resend":
        return "Instruction sent again"
    if action == "task.heard":
        return "Heard on device"
    if action == "conflict.open":
        return "Reports disagree, dispatch held"
    if action == "live.make":
        return "Live seat assigned"
    if action == "live.retry":
        return "Live video retry"
    if action == "live.drop":
        return "Live video dropped"
    if action == "site.dismiss":
        site = store.db().collection(store.SITES).document(target_id).get()
        if site.exists:
            for alert in (site.to_dict() or {}).get("alerts") or []:
                reason = alert.get("dismissReason") if isinstance(alert, dict) else None
                if isinstance(reason, str) and reason.strip():
                    return reason.strip()
        return "Alert dismissed"
    if action == "site.recheck":
        return "Re-check task proposed"
    return EMPTY_DETAIL


def _load_sorted(target_id):
    """Newest first. Sorted in process so FakeFirestore needs no order_by support."""
    if target_id:
        snaps = store.where(store.AUDIT, "targetId", "==", target_id)
    else:
        snaps = list(store.db().collection(store.AUDIT).stream())
    rows = []
    for snap in snaps:
        data = snap.to_dict() or {}
        data["id"] = snap.id
        rows.append(data)
    rows.sort(key=lambda row: (row.get("at") or "", row.get("id") or ""), reverse=True)
    return rows


def _page(rows, cursor, limit):
    if cursor:
        at, doc_id = cursor
        seen = False
        after = []
        for row in rows:
            key = (row.get("at") or "", row.get("id") or "")
            if not seen:
                if key == (at, doc_id):
                    seen = True
                continue
            after.append(row)
        rows = after
    page = rows[:limit]
    next_cursor = None
    if len(rows) > limit and page:
        last = page[-1]
        next_cursor = _encode_cursor(last.get("at") or "", last.get("id") or "")
    return page, next_cursor


@audit_bp.route("/audit", methods=["GET"])
def list_audit():
    """Supervisor read of the append-only audit collection."""
    _require_supervisor()
    target_id = (request.args.get("targetId") or "").strip() or None
    cursor = _decode_cursor(request.args.get("cursor"))
    limit = _limit()

    rows = _load_sorted(target_id)
    page, next_cursor = _page(rows, cursor, limit)
    tasks, incidents, observations, names, obs_to_incident = _load_related(page)

    items = []
    for row in page:
        action = row.get("action") or ""
        target_id_row = row.get("targetId") or ""
        target, incident_id = _target_and_incident(
            action, target_id_row, tasks, incidents, observations, names, obs_to_incident,
        )
        items.append({
            "id": row.get("id"),
            "at": row.get("at"),
            "actorId": row.get("actorId"),
            "actorName": _actor_name(row, names),
            "action": action,
            "targetId": target_id_row,
            "target": target,
            "detail": _detail(action, target_id_row, tasks, incidents, observations, names),
            "incidentId": incident_id,
        })

    return jsonify({"items": items, "nextCursor": next_cursor}), 200
