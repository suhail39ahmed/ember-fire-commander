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
    assert set(body[0]) == {"id", "name", "area", "status", "severity", "evidenceScore", "conflictId", "withdraw", "lat", "lng"}


def test_incident_name_is_returned_and_old_incidents_have_none(client, monkeypatch, db):
    _as(monkeypatch)
    db.add("incidents", "inc_named", {
        "name": "Bengkalis, Riau · Pak Dedi · #3", "area": "Bengkalis, Riau", "status": "open", "severity": "smoke",
        "evidenceScore": 20, "conflictId": None, "withdraw": None, "lat": 1.48, "lng": 102.1,
    })
    listed = {i["id"]: i for i in client.get("/incidents", headers=AUTH).get_json()}
    assert listed["inc_named"]["name"] == "Bengkalis, Riau · Pak Dedi · #3"
    assert listed["inc_named"]["area"] == "Bengkalis, Riau"
    assert listed["inc_01"]["name"] is None
    assert listed["inc_01"]["area"] is None
    detail = client.get("/incidents/inc_named", headers=AUTH).get_json()
    assert detail["incident"]["name"] == "Bengkalis, Riau · Pak Dedi · #3"
    assert detail["incident"]["area"] == "Bengkalis, Riau"


def test_digest_carries_the_incident_name(client, monkeypatch, db):
    db.add("incidents", "inc_named", {
        "name": "Ketapang, Kalimantan Barat · Sari · #4", "area": "Ketapang, Kalimantan Barat", "status": "open", "severity": "smoke",
        "evidenceScore": 20, "conflictId": None, "withdraw": None, "lat": -1.83, "lng": 109.98,
    })
    db.add("tasks", "task_named", {
        "incidentId": "inc_named", "volunteerId": "uid_sari", "type": "verify",
        "status": "proposed", "instruction": None,
    })
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    digest = client.get("/digest", headers=AUTH).get_json()
    names = {i["id"]: i["name"] for i in digest["incidents"]}
    assert names["inc_named"] == "Ketapang, Kalimantan Barat · Sari · #4"
    areas = {i["id"]: i["area"] for i in digest["incidents"]}
    assert areas["inc_named"] == "Ketapang, Kalimantan Barat"


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
    assert set(body["incidents"][0]) == {"id", "name", "area", "status", "severity", "withdraw", "lat", "lng"}
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


# Read queries ------------------------------------------------------------------

def _obs(db, obs_id, volunteer):
    db.add("observations", obs_id, {
        "volunteerId": volunteer, "capturedAt": "2026-10-13T09:00:00Z",
        "receivedAt": "2026-10-13T09:00:02Z", "source": "chip", "lat": 1.482, "lng": 102.115,
        "accuracyM": 10, "chip": "api", "text": None, "severity": "smoke",
        "photoPath": None, "immutable": True,
    })


def _incident(db, incident_id, status="open", **extra):
    db.add("incidents", incident_id, dict({
        "status": status, "severity": "smoke", "evidenceScore": 30, "conflictId": None,
        "withdraw": None, "lat": 1.5, "lng": 102.1,
    }, **extra))


def _ids(client, path="/incidents"):
    return [i["id"] for i in client.get(path, headers=AUTH).get_json()]


@pytest.mark.parametrize("role,uid", [("supervisor", "uid_maya"), ("volunteer", "uid_sari")])
def test_no_read_streams_a_whole_collection(client, monkeypatch, db, role, uid):
    _as(monkeypatch, role=role, uid=uid)
    for path in ("/incidents", "/digest", "/incidents/inc_01"):
        assert client.get(path, headers=AUTH).status_code == 200
    assert db.queries, "the reads should have run queries"
    assert all(fields for _, fields in db.queries), db.queries


