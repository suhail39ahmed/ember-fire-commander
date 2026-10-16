"""Extra supervisor-only parts of GET /incidents/{id} (contract 6.3).

Everything here is read from records the services already store: observations,
tasks, the audit log, notification attempts, volunteer names and the advisory
incident summary. Nothing is guessed. A value with no stored source is None
and a part with nothing to show is an empty list, never a made-up default.
"""
import math

from incidents import rules, store

ATTEMPTS = "notificationAttempts"
SUMMARIES = "incident_summaries"
TIMELINE_LIMIT = 100
# Audit rows that belong on an incident's timeline. `observation.create` is left out because the report itself is listed.
TIMELINE_ACTIONS = (
    "task.approve", "task.reject", "task.edit", "task.instruct", "task.resend", "task.heard", "task.withdraw",
    "withdraw.safe", "incident.verify", "incident.extinguish", "incident.severity.lower",
    "incident.severity.raise", "site.reinspect",
)
SUMMARY_FIELDS = ("english", "bahasa", "source", "at")
# Audit rows that belong to a disagreement: decisions on its verify and investigate tasks, and on the incident itself.
CONFLICT_TASK_TYPES = ("verify", "investigate")
CONFLICT_TASK_ACTIONS = ("task.approve", "task.reject", "task.edit", "task.resend", "task.heard")
CONFLICT_INCIDENT_ACTIONS = ("incident.verify", "incident.extinguish", "incident.severity.lower", "incident.severity.raise")


def distance_m(lat1, lng1, lat2, lng2):
    """Straight-line distance in metres, rounded. None when any coordinate is missing."""
    values = (lat1, lng1, lat2, lng2)
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        return None
    rad = math.pi / 180
    d_lat, d_lng = (lat2 - lat1) * rad, (lng2 - lng1) * rad
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(d_lng / 2) ** 2
    return round(2 * 6371000 * math.asin(min(1.0, math.sqrt(h))))


def _when(iso):
    parsed = rules._parse(iso) if iso else None
    return parsed.timestamp() if parsed else 0.0


def _latest(times):
    """The latest of some ISO times, ignoring blanks. None when there is none."""
    times = [t for t in times if t]
    return max(times, key=_when) if times else None


def _newest(rows, key):
    """The row with the latest time, then the highest id, so the choice never flickers."""
    return max(rows, key=lambda r: (_when(r.get(key)), r.get("id") or ""), default=None)


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def _profiles(uids):
    """What volunteers/{uid} says about each volunteer: a display name, and whether a device is registered.

    The phone and the device tokens themselves are never copied out. `push` is only whether one token exists.
    """
    names, push = {}, {}
    for uid, snap in store.get_many(store.VOLUNTEERS, [u for u in uids if u]).items():
        data = snap.to_dict() or {}
        name = _text(data.get("displayName"))
        if name:
            names[uid] = name
        tokens = data.get("fcmTokens")
        push[uid] = isinstance(tokens, list) and any(isinstance(t, str) and t.strip() for t in tokens)
    return names, push


def _docs(snaps):
    return [(s.to_dict() or {}) | {"id": s.id} for s in snaps]


def _delivery(task_ids):
    """The last push result for each task id: sent, failed or skipped."""
    by_task = {}
    for row in _docs(store.where_any(ATTEMPTS, "targetId", "in", sorted(task_ids))) if task_ids else []:
        by_task.setdefault(row.get("targetId"), []).append(row)
    return {tid: (_newest(rows, "at") or {}).get("result") for tid, rows in by_task.items()}


def _audit_rows(incident_id, task_ids):
    rows = _docs(store.where(store.AUDIT, "targetId", "==", incident_id))
    if task_ids:
        rows += _docs(store.where_any(store.AUDIT, "targetId", "in", sorted(task_ids)))
    return [r for r in rows if r.get("action") in TIMELINE_ACTIONS]


