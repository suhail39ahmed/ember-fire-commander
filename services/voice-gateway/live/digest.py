"""The caller's current picture, for Live context and the get_my_task tool."""

SUMMARY_FIELDS = ("id", "name", "area", "status", "severity", "withdraw", "lat", "lng")
TASK_FIELDS = ("id", "incidentId", "volunteerId", "type", "status", "instruction")
LIVE_STATUSES = ("open", "held", "verified")


def _pick(record, fields):
    return {field: record.get(field) for field in fields}


def digest_for(user, incidents, tasks, observations, now, conflicts=()):
    """Build the contract digest. A supervisor gets no tasks."""
    if user.get("role") == "supervisor":
        chosen = [item for item in incidents if item.get("status") in LIVE_STATUSES]
        my_tasks = []
    else:
        uid = user.get("id")
        mine = {item["id"] for item in observations if item.get("volunteerId") == uid and item.get("id")}
        task_incidents = {item.get("incidentId") for item in tasks if item.get("volunteerId") == uid}
        chosen = [
            item for item in incidents
            if _linked(item, uid, mine, task_incidents, conflicts)
        ]
        my_tasks = [
            _pick(item, TASK_FIELDS)
            for item in tasks
            if item.get("volunteerId") == uid
        ]
        my_tasks.sort(key=lambda item: item.get("id") or "")
    summaries = [_pick(item, SUMMARY_FIELDS) for item in sorted(chosen, key=lambda item: item.get("id") or "")]
    return {"updatedAt": now, "incidents": summaries, "myTasks": my_tasks}


def _linked(incident, uid, observation_ids, task_incidents, conflicts):
    if incident.get("id") in task_incidents:
        return True
    volunteers = ((incident.get("withdraw") or {}).get("volunteerIds") or [])
    if uid in volunteers:
        return True
    if observation_ids.intersection(incident.get("observationIds") or []):
        return True
    for conflict in conflicts:
        if conflict.get("incidentId") != incident.get("id"):
            continue
        if observation_ids.intersection(conflict.get("observationIds") or []):
            return True
    return False


def current_task(tasks):
    """Newest approved task. A withdraw task wins over any other type."""
    approved = [item for item in tasks if item.get("status") == "approved"]
    if not approved:
        return None
    withdraws = [item for item in approved if item.get("type") == "withdraw"]
    pool = withdraws or approved

    def newest(item):
        return item.get("at") or item.get("id") or ""

    return _pick(max(pool, key=newest), TASK_FIELDS)
