"""Volunteer metadata derived only from the caller's already-scoped incidents.

Batch reads follow incident/report ids, never scan the whole database. Unknown
timestamps remain null. No phone numbers, device data or supervisor-only tools
are exposed. Participant counts describe linked volunteers, not live presence.
"""
from datetime import datetime, timezone

from incidents import rules, store


def _iso(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if value.tzinfo else None
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return value if parsed.tzinfo else None
    except ValueError:
        return None


def latest(values):
    valid = [value for value in (_iso(value) for value in values) if value]
    return max(valid, key=lambda value: datetime.fromisoformat(value.replace("Z", "+00:00"))) if valid else None


def task_created(snapshot):
    return _iso((snapshot.to_dict() or {}).get("createdAt")) or _iso(getattr(snapshot, "create_time", None))


def rows(snaps):
    return [{**(snap.to_dict() or {}), "id": snap.id, "createdAt": task_created(snap)} for snap in snaps]


def load(snapshots, uid, known_reports=None, known_tasks=None):
    """Return metadata and safe task/report context for already-authorized ids."""
    ids = [snap.id for snap in snapshots]
    if not ids:
        return {}, {}, {}, {}
    conflicts = rows(store.where_any(store.CONFLICTS, "incidentId", "in", ids))
    tasks = known_tasks if known_tasks is not None else rows(store.where_any(store.TASKS, "incidentId", "in", ids))
    memberships = rows(store.where_any("incident_members", "incidentId", "in", ids))
    audit = rows(store.where_any(store.AUDIT, "targetId", "in", ids + [task["id"] for task in tasks]))
    report_ids = set()
    for snap in snapshots:
        report_ids.update((snap.to_dict() or {}).get("observationIds") or [])
    for conflict in conflicts:
        report_ids.update(conflict.get("observationIds") or [])
    found = dict(known_reports or {})
    found.update(store.get_many(store.OBSERVATIONS, sorted(report_ids - found.keys())))
    reports = {key: {**(snap.to_dict() or {}), "id": key} for key, snap in found.items() if key in report_ids}
    metadata, contexts, task_metadata = {}, {}, {}
    for snap in snapshots:
        data = snap.to_dict() or {}
        here_conflicts = [row for row in conflicts if row.get("incidentId") == snap.id]
        here_tasks = [row for row in tasks if row.get("incidentId") == snap.id]
        linked_ids = set(data.get("observationIds") or [])
        for conflict in here_conflicts:
            linked_ids.update(conflict.get("observationIds") or [])
        here_reports = [reports[key] for key in sorted(linked_ids) if key in reports]
        here_audit = [row for row in audit if row.get("targetId") == snap.id]
        people = {row.get("volunteerId") for row in here_reports + here_tasks + [row for row in memberships if row.get("incidentId") == snap.id]}
        people.update((data.get("withdraw") or {}).get("volunteerIds") or [])
        people.discard(None)
        closed = latest([data.get("closedAt"), data.get("extinguishedAt")] + [row.get("at") for row in here_audit if row.get("action") == "incident.extinguish"])
        metadata[snap.id] = {
            "code": rules.incident_code(data, snap.id), "placeName": rules.place_name(data),
            "updatedAt": latest([data.get("updatedAt"), data.get("createdAt"), getattr(snap, "update_time", None), closed] + [row.get("receivedAt") for row in here_reports] + [row.get("at") for row in here_audit]),
            "closedAt": closed if data.get("status") == "extinguished" else None,
            "reportCount": len(here_reports), "myReportCount": sum(row.get("volunteerId") == uid for row in here_reports),
            "participantCount": len(people), "includesMe": uid in people,
        }
        current = next((row for row in here_conflicts if row["id"] == data.get("conflictId") and row.get("status") == "open"), None) if data.get("status") == "held" else None
        for task in here_tasks:
            task_metadata[task["id"]] = {"createdAt": _iso(task.get("createdAt")), "reasonCode": task.get("reasonCode") if task.get("reasonCode") == "reports_disagree" else "reports_disagree" if current and task.get("type") == "verify" else None}
        instruction_task = max((task for task in here_tasks if task.get("volunteerId") == uid and task.get("status") == "approved" and not task.get("closedAt") and task.get("type") in ("verify", "investigate") and task.get("instruction")), key=lambda task: _iso(task.get("sentAt")) or "", default=None)
        decision = max((row for row in audit if instruction_task and row.get("targetId") == instruction_task["id"] and row.get("action") in ("task.approve", "task.edit", "task.resend")), key=lambda row: _iso(row.get("at")) or "", default=None)
        contexts[snap.id] = None if not current else {
            "dispatchHeld": current.get("dispatchHeld") is True,
            "reports": [{"observationId": row["id"], "volunteerId": row.get("volunteerId"), "volunteerName": rules.reporter_name(row), "severity": row.get("severity")} for row in here_reports if row["id"] in (current.get("observationIds") or [])],
            "instruction": instruction_task.get("instruction") if instruction_task else None,
            "supervisorName": (decision or {}).get("actorName") or None,
        }
    return metadata, contexts, task_metadata, reports
