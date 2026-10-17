"""Join requests: a volunteer asks, a supervisor approves (an instruct task) or declines."""
import pytest

import identity
import join_routes
from app import app
from incidents import store
from incidents.fake_firestore import FakeFirestore

AUTH = {"Authorization": "Bearer valid"}


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def pushed(monkeypatch):
    sent = []
    monkeypatch.setattr(join_routes, "deliver_task", sent.append)
    return sent


@pytest.fixture
def db(monkeypatch, pushed):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    fake.add("observations", "obs_rizal", {"volunteerId": "uid_rizal", "capturedAt": "2026-10-16T08:00:00Z"})
    fake.add("incidents", "inc_fire", {
        "name": "Bengkalis · Rizal · #1", "area": "Bengkalis", "status": "open", "severity": "small_flame",
        "withdraw": None, "lat": 1.48, "lng": 102.11, "observationIds": ["obs_rizal"],
    })
    fake.add("incidents", "inc_out", {"status": "extinguished", "severity": "none", "withdraw": None, "lat": 1.5, "lng": 102.1})
    fake.add("incidents", "inc_withdraw", {
        "status": "open", "severity": "large_flame", "lat": 1.5, "lng": 102.1,
        "withdraw": {"active": True, "instruction": "Mundur", "volunteerIds": ["uid_sari"], "safeVolunteerIds": []},
    })
    fake.add("tasks", "task_rizal", {"incidentId": "inc_fire", "volunteerId": "uid_rizal", "type": "verify", "status": "approved"})
    return fake


def _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari"):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": uid, "name": name, "role": role})


def _supervisor(monkeypatch):
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")


def _audit(db):
    return list(db.data.get("audit", {}).values())


# Asking ----------------------------------------------------------------------

def test_a_volunteer_asks_to_join_and_it_is_audited(client, db, monkeypatch):
    _as(monkeypatch)
    response = client.post("/incidents/inc_fire/join-requests", headers=AUTH)
    assert response.status_code == 201
    body = response.get_json()
    assert body["auditId"]
    request = body["joinRequest"]
    assert request["id"] == "inc_fire__uid_sari"
    assert (request["incidentId"], request["volunteerId"], request["status"]) == ("inc_fire", "uid_sari", "pending")
    assert request["volunteerName"] == "Sari"
    assert request["createdAt"] and request["decidedAt"] is None
    assert db.data["joinRequests"]["inc_fire__uid_sari"]["status"] == "pending"
    row, = _audit(db)
    assert (row["action"], row["actorId"], row["targetId"], row["subjectId"]) == ("join.request", "uid_sari", "inc_fire", "uid_sari")


def test_asking_twice_returns_the_first_request_and_writes_nothing(client, db, monkeypatch):
    _as(monkeypatch)
    first = client.post("/incidents/inc_fire/join-requests", headers=AUTH).get_json()
    again = client.post("/incidents/inc_fire/join-requests", headers=AUTH)
    assert again.status_code == 200
    assert again.get_json()["auditId"] is None
    assert again.get_json()["joinRequest"]["createdAt"] == first["joinRequest"]["createdAt"]
    assert len(_audit(db)) == 1


def test_asking_is_refused_in_the_cases_that_make_no_sense(client, db, monkeypatch):
    _as(monkeypatch)
    assert client.post("/incidents/missing/join-requests", headers=AUTH).status_code == 404
    assert client.post("/incidents/inc_out/join-requests", headers=AUTH).status_code == 409
    # Already on the incident: a withdraw entry, a task and a report all count.
    assert client.post("/incidents/inc_withdraw/join-requests", headers=AUTH).status_code == 409
    _as(monkeypatch, uid="uid_rizal", name="Rizal")
    assert client.post("/incidents/inc_fire/join-requests", headers=AUTH).status_code == 409
    assert db.data.get("joinRequests", {}) == {}
    assert _audit(db) == []


def test_a_declined_volunteer_cannot_ask_again(client, db, monkeypatch):
    db.add("joinRequests", "inc_fire__uid_sari", {
        "incidentId": "inc_fire", "volunteerId": "uid_sari", "status": "declined", "createdAt": "2026-10-16T08:00:00.000Z",
    })
    _as(monkeypatch)
    assert client.post("/incidents/inc_fire/join-requests", headers=AUTH).status_code == 409


