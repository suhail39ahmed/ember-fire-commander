import pytest

import identity
from app import app
from incidents import store
from incidents.fake_firestore import FakeFirestore


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def db(monkeypatch):
    """Worked path from contract section 9: one conflict, two verify tasks, one dispatch."""
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    fake.add("observations", "obs_01", {
        "volunteerId": "uid_sari", "capturedAt": "2026-10-13T08:12:00Z",
        "receivedAt": "2026-10-13T08:12:04Z", "source": "chip", "lat": 1.482,
        "lng": 102.115, "accuracyM": 18, "chip": "api", "text": None,
        "severity": "small_flame", "photoPath": None, "immutable": True,
    })
    fake.add("observations", "obs_02", {
        "volunteerId": "uid_rizal", "capturedAt": "2026-10-13T08:13:00Z",
        "receivedAt": "2026-10-13T08:13:03Z", "source": "chip", "lat": 1.482,
        "lng": 102.115, "accuracyM": 20, "chip": "aman", "text": None,
        "severity": "none", "photoPath": None, "immutable": True,
    })
    fake.add("incidents", "inc_01", {
        "status": "held", "severity": "small_flame", "evidenceScore": 64,
        "conflictId": "con_01", "withdraw": None, "lat": 1.482, "lng": 102.115,
    })
    fake.add("incidents", "inc_old", {
        "status": "extinguished", "severity": "none", "evidenceScore": 10,
        "conflictId": None, "withdraw": None, "lat": 1.5, "lng": 102.2,
    })
    fake.add("conflicts", "con_01", {
        "incidentId": "inc_01", "observationIds": ["obs_01", "obs_02"],
        "higherSeverity": "small_flame", "status": "open", "dispatchHeld": True,
    })
    for task_id, volunteer, task_type in (
        ("task_verify_sari", "uid_sari", "verify"),
        ("task_verify_rizal", "uid_rizal", "verify"),
        ("task_investigate", "uid_sari", "investigate"),
    ):
        fake.add("tasks", task_id, {
            "incidentId": "inc_01", "volunteerId": volunteer, "type": task_type,
            "status": "proposed", "instruction": "Check the east bank",
        })
    return fake


def _as(monkeypatch, role="supervisor", uid="uid_maya"):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": uid, "name": "Bu Maya", "role": role},
    )


AUTH = {"Authorization": "Bearer valid"}


def _audit(db):
    return list(db.data.get("audit", {}).values())


# Reads -----------------------------------------------------------------------

def test_reads_need_a_token(client, db):
    assert client.get("/incidents").status_code == 401
    assert client.get("/digest").get_json()["error"]["code"] == "unauthorized"