def test_incident_detail_reads_observations_in_one_batch(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert [o["id"] for o in body["observations"]] == ["obs_01", "obs_02"]
    assert db.batch_reads == [("observations", 2)]
    assert "observations" not in db.doc_reads


def test_incident_detail_skips_missing_observations(client, monkeypatch, db):
    _as(monkeypatch)
    db.data["conflicts"]["con_01"]["observationIds"] = ["obs_01", "obs_gone", "obs_02"]
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert [o["id"] for o in body["observations"]] == ["obs_01", "obs_02"]


def test_volunteer_detail_reads_observations_in_one_batch(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert [o["id"] for o in body["observations"]] == ["obs_01", "obs_02"]
    assert [r for r in db.batch_reads if r[0] == "observations"] == [("observations", 2)]
    assert "observations" not in db.doc_reads


def test_supervisor_list_filters_by_status_in_the_query(client, monkeypatch, db):
    _as(monkeypatch)
    _incident(db, "inc_open", "open")
    _incident(db, "inc_verified", "verified")
    assert _ids(client) == ["inc_01", "inc_open", "inc_verified"]
    assert ("incidents", ["status"]) in db.queries


def test_volunteer_linked_by_task_only(client, monkeypatch, db):
    _incident(db, "inc_task")
    db.add("tasks", "task_x", {
        "incidentId": "inc_task", "volunteerId": "uid_new", "type": "verify",
        "status": "proposed", "instruction": "Look",
    })
    _as(monkeypatch, role="volunteer", uid="uid_new")
    assert _ids(client) == ["inc_task"]
    assert client.get("/incidents/inc_task", headers=AUTH).status_code == 200
    assert client.get("/incidents/inc_01", headers=AUTH).status_code == 404


def test_volunteer_linked_by_observation_on_the_incident(client, monkeypatch, db):
    _obs(db, "obs_mine", "uid_new")
    _incident(db, "inc_obs", observationIds=["obs_mine", "obs_01"])
    _as(monkeypatch, role="volunteer", uid="uid_new")
    assert _ids(client) == ["inc_obs"]
    body = client.get("/incidents/inc_obs", headers=AUTH).get_json()
    assert [o["id"] for o in body["observations"]] == ["obs_mine", "obs_01"]


def test_volunteer_linked_through_a_conflict_only(client, monkeypatch, db):
    _obs(db, "obs_mine", "uid_new")
    _incident(db, "inc_con", "held", conflictId="con_x")
    db.add("conflicts", "con_x", {
        "incidentId": "inc_con", "observationIds": ["obs_mine"],
        "higherSeverity": "smoke", "status": "open", "dispatchHeld": True,
    })
    _as(monkeypatch, role="volunteer", uid="uid_new")
    assert _ids(client) == ["inc_con"]
    assert client.get("/incidents/inc_con", headers=AUTH).status_code == 200


def test_volunteer_linked_by_withdraw_only(client, monkeypatch, db):
    _incident(db, "inc_wd", withdraw={"active": True, "instruction": "Go", "reasons": [], "volunteerIds": ["uid_new"]})
    _as(monkeypatch, role="volunteer", uid="uid_new")
    assert _ids(client) == ["inc_wd"]
    assert client.get("/incidents/inc_wd", headers=AUTH).status_code == 200


def test_volunteer_still_sees_a_linked_extinguished_incident(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    db.data["incidents"]["inc_old"]["observationIds"] = ["obs_01"]
    assert _ids(client) == ["inc_01", "inc_old"]


def test_incident_is_listed_once_when_linked_several_ways(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02"]
    _as(monkeypatch, role="volunteer", uid="uid_sari")  # task, observation and conflict all point here
    assert _ids(client) == ["inc_01"]


def test_volunteer_with_many_observations_is_queried_in_chunks_of_thirty(client, monkeypatch, db):
    for n in range(65):
        _obs(db, f"obs_m{n:02d}", "uid_busy")
    _incident(db, "inc_last", observationIds=["obs_m64"])
    _incident(db, "inc_first", observationIds=["obs_m00"])
    _as(monkeypatch, role="volunteer", uid="uid_busy")
    assert _ids(client) == ["inc_first", "inc_last"]  # the fake rejects more than 30 values per query


def test_volunteer_with_no_observations_runs_no_array_queries(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_stranger")
    assert _ids(client) == []
    assert ("conflicts", ["observationIds"]) not in db.queries


def test_withdraw_checks_volunteers_with_one_batched_read(client, monkeypatch, db):
    _as(monkeypatch)
    response = client.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_sari", "uid_rizal"], "instruction": "Withdraw upwind.", "reasons": [],
    })
    assert response.status_code == 200
    assert "observations" not in db.doc_reads
    assert [r for r in db.batch_reads if r[0] == "observations"] == [("observations", 2)]