def test_a_supervisor_cannot_ask_to_join(client, db, monkeypatch):
    _supervisor(monkeypatch)
    assert client.post("/incidents/inc_fire/join-requests", headers=AUTH).status_code == 403


# Listing ---------------------------------------------------------------------

def _seed_requests(db):
    db.add("joinRequests", "inc_fire__uid_late", {
        "incidentId": "inc_fire", "volunteerId": "uid_late", "volunteerName": "Late", "status": "pending", "createdAt": "2026-10-16T08:30:00.000Z",
    })
    db.add("joinRequests", "inc_fire__uid_early", {
        "incidentId": "inc_fire", "volunteerId": "uid_early", "volunteerName": "Early", "status": "pending", "createdAt": "2026-10-16T08:10:00.000Z",
    })
    db.add("joinRequests", "inc_fire__uid_done", {
        "incidentId": "inc_fire", "volunteerId": "uid_done", "status": "declined", "createdAt": "2026-10-16T08:00:00.000Z",
    })
    db.add("joinRequests", "gone__uid_x", {
        "incidentId": "gone", "volunteerId": "uid_x", "volunteerName": "X", "status": "pending", "createdAt": "2026-10-16T08:40:00.000Z",
    })


def test_a_supervisor_lists_pending_requests_oldest_first(client, db, monkeypatch):
    _seed_requests(db)
    _supervisor(monkeypatch)
    rows = client.get("/join-requests?status=pending", headers=AUTH).get_json()
    assert [r["request"]["id"] for r in rows] == ["inc_fire__uid_early", "inc_fire__uid_late", "gone__uid_x"]
    first = rows[0]
    assert first["volunteerName"] == "Early"
    assert first["incident"]["id"] == "inc_fire"
    assert first["incident"]["label"] == "Bengkalis · Rizal · #1"
    assert rows[2]["incident"] is None


def test_the_list_needs_status_pending_and_a_supervisor(client, db, monkeypatch):
    _supervisor(monkeypatch)
    assert client.get("/join-requests", headers=AUTH).status_code == 400
    assert client.get("/join-requests?status=declined", headers=AUTH).status_code == 400
    _as(monkeypatch)
    assert client.get("/join-requests?status=pending", headers=AUTH).status_code == 403


# Approving -------------------------------------------------------------------

def test_approving_creates_an_approved_instruct_task_and_pushes_it(client, db, pushed, monkeypatch):
    _seed_requests(db)
    _supervisor(monkeypatch)
    response = client.post("/join-requests/inc_fire__uid_early/approve", headers=AUTH, json={"instruction": "  Meet at the north gate  "})
    assert response.status_code == 200
    body = response.get_json()
    task = body["task"]
    assert (task["incidentId"], task["volunteerId"], task["type"], task["status"]) == ("inc_fire", "uid_early", "instruct", "approved")
    assert task["instruction"] == "Meet at the north gate"
    assert task["sentAt"] and task["resendAt"]
    request = body["joinRequest"]
    assert (request["status"], request["decidedBy"], request["taskId"]) == ("approved", "uid_maya", task["id"])
    assert request["decidedAt"]
    assert db.data["tasks"][task["id"]]["status"] == "approved"
    assert db.data["joinRequests"]["inc_fire__uid_early"]["status"] == "approved"
    assert [t["id"] for t in pushed] == [task["id"]]
    actions = sorted((row["action"], row["targetId"]) for row in _audit(db))
    assert actions == [("join.approve", "inc_fire__uid_early"), ("task.instruct", task["id"])]
    approve = next(row for row in _audit(db) if row["action"] == "join.approve")
    assert (approve["actorId"], approve["subjectId"]) == ("uid_maya", "uid_early")