def test_supervisor_lists_live_incidents_only(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.get("/incidents", headers=AUTH)
    assert response.status_code == 200
    body = response.get_json()
    assert [i["id"] for i in body] == ["inc_01"]
    assert set(body[0]) == {"id", "status", "severity", "evidenceScore", "conflictId", "withdraw", "lat", "lng"}


def test_incident_detail_has_both_conflicting_observations(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert body["incident"]["status"] == "held"
    assert body["conflict"]["status"] == "open"
    assert [o["id"] for o in body["observations"]] == ["obs_01", "obs_02"]
    assert [o["severity"] for o in body["observations"]] == ["small_flame", "none"]
    assert len(body["tasks"]) == 3


def test_unknown_incident_is_404(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.get("/incidents/inc_nope", headers=AUTH)
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_volunteer_sees_only_linked_incidents_and_own_tasks(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_rizal")
    assert [i["id"] for i in client.get("/incidents", headers=AUTH).get_json()] == ["inc_01"]
    detail = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert [t["id"] for t in detail["tasks"]] == ["task_verify_rizal"]


def test_volunteer_not_on_incident_gets_404(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_stranger")
    assert client.get("/incidents", headers=AUTH).get_json() == []
    assert client.get("/incidents/inc_01", headers=AUTH).status_code == 404


def test_digest_matches_pwa_shape(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.get("/digest", headers=AUTH).get_json()
    assert set(body) == {"updatedAt", "incidents", "myTasks"}
    assert body["updatedAt"].endswith("Z")
    assert set(body["incidents"][0]) == {"id", "status", "severity", "withdraw", "lat", "lng"}
    assert [t["id"] for t in body["myTasks"]] == ["task_investigate", "task_verify_sari"]


def test_supervisor_digest_has_no_tasks(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH).get_json()
    assert body["myTasks"] == []
    assert [i["id"] for i in body["incidents"]] == ["inc_01"]


# Authorization -----------------------------------------------------------------

@pytest.mark.parametrize("path,body", [
    ("/tasks/task_verify_sari/approve", None),
    ("/tasks/task_verify_sari/reject", None),
    ("/tasks/task_verify_sari/edit", {"instruction": "Go closer"}),
    ("/incidents/inc_01/verify", None),
    ("/incidents/inc_01/extinguish", None),
    ("/incidents/inc_01/severity", {"severity": "none"}),
    ("/incidents/inc_01/withdraw", {"volunteerIds": ["uid_sari"], "instruction": "Withdraw"}),
])
def test_volunteer_cannot_decide(client, monkeypatch, db, path, body):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    response = client.post(path, headers=AUTH, json=body)
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
    assert db.data["tasks"]["task_verify_sari"]["status"] == "proposed"
    assert db.data["incidents"]["inc_01"]["status"] == "held"
    assert _audit(db) == []


def test_missing_role_is_role_missing(client, monkeypatch, db):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": "uid_x"})
    response = client.post("/tasks/task_verify_sari/approve", headers=AUTH)
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "role_missing"


# Decisions ---------------------------------------------------------------------

def test_supervisor_approves_verify_task_with_audit(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.post("/tasks/task_verify_sari/approve", headers=AUTH)
    body = response.get_json()
    assert response.status_code == 200
    assert body["task"]["status"] == "approved"
    assert body["task"]["id"] == "task_verify_sari"
    assert db.data["tasks"]["task_verify_sari"]["status"] == "approved"
    record = db.data["audit"][body["auditId"]]
    assert record["actorId"] == "uid_maya"
    assert record["action"] == "task.approve"
    assert record["targetId"] == "task_verify_sari"
    assert record["at"].endswith("Z")
    assert record["id"] == body["auditId"]
    assert db.commits == 1


def test_supervisor_rejects_task_with_audit(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.post("/tasks/task_verify_rizal/reject", headers=AUTH).get_json()
    assert body["task"]["status"] == "rejected"
    assert db.data["audit"][body["auditId"]]["action"] == "task.reject"


def test_decided_task_cannot_be_decided_again(client, monkeypatch, db):
    _as(monkeypatch)
    client.post("/tasks/task_verify_rizal/reject", headers=AUTH)
    response = client.post("/tasks/task_verify_rizal/approve", headers=AUTH)
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "conflict"
    assert db.data["tasks"]["task_verify_rizal"]["status"] == "rejected"
    assert len(_audit(db)) == 1


def test_dispatch_is_held_while_conflict_is_open(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.post("/tasks/task_investigate/approve", headers=AUTH)
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "conflict"
    assert db.data["tasks"]["task_investigate"]["status"] == "proposed"
    assert _audit(db) == []


def test_dispatch_allowed_once_conflict_resolved(client, monkeypatch, db):
    _as(monkeypatch)
    db.data["conflicts"]["con_01"]["status"] = "resolved"
    response = client.post("/tasks/task_investigate/approve", headers=AUTH)
    assert response.status_code == 200
    assert response.get_json()["task"]["status"] == "approved"


def test_edit_replaces_instruction_only(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.post(
        "/tasks/task_verify_sari/edit", headers=AUTH,
        json={"instruction": "Check the west ditch", "status": "approved", "type": "withdraw"},
    ).get_json()
    assert body["task"]["instruction"] == "Check the west ditch"
    assert body["task"]["status"] == "proposed"
    assert body["task"]["type"] == "verify"
    assert db.data["audit"][body["auditId"]]["action"] == "task.edit"


def test_edit_needs_instruction(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.post("/tasks/task_verify_sari/edit", headers=AUTH, json={"instruction": " "})
    assert response.status_code == 400
    error = response.get_json()["error"]
    assert error["code"] == "validation_error"
    assert "instruction" in error["fields"]


def test_unknown_task_is_404(client, monkeypatch, db):
    _as(monkeypatch)
    assert client.post("/tasks/task_nope/approve", headers=AUTH).status_code == 404


def test_verify_and_extinguish_are_audited(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.post("/incidents/inc_01/verify", headers=AUTH).get_json()
    assert body["incident"]["status"] == "verified"
    assert db.data["audit"][body["auditId"]]["action"] == "incident.verify"
    body = client.post("/incidents/inc_01/extinguish", headers=AUTH).get_json()
    assert body["incident"]["status"] == "extinguished"
    assert db.data["audit"][body["auditId"]]["action"] == "incident.extinguish"
    assert client.post("/incidents/inc_01/verify", headers=AUTH).status_code == 409


@pytest.mark.parametrize("severity,status", [
    ("smoke", 200), ("small_flame", 409), ("large_flame", 409), ("unknown", 400), ("hot", 400),
])
def test_severity_route_only_lowers(client, monkeypatch, db, severity, status):
    _as(monkeypatch)
    response = client.post("/incidents/inc_01/severity", headers=AUTH, json={"severity": severity})
    assert response.status_code == status
    expected = "smoke" if status == 200 else "small_flame"
    assert db.data["incidents"]["inc_01"]["severity"] == expected


# WITHDRAW ----------------------------------------------------------------------

def test_withdraw_is_immediate_and_audited(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_sari", "uid_rizal"],
        "instruction": "Withdraw upwind. Do not engage.",
        "reasons": ["supervisor instruction"],
    })
    body = response.get_json()
    assert response.status_code == 200
    assert body["incident"]["withdraw"] == {
        "active": True,
        "instruction": "Withdraw upwind. Do not engage.",
        "reasons": ["supervisor instruction"],
        "volunteerIds": ["uid_sari", "uid_rizal"],
    }
    withdraw_tasks = [t for t in db.data["tasks"].values() if t["type"] == "withdraw"]
    assert sorted(t["volunteerId"] for t in withdraw_tasks) == ["uid_rizal", "uid_sari"]
    assert all(t["status"] == "approved" for t in withdraw_tasks)
    record = db.data["audit"][body["auditId"]]
    assert record["action"] == "task.withdraw"
    assert record["actorId"] == "uid_maya"
    assert record["targetId"] == "inc_01"
    # Sent while the conflict is open: WITHDRAW does not wait on anything.
    assert db.data["conflicts"]["con_01"]["status"] == "open"


def test_withdraw_reaches_volunteer_digest(client, monkeypatch, db):
    _as(monkeypatch)
    client.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_rizal"], "instruction": "Withdraw upwind.", "reasons": [],
    })
    _as(monkeypatch, role="volunteer", uid="uid_rizal")
    body = client.get("/digest", headers=AUTH).get_json()
    assert body["incidents"][0]["withdraw"]["active"] is True
    assert any(t["type"] == "withdraw" and t["status"] == "approved" for t in body["myTasks"])


def test_withdraw_task_cannot_be_approved_rejected_or_edited(client, monkeypatch, db):
    _as(monkeypatch)
    db.add("tasks", "task_withdraw", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "withdraw",
        "status": "approved", "instruction": "Withdraw upwind.",
    })
    for action, body in (("approve", None), ("reject", None), ("edit", {"instruction": "Stay"})):
        response = client.post(f"/tasks/task_withdraw/{action}", headers=AUTH, json=body)
        assert response.status_code == 409
    assert db.data["tasks"]["task_withdraw"]["status"] == "approved"
    assert db.data["tasks"]["task_withdraw"]["instruction"] == "Withdraw upwind."


def test_lowering_severity_does_not_clear_withdraw(client, monkeypatch, db):
    _as(monkeypatch)
    active = {"active": True, "instruction": "Withdraw upwind.", "reasons": ["large flame reported"], "volunteerIds": ["uid_sari"]}
    db.data["incidents"]["inc_01"]["withdraw"] = dict(active)
    body = client.post("/incidents/inc_01/severity", headers=AUTH, json={"severity": "none"}).get_json()
    assert body["incident"]["severity"] == "none"
    assert body["incident"]["withdraw"] == active
    assert db.data["incidents"]["inc_01"]["withdraw"] == active


def test_withdraw_keeps_volunteers_already_withdrawn(client, monkeypatch, db):
    _as(monkeypatch)
    db.data["incidents"]["inc_01"]["withdraw"] = {
        "active": True, "instruction": "Withdraw.", "reasons": ["large flame reported"], "volunteerIds": ["uid_sari"],
    }
    body = client.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_rizal"], "instruction": "Withdraw upwind.", "reasons": ["wind shift"],
    }).get_json()
    assert body["incident"]["withdraw"]["volunteerIds"] == ["uid_sari", "uid_rizal"]


def test_withdraw_rejects_volunteer_not_on_incident(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_stranger"], "instruction": "Withdraw.",
    })
    assert response.status_code == 400
    assert "volunteerIds" in response.get_json()["error"]["fields"]
    assert db.data["incidents"]["inc_01"]["withdraw"] is None
    assert _audit(db) == []


def test_no_route_clears_withdraw_or_sets_status(client, monkeypatch, db):
    _as(monkeypatch)
    for method in ("put", "patch", "delete"):
        response = getattr(client, method)("/incidents/inc_01", headers=AUTH, json={"withdraw": None, "status": "open"})
        assert response.status_code == 405
