"""One atomic, idempotent task result, including its uploaded evidence."""
from incidents import rules, store
from incidents.errors import conflict, not_found, validation
from observations.photo import check_photo_path
from observations.video import check_video_path
from observations.store import assemble_record, observation_id_for
from observations.validate import prepare_observation, ValidationError


def submit(task_id, body, actor):
    client_id = body.get("clientId")
    entries = body.get("observations")
    if not isinstance(client_id, str) or not 1 <= len(client_id) <= 128:
        raise validation("clientId", "use a stable submission id")
    if not isinstance(entries, list) or not 1 <= len(entries) <= 6:
        raise validation("observations", "send task details with up to four photos and one video")

    def run(transaction):
        task_ref = store.db().collection(store.TASKS).document(task_id)
        snap = task_ref.get(transaction=transaction)
        task = (snap.to_dict() or {}) if snap.exists else None
        if not task or task.get("volunteerId") != actor["id"]:
            raise not_found("task")
        # A lost response can be retried even after its capturedAt validation window.
        if task.get("completionClientId") == client_id:
            return {"task": rules.pick(dict(task, id=task_id), rules.TASK_FIELDS), "auditId": None}
        if task.get("status") != "approved" or task.get("type") not in ("verify", "investigate", "instruct", "monitor") or task.get("closedAt") or task.get("declinedAt"):
            raise conflict("Only your open task can be completed")
        incident_ref = store.db().collection(store.INCIDENTS).document(task["incidentId"])
        incident_snap = incident_ref.get(transaction=transaction)
        if not incident_snap.exists:
            raise not_found("incident")
        incident = incident_snap.to_dict() or {}
        prepared = []
        for entry in entries:
            if not isinstance(entry, dict) or entry.get("taskId") not in (None, task_id):
                raise validation("taskId", "details must belong to this task")
            try:
                value = prepare_observation(entry)
            except ValidationError as exc:
                raise validation("observations", exc.message) from exc
            if value["source"] == "photo":
                check_photo_path(actor["id"], value["photoPath"])
            if value["source"] == "video":
                check_video_path(actor["id"], value["videoPath"])
            prepared.append(value)
        sources = [entry["source"] for entry in prepared]
        if sources.count("photo") > 4 or sources.count("video") > 1 or sum(source not in ("photo", "video") for source in sources) > 1:
            raise validation("observations", "send one note/card, up to four photos and one video")
        now = rules.now_iso()
        observation_ids = []
        for index, entry in enumerate(prepared):
            obs_id = observation_id_for(actor["id"], f"task:{task_id}:{client_id}:{index}")
            record = assemble_record(entry, actor["id"], now, actor.get("displayName"))
            record.update(id=obs_id, checkTaskId=task_id, taskId=task_id)
            transaction.set(store.db().collection(store.OBSERVATIONS).document(obs_id), record)
            observation_ids.append(obs_id)
        changes = {
            "completedAt": now, "closedAt": now, "closedBy": actor["id"],
            "completionClientId": client_id, "completionObservationIds": observation_ids,
            "completionNote": next((entry["text"] for entry in prepared if entry.get("text")), None),
            "completionChip": next((entry["chip"] for entry in prepared if entry.get("chip")), None),
        }
        transaction.update(task_ref, changes)
        transaction.update(incident_ref, {"observationIds": list(dict.fromkeys([*(incident.get("observationIds") or []), *observation_ids]))})
        audit_ref = store.db().collection(store.AUDIT).document()
        transaction.set(audit_ref, rules.audit_record(audit_ref.id, actor["id"], "task.complete", task_id))
        return {"task": rules.pick(dict(task, **changes, id=task_id), rules.TASK_FIELDS), "auditId": audit_ref.id}

    return store.run_transaction(run)