def _card(uid, observations, tasks, withdraw, names, push, centre, delivery, safe_marks):
    mine = sorted(
        (o for o in observations if o.get("volunteerId") == uid),
        key=lambda o: (_when(o.get("capturedAt")), o.get("id") or ""),
    )
    last = mine[-1] if mine else None
    named = next((rules.reporter_name(o) for o in reversed(mine) if rules.reporter_name(o)), None)
    card = {
        "volunteerId": uid,
        "name": named or names.get(uid),
        "reportCount": len(mine),
        "firstReportAt": mine[0].get("capturedAt") if mine else None,
        "lastReportAt": last.get("capturedAt") if last else None,
        "lastSeverity": last.get("severity") if last else None,
        "lastLat": last.get("lat") if last else None,
        "lastLng": last.get("lng") if last else None,
        "lastAccuracyM": last.get("accuracyM") if last else None,
        # From the incident's centre, which is the centroid of its reports. Not the flame edge.
        "distanceM": distance_m(centre[0], centre[1], last.get("lat"), last.get("lng")) if last else None,
        # The latest sign of life: their newest report arriving, or their app saying it showed an instruction.
        "lastHeardAt": _latest([last.get("receivedAt") if last else None] + [t.get("heardAt") for t in tasks if t.get("volunteerId") == uid]),
        # Whether a device token is stored for them. No role, network, battery or language is stored anywhere.
        "pushReady": push.get(uid, False),
        "withdraw": None,
    }
    if withdraw.get("active") and uid in (withdraw.get("volunteerIds") or []):
        sent = _newest([t for t in tasks if t.get("volunteerId") == uid and t.get("type") == "withdraw"], "sentAt")
        mark = safe_marks.get(uid)
        safe = uid in (withdraw.get("safeVolunteerIds") or [])
        card["withdraw"] = {
            "sentAt": sent.get("sentAt") if sent else None,
            "heardAt": sent.get("heardAt") if sent else None,
            "sendCount": sent.get("sendCount") if sent else None,
            "delivery": delivery.get(sent["id"]) if sent else None,
            "safe": safe,
            # Who and when come from the audit row written at the time. A mark made before that row carried the volunteer has neither.
            "safeAt": mark.get("at") if safe and mark else None,
            "safeBy": {"id": mark.get("actorId"), "name": _text(mark.get("actorName")) or names.get(mark.get("actorId"))} if safe and mark else None,
        }
    return card


def _audit_entry(row, task_by_id, names):
    """One audit row in the shape the timeline and the conflict context share."""
    task = task_by_id.get(row.get("targetId")) or {}
    return {
        "kind": "audit", "id": row["id"], "at": row.get("at"), "action": row.get("action"),
        "actorId": row.get("actorId"),
        "actorName": None if row.get("actorId") == "code" else _text(row.get("actorName")) or names.get(row.get("actorId")),
        "volunteerId": row.get("subjectId") or task.get("volunteerId"),
        "taskId": row.get("targetId") if task else None,
        "severity": None, "source": None, "chip": None, "text": None,
    }


def _conflict_context(incident_id, data, observations, conflict_body, tasks, audit, names, task_by_id):
    """What a supervisor needs beside the two sides of a disagreement. None when the incident has no conflict.

    `otherObservations` are the reports the incident holds that are on neither side (smoke or unknown),
    which `observations` leaves out while a conflict exists. `audit` is the recorded decisions on the
    conflict's verify and investigate tasks and on the incident. No audit row records the moment a conflict
    opened, and no wind or satellite factor is stored, so neither is returned.
    """
    if not conflict_body:
        return None
    sides = set(conflict_body.get("observationIds") or [])
    mine = set(data.get("observationIds") or [])
    others = sorted(
        (o for o in observations if o.get("id") in mine and o.get("id") not in sides),
        key=lambda o: (_when(o.get("capturedAt")), o.get("id") or ""),
    )
    records = []
    for o in others:
        record = rules.pick(o, rules.OBSERVATION_FIELDS)
        name = rules.reporter_name(o)
        if name:
            record["volunteerName"] = name
        records.append(record)
    task_ids = {t["id"] for t in tasks if t.get("type") in CONFLICT_TASK_TYPES}
    rows = [
        r for r in audit
        if (r.get("action") in CONFLICT_INCIDENT_ACTIONS and r.get("targetId") == incident_id)
        or (r.get("action") in CONFLICT_TASK_ACTIONS and r.get("targetId") in task_ids)
    ]
    entries = [_audit_entry(r, task_by_id, names) for r in rows]
    entries.sort(key=lambda e: (_when(e["at"]), e["id"]))
    return {"otherObservations": records, "audit": entries[-TIMELINE_LIMIT:]}


