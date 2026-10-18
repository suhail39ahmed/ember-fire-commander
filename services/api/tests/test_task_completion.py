import pytest

from tests.test_volunteer_routes import client, db, _as, AUTH


def payload(client_id="completion-1"):
    from observations.store import utc_now_iso
    return {"clientId": client_id, "observations": [{
        "source": "chip", "chip": "aman", "text": "Finished checking the east bank",
        "capturedAt": utc_now_iso(), "lat": 55.0, "lng": 10.0, "accuracyM": 12,
        "taskId": "task_sari",
    }]}


def test_completion_saves_task_evidence_atomically_and_never_creates_incident(client, db, monkeypatch):
    _as(monkeypatch)
    monkeypatch.setattr("observations.routes.notify_observation", lambda *_: pytest.fail("Task result must not enter report intake"))
    body = payload()
    first = client.post("/tasks/task_sari/complete", headers=AUTH, json=body)
    assert first.status_code == 200
    task = first.get_json()["task"]
    assert task["completedAt"] == task["closedAt"]
    assert task["completionNote"] == "Finished checking the east bank"
    ids = task["completionObservationIds"]
    assert db.data["incidents"]["inc_01"]["observationIds"] == ids
    assert db.data["observations"][ids[0]]["taskId"] == "task_sari"
    assert set(db.data["incidents"]) == {"inc_01", "inc_calm"}
    assert "intakePending" not in db.data
    retry = client.post("/tasks/task_sari/complete", headers=AUTH, json=body)
    assert retry.status_code == 200
    assert retry.get_json()["auditId"] is None
    assert len(db.data["observations"]) == 1
    assert len(db.data["audit"]) == 1
    assert client.post("/tasks/task_sari/complete", headers=AUTH, json=payload("other")).status_code == 409
    assert client.post("/tasks/task_sari/accept", headers=AUTH).status_code == 409
    digest = client.get("/digest", headers=AUTH).get_json()
    assert next(t for t in digest["myTasks"] if t["id"] == "task_sari")["completedAt"]
    _as(monkeypatch, role="supervisor", uid="uid_maya")
    detail = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert next(t for t in detail["tasks"] if t["id"] == "task_sari")["completionNote"] == task["completionNote"]
    assert next(t for t in detail["tasks"] if t["id"] == "task_sari")["resendAt"] is None
    assert client.post("/tasks/task_sari/resend", headers=AUTH).status_code == 409
    assert any(o["id"] == ids[0] for o in detail["observations"])


@pytest.mark.parametrize("task_id, expected", [("task_rizal", 404), ("missing", 404), ("task_proposed", 409), ("task_withdraw", 409)])
def test_only_own_open_task_can_complete(client, db, monkeypatch, task_id, expected):
    _as(monkeypatch)
    assert client.post(f"/tasks/{task_id}/complete", headers=AUTH, json=payload()).status_code == expected
    assert not db.data.get("observations")
    assert not db.data.get("audit")


def test_supervisor_cannot_complete_and_invalid_evidence_does_not_close(client, db, monkeypatch):
    _as(monkeypatch, role="supervisor")
    assert client.post("/tasks/task_sari/complete", headers=AUTH, json=payload()).status_code == 403
    _as(monkeypatch)
    body = payload()
    body["observations"].append({"source": "video", "videoPath": "wrong"})
    assert client.post("/tasks/task_sari/complete", headers=AUTH, json=body).status_code == 400
    assert not db.data["tasks"]["task_sari"].get("closedAt")
    assert not db.data.get("observations")


def test_four_photos_and_video_are_linked_to_task_and_incident(client, db, monkeypatch):
    _as(monkeypatch)
    monkeypatch.setattr("task_completion.check_photo_path", lambda *_: None)
    monkeypatch.setattr("task_completion.check_video_path", lambda *_: None)
    body = payload()
    base = body["observations"][0]
    body["observations"] += [dict(base, source="photo", chip=None, photoPath=f"photos/uid_sari/20261018/{i:032x}.jpg") for i in range(4)]
    body["observations"].append(dict(base, source="video", chip=None, videoPath=f"videos/uid_sari/20261018/{5:032x}.mp4"))
    result = client.post("/tasks/task_sari/complete", headers=AUTH, json=body)
    assert result.status_code == 200, result.get_json()
    assert len(result.get_json()["task"]["completionObservationIds"]) == 6
    assert len(db.data["incidents"]["inc_01"]["observationIds"]) == 6