def test_an_approved_volunteer_now_sees_the_incident_in_their_digest(client, db, monkeypatch):
    _seed_requests(db)
    _supervisor(monkeypatch)
    client.post("/join-requests/inc_fire__uid_early/approve", headers=AUTH, json={"instruction": "Come"})
    _as(monkeypatch, uid="uid_early", name="Early")
    body = client.get("/digest", headers=AUTH).get_json()
    assert [i["id"] for i in body["incidents"]] == ["inc_fire"]
    assert [t["instruction"] for t in body["myTasks"]] == ["Come"]
    assert body["myJoinRequests"][0]["status"] == "approved"


def test_a_failed_push_does_not_undo_the_approval(client, db, monkeypatch):
    def boom(task):
        raise RuntimeError("fcm down")

    monkeypatch.setattr(join_routes, "deliver_task", boom)
    _seed_requests(db)
    _supervisor(monkeypatch)
    response = client.post("/join-requests/inc_fire__uid_early/approve", headers=AUTH, json={"instruction": "Come"})
    assert response.status_code == 200
    assert db.data["joinRequests"]["inc_fire__uid_early"]["status"] == "approved"


@pytest.mark.parametrize("body", [None, {}, {"instruction": ""}, {"instruction": "   "}, {"instruction": 5}, {"instruction": "x" * 501}])
def test_approving_needs_an_instruction(client, db, pushed, monkeypatch, body):
    _seed_requests(db)
    _supervisor(monkeypatch)
    response = client.post("/join-requests/inc_fire__uid_early/approve", headers=AUTH, json=body)
    assert response.status_code == 400
    assert "instruction" in response.get_json()["error"]["fields"] or "body" in response.get_json()["error"]["fields"]
    assert db.data["joinRequests"]["inc_fire__uid_early"]["status"] == "pending"
    assert pushed == [] and _audit(db) == []


def test_approving_is_refused_when_it_was_answered_or_the_fire_is_out(client, db, pushed, monkeypatch):
    _seed_requests(db)
    db.add("joinRequests", "inc_out__uid_y", {
        "incidentId": "inc_out", "volunteerId": "uid_y", "status": "pending", "createdAt": "2026-10-16T08:00:00.000Z",
    })
    _supervisor(monkeypatch)
    ok = {"instruction": "Come"}
    assert client.post("/join-requests/missing/approve", headers=AUTH, json=ok).status_code == 404
    assert client.post("/join-requests/inc_fire__uid_done/approve", headers=AUTH, json=ok).status_code == 409
    assert client.post("/join-requests/inc_out__uid_y/approve", headers=AUTH, json=ok).status_code == 409
    assert client.post("/join-requests/gone__uid_x/approve", headers=AUTH, json=ok).status_code == 404
    assert client.post("/join-requests/inc_fire__uid_early/approve", headers=AUTH, json=ok).status_code == 200
    assert client.post("/join-requests/inc_fire__uid_early/approve", headers=AUTH, json=ok).status_code == 409
    assert len(pushed) == 1


# Declining -------------------------------------------------------------------

def test_declining_marks_the_request_and_audits_it(client, db, pushed, monkeypatch):
    _seed_requests(db)
    _supervisor(monkeypatch)
    response = client.post("/join-requests/inc_fire__uid_early/decline", headers=AUTH)
    assert response.status_code == 200
    request = response.get_json()["joinRequest"]
    assert (request["status"], request["decidedBy"], request["taskId"]) == ("declined", "uid_maya", None)
    row, = _audit(db)
    assert (row["action"], row["targetId"], row["subjectId"]) == ("join.decline", "inc_fire__uid_early", "uid_early")
    assert "tasks" not in db.data or all(t.get("volunteerId") != "uid_early" for t in db.data["tasks"].values())
    assert pushed == []
    assert client.post("/join-requests/inc_fire__uid_early/decline", headers=AUTH).status_code == 409
    assert client.post("/join-requests/missing/decline", headers=AUTH).status_code == 404


def test_a_volunteer_cannot_decide(client, db, monkeypatch):
    _seed_requests(db)
    _as(monkeypatch)
    assert client.post("/join-requests/inc_fire__uid_early/approve", headers=AUTH, json={"instruction": "Come"}).status_code == 403
    assert client.post("/join-requests/inc_fire__uid_early/decline", headers=AUTH).status_code == 403