def build(incident_id, data, observations, conflict_body, tasks):
    """The supervisor-only extras for one incident.

    `observations` are the incident's own and its conflict's observation records (`id` set), every one the
    incident knows, not only the two sides of a disagreement. `tasks` are all the incident's tasks.
    """
    withdraw = data.get("withdraw") or {}
    task_ids = {t["id"] for t in tasks}
    audit = _audit_rows(incident_id, task_ids)
    uids = {o.get("volunteerId") for o in observations} | {t.get("volunteerId") for t in tasks}
    uids |= set(withdraw.get("volunteerIds") or []) if withdraw.get("active") else set()
    uids |= {r.get("actorId") for r in audit} | {r.get("subjectId") for r in audit}
    uids.discard(None)
    names, push = _profiles(uids)

    withdraw_task_ids = {t["id"] for t in tasks if t.get("type") == "withdraw"}
    safe_marks = {}
    for row in audit:
        if row.get("action") == "withdraw.safe" and row.get("subjectId"):
            current = safe_marks.get(row["subjectId"])
            if current is None or _when(row.get("at")) >= _when(current.get("at")):
                safe_marks[row["subjectId"]] = row
    delivery = _delivery(withdraw_task_ids)

    centre = (data.get("lat"), data.get("lng"))
    people = {o.get("volunteerId") for o in observations} | {t.get("volunteerId") for t in tasks}
    if withdraw.get("active"):
        people |= set(withdraw.get("volunteerIds") or [])
    people.discard(None)
    cards = [_card(uid, observations, tasks, withdraw, names, push, centre, delivery, safe_marks) for uid in sorted(people)]
    cards.sort(key=lambda c: (-_when(c["lastReportAt"]), c["volunteerId"]))

    task_by_id = {t["id"]: t for t in tasks}
    entries = []
    for o in observations:
        entries.append({
            "kind": "report", "id": o["id"], "at": o.get("capturedAt"), "action": None,
            "actorId": o.get("volunteerId"), "actorName": rules.reporter_name(o) or names.get(o.get("volunteerId")),
            "volunteerId": o.get("volunteerId"), "taskId": None,
            "severity": o.get("severity"), "source": o.get("source"), "chip": o.get("chip"), "text": o.get("text"),
        })
    entries += [_audit_entry(row, task_by_id, names) for row in audit]
    entries.sort(key=lambda e: (_when(e["at"]), e["id"]))
    timeline = entries[-TIMELINE_LIMIT:]

    summary = None
    snap = store.db().collection(SUMMARIES).document(incident_id).get()
    if snap.exists:
        raw = snap.to_dict() or {}
        if _text(raw.get("english")) or _text(raw.get("bahasa")):
            summary = rules.pick(raw, SUMMARY_FIELDS)
    return {
        "volunteers": cards, "timeline": timeline, "summary": summary,
        "conflictContext": _conflict_context(incident_id, data, observations, conflict_body, tasks, audit, names, task_by_id),
        # Only a value stored on the incident itself. Nothing writes it yet, so it is None today.
        "agencyInCharge": _text(data.get("agency")),
    }
