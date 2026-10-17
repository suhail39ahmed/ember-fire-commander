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


def _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya"):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": uid, "name": name, "role": role},
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
    assert set(body[0]) == {
        "id", "name", "area", "status", "severity", "evidenceScore", "conflictId", "withdraw", "lat", "lng",
        "reportCount", "volunteerCount", "needsHelp", "verified", "verifiedBy",
    }


def test_a_volunteer_list_has_no_supervisor_counts(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.get("/incidents", headers=AUTH).get_json()
    assert body and all(set(i) == {"id", "name", "area", "status", "severity", "evidenceScore", "conflictId", "withdraw", "lat", "lng"} for i in body)


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


def test_supervisor_detail_has_reporter_names_and_evidence_factors(client, monkeypatch, db):
    db.data["observations"]["obs_01"]["volunteerName"] = "Sari"
    db.data["observations"]["obs_02"]["volunteerName"] = "   "
    db.data["incidents"]["inc_01"]["evidenceFactors"] = [
        {"factor": "severity", "points": 35, "detail": "highest reported severity is small_flame", "extra": "x"},
        {"factor": "conflict", "points": -20, "detail": "reports disagree"},
        "not a factor",
    ]
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    names = {o["id"]: o.get("volunteerName") for o in body["observations"]}
    assert names == {"obs_01": "Sari", "obs_02": None}
    assert "volunteerName" not in body["observations"][1]
    assert body["evidenceFactors"] == [
        {"factor": "severity", "points": 35, "detail": "highest reported severity is small_flame"},
        {"factor": "conflict", "points": -20, "detail": "reports disagree"},
    ]


def test_detail_without_stored_factors_has_an_empty_list(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert body["evidenceFactors"] == []
    assert all("volunteerName" not in o for o in body["observations"])


def test_volunteer_detail_has_incident_report_names_but_no_factors(client, monkeypatch, db):
    db.data["observations"]["obs_02"]["volunteerName"] = "Rizal"
    db.data["incidents"]["inc_01"]["evidenceFactors"] = [{"factor": "photo", "points": 10, "detail": "a photo"}]
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert "evidenceFactors" not in body
    assert next(o for o in body["observations"] if o["id"] == "obs_02")["volunteerName"] == "Rizal"


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
    assert set(body) == {"updatedAt", "incidents", "myTasks", "nearby", "myJoinRequests", "seasonStats"}
    assert body["updatedAt"].endswith("Z")
    assert set(body["incidents"][0]) == {"id", "name", "area", "status", "severity", "withdraw", "lat", "lng", "code", "placeName", "updatedAt", "closedAt", "reportCount", "myReportCount", "participantCount", "includesMe"}
    assert [t["id"] for t in body["myTasks"]] == ["task_investigate", "task_verify_sari"]


def test_supervisor_digest_has_no_tasks(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH).get_json()
    assert body["myTasks"] == []
    assert "nearby" not in body
    assert "seasonStats" not in body
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


def test_verify_closes_open_verify_tasks_for_thank_you(client, monkeypatch, db):
    """#140: conflict tasks get a thank-you, but earn no satellite-lead credit."""
    _as(monkeypatch)
    body = client.post("/incidents/inc_01/verify", headers=AUTH).get_json()
    assert body["incident"]["status"] == "verified"
    closed = db.data["tasks"]["task_verify_sari"]
    assert closed["closedAt"]
    assert closed["closedBy"] == "uid_maya"
    assert closed["closedByName"] == "Bu Maya"
    assert closed["closeMessage"]
    assert "closedAt" not in db.data["tasks"]["task_investigate"]

    _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari")
    digest = client.get("/digest", headers=AUTH).get_json()
    assert digest["seasonStats"] == {"checksDone": 0, "falseAlarmsCleared": 0}
    assert not db.data.get("leadChecks")
    verify = next(t for t in digest["myTasks"] if t["id"] == "task_verify_sari")
    assert verify["closedAt"]
    assert verify["closedByName"] == "Bu Maya"
    open_task = next(t for t in digest["myTasks"] if t["id"] == "task_investigate")
    assert "closedAt" not in open_task
    assert "closedBy" not in open_task


@pytest.mark.parametrize("author,text,checks,cleared", [
    ("uid_sari", "Bukan kebakaran: nothing here", 1, 1),
    ("uid_sari", "Flames at the canal", 1, 0),
    ("uid_rizal", "Bukan kebakaran: nothing here", 0, 0),
])
def test_satellite_credit_requires_the_task_owners_linked_report(client, monkeypatch, db, author, text, checks, cleared):
    db.add("leads", "lead_01", {"status": "pending"})
    db.data["incidents"]["inc_01"].update({
        "satelliteLeadId": "lead_01", "observationIds": ["obs_check"],
    })
    db.add("observations", "obs_check", {
        "id": "obs_check", "checkTaskId": "task_verify_sari", "volunteerId": author,
        "source": "photo", "text": text, "capturedAt": "2026-10-13T09:00:00Z",
    })
    _as(monkeypatch)
    assert client.post("/incidents/inc_01/verify", headers=AUTH).status_code == 200
    _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari")
    response = client.get("/digest", headers=AUTH)
    assert response.status_code == 200
    assert response.get_json()["seasonStats"] == {"checksDone": checks, "falseAlarmsCleared": cleared}
    if checks:
        check = db.data["leadChecks"]["lead_01__task_verify_sari"]
        assert check["volunteerId"] == "uid_sari"
        assert check["observationId"] == "obs_check"
    else:
        assert not db.data.get("leadChecks")


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
        "source": "supervisor",
        "sentAt": body["incident"]["withdraw"]["sentAt"],
        "safeVolunteerIds": [],
    }
    assert body["incident"]["withdraw"]["sentAt"].endswith("Z")
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
    assert [r for r in db.batch_reads if r[0] == "observations"] == [("observations", 2)]
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


# WITHDRAW: source, time sent, found safe -------------------------------------------

ACTIVE_WITHDRAW = {
    "active": True, "instruction": "Withdraw upwind. Do not engage.", "reasons": ["large flame reported"],
    "volunteerIds": ["uid_sari", "uid_rizal"], "source": "code", "sentAt": "2026-10-13T08:20:00Z",
    "safeVolunteerIds": [],
}


def test_resending_keeps_the_first_source_time_and_safe_list(client, monkeypatch, db):
    _as(monkeypatch)
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW, safeVolunteerIds=["uid_sari"])
    body = client.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_rizal"], "instruction": "Withdraw now.", "reasons": ["wind shift"],
    }).get_json()
    withdraw = body["incident"]["withdraw"]
    assert withdraw["source"] == "code"
    assert withdraw["sentAt"] == "2026-10-13T08:20:00Z"
    assert withdraw["safeVolunteerIds"] == ["uid_sari"]
    assert withdraw["instruction"] == "Withdraw now."


def test_mark_safe_is_audited_and_never_clears_the_withdraw(client, monkeypatch, db):
    _as(monkeypatch)
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    response = client.post("/incidents/inc_01/withdraw/safe", headers=AUTH, json={"volunteerId": "uid_sari"})
    body = response.get_json()
    assert response.status_code == 200
    assert body["incident"]["withdraw"]["safeVolunteerIds"] == ["uid_sari"]
    assert body["incident"]["withdraw"]["active"] is True
    record = db.data["audit"][body["auditId"]]
    assert (record["action"], record["actorId"], record["targetId"]) == ("withdraw.safe", "uid_maya", "inc_01")
    # Everyone safe still leaves the withdraw in force: only code can end it.
    client.post("/incidents/inc_01/withdraw/safe", headers=AUTH, json={"volunteerId": "uid_rizal"})
    assert db.data["incidents"]["inc_01"]["withdraw"]["active"] is True
    assert db.data["incidents"]["inc_01"]["withdraw"]["safeVolunteerIds"] == ["uid_sari", "uid_rizal"]
    assert not [t for t in db.data["tasks"].values() if t.get("type") == "withdraw"]


@pytest.mark.parametrize("withdraw,body,status", [
    (None, {"volunteerId": "uid_sari"}, 409),
    (ACTIVE_WITHDRAW, {"volunteerId": "uid_other"}, 400),
    (ACTIVE_WITHDRAW, {"volunteerId": ""}, 400),
    (ACTIVE_WITHDRAW, {}, 400),
    (dict(ACTIVE_WITHDRAW, safeVolunteerIds=["uid_sari"]), {"volunteerId": "uid_sari"}, 409),
])
def test_mark_safe_refusals_write_nothing(client, monkeypatch, db, withdraw, body, status):
    _as(monkeypatch)
    db.data["incidents"]["inc_01"]["withdraw"] = dict(withdraw) if withdraw else None
    before = _audit(db)
    response = client.post("/incidents/inc_01/withdraw/safe", headers=AUTH, json=body)
    assert response.status_code == status
    assert _audit(db) == before


def test_mark_safe_unknown_incident_and_volunteer_role(client, monkeypatch, db):
    _as(monkeypatch)
    assert client.post("/incidents/nope/withdraw/safe", headers=AUTH, json={"volunteerId": "uid_sari"}).status_code == 404
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    assert client.post("/incidents/inc_01/withdraw/safe", headers=AUTH, json={"volunteerId": "uid_sari"}).status_code == 403
    assert db.data["incidents"]["inc_01"]["withdraw"]["safeVolunteerIds"] == []


def test_supervisor_read_carries_phones_for_the_withdrawn_volunteers_only(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    db.add("volunteers", "uid_sari", {"phone": " +62 812 0000 111 ", "fcmTokens": ["secret"]})
    db.add("volunteers", "uid_rizal", {"phone": "  "})
    db.add("volunteers", "uid_ayu", {"phone": "+62 812 0000 333"})
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert body["volunteerPhones"] == {"uid_sari": "+62 812 0000 111"}
    assert "secret" not in str(body)
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert "volunteerPhones" not in client.get("/incidents/inc_01", headers=AUTH).get_json()


def test_no_phones_without_an_active_withdraw(client, monkeypatch, db):
    db.add("volunteers", "uid_sari", {"phone": "+62 812 0000 111"})
    _as(monkeypatch)
    assert "volunteerPhones" not in client.get("/incidents/inc_01", headers=AUTH).get_json()


def test_self_safe_answers_appear_in_the_supervisor_withdraw_read(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    db.add("withdraw_answers", "inc_01__uid_sari", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "state": "safe", "at": "2026-10-13T08:21:00Z",
    })
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert body["incident"]["withdraw"]["selfSafeVolunteerIds"] == ["uid_sari"]


def test_stuck_or_other_answers_are_not_counted_as_safe(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    db.add("withdraw_answers", "inc_01__uid_sari", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "state": "stuck", "at": "2026-10-13T08:21:00Z",
    })
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert "selfSafeVolunteerIds" not in body["incident"]["withdraw"]


def test_answers_from_non_withdraw_volunteers_are_excluded(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    db.add("withdraw_answers", "inc_01__uid_ayu", {
        "incidentId": "inc_01", "volunteerId": "uid_ayu", "state": "safe", "at": "2026-10-13T08:21:00Z",
    })
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert "selfSafeVolunteerIds" not in body["incident"]["withdraw"]


def test_self_safe_answers_do_not_appear_on_volunteer_read(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    db.add("withdraw_answers", "inc_01__uid_sari", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "state": "safe", "at": "2026-10-13T08:21:00Z",
    })
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    withdraw = body["incident"]["withdraw"]
    assert "selfSafeVolunteerIds" not in withdraw


def test_self_safe_marks_the_volunteer_safe_on_the_card(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW)
    db.add("withdraw_answers", "inc_01__uid_sari", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "state": "safe", "at": "2026-10-13T08:21:00Z",
    })
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    sari_card = next(c for c in body["volunteers"] if c["volunteerId"] == "uid_sari")
    assert sari_card["withdraw"]["safe"] is True
    rizal_card = next(c for c in body["volunteers"] if c["volunteerId"] == "uid_rizal")
    assert rizal_card["withdraw"]["safe"] is False


# Edit: the editor's name ------------------------------------------------------------

def test_edit_returns_the_editors_name_when_the_token_has_one(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.post("/tasks/task_verify_sari/edit", headers=AUTH, json={"instruction": "Check the west ditch"}).get_json()
    assert body["editedBy"] == "Bu Maya"
    assert set(body) == {"task", "auditId", "editedBy"}
    assert body["task"]["instruction"] == "Check the west ditch"
    assert db.data["audit"][body["auditId"]]["action"] == "task.edit"


def test_edit_has_no_editor_name_when_the_token_has_none(client, monkeypatch, db):
    _as(monkeypatch, name="")
    body = client.post("/tasks/task_verify_sari/edit", headers=AUTH, json={"instruction": "Check the west ditch"}).get_json()
    assert "editedBy" not in body


# Delivery: sent time, heard, resend ---------------------------------------------------

def test_approving_a_task_is_the_send_and_records_when(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.post("/tasks/task_verify_sari/approve", headers=AUTH).get_json()
    task = body["task"]
    assert task["status"] == "approved"
    assert task["sentAt"].endswith("Z") and task["sendCount"] == 1
    assert task["heardAt"] is None
    assert task["resendAt"] is not None and task["resendAt"] > task["sentAt"]


def test_a_task_that_was_never_sent_has_no_receipt_fields_set(client, monkeypatch, db):
    _as(monkeypatch)
    task = client.get("/incidents/inc_01", headers=AUTH).get_json()["tasks"][0]
    assert (task["sentAt"], task["heardAt"], task["sendCount"], task["resendAt"]) == (None, None, None, None)


def test_the_withdraw_route_stamps_the_send_time(client, monkeypatch, db):
    _as(monkeypatch)
    client.post("/incidents/inc_01/withdraw", headers=AUTH, json={"volunteerIds": ["uid_sari"], "instruction": "Withdraw"})
    task = next(t for t in db.data["tasks"].values() if t["type"] == "withdraw")
    assert task["sentAt"].endswith("Z") and task["sendCount"] == 1


def _sent(db, task_id="task_sent", volunteer="uid_sari", **extra):
    db.add("tasks", task_id, {
        "incidentId": "inc_01", "volunteerId": volunteer, "type": "verify", "status": "approved",
        "instruction": "Check the west ditch", "sentAt": "2026-10-13T08:20:00.000Z", "sendCount": 1, **extra,
    })


def test_the_volunteer_records_that_they_heard_it_once(client, monkeypatch, db):
    _sent(db)
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.post("/tasks/task_sent/heard", headers=AUTH).get_json()
    assert body["task"]["heardAt"].endswith("Z")
    assert body["task"]["resendAt"] is None
    assert db.data["audit"][body["auditId"]]["action"] == "task.heard"
    assert db.data["audit"][body["auditId"]]["actorId"] == "uid_sari"
    first = db.data["tasks"]["task_sent"]["heardAt"]
    again = client.post("/tasks/task_sent/heard", headers=AUTH).get_json()
    assert again["auditId"] is None
    assert db.data["tasks"]["task_sent"]["heardAt"] == first
    assert len(_audit(db)) == 1


def test_heard_is_for_the_volunteer_who_got_it_and_only_for_a_sent_task(client, monkeypatch, db):
    _sent(db)
    _as(monkeypatch, role="volunteer", uid="uid_rizal")
    assert client.post("/tasks/task_sent/heard", headers=AUTH).status_code == 404
    _as(monkeypatch)
    assert client.post("/tasks/task_sent/heard", headers=AUTH).status_code == 403
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert client.post("/tasks/task_verify_sari/heard", headers=AUTH).status_code == 409
    assert client.post("/tasks/nope/heard", headers=AUTH).status_code == 404
    assert "heardAt" not in db.data["tasks"]["task_sent"]
    assert _audit(db) == []


def test_resend_records_another_attempt_and_an_audit_entry(client, monkeypatch, db):
    pushed = []
    monkeypatch.setattr("incidents.routes.deliver_task", lambda task: pushed.append(task["id"]))
    _sent(db)
    _as(monkeypatch)
    body = client.post("/tasks/task_sent/resend", headers=AUTH).get_json()
    assert body["task"]["sendCount"] == 2
    assert body["task"]["sentAt"] > "2026-10-13T08:20:00.000Z"
    assert db.data["audit"][body["auditId"]]["action"] == "task.resend"
    assert pushed == ["task_sent"]


@pytest.mark.parametrize("extra,status", [
    ({"heardAt": "2026-10-13T08:20:30.000Z"}, 409),
    ({"status": "proposed"}, 409),
])
def test_resend_refusals_write_nothing(client, monkeypatch, db, extra, status):
    pushed = []
    monkeypatch.setattr("incidents.routes.deliver_task", lambda task: pushed.append(task["id"]))
    _sent(db, **extra)
    _as(monkeypatch)
    assert client.post("/tasks/task_sent/resend", headers=AUTH).status_code == status
    assert db.data["tasks"]["task_sent"]["sendCount"] == 1
    assert _audit(db) == [] and pushed == []


def test_a_volunteer_cannot_resend_and_an_unknown_task_is_404(client, monkeypatch, db):
    _sent(db)
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert client.post("/tasks/task_sent/resend", headers=AUTH).status_code == 403
    _as(monkeypatch)
    assert client.post("/tasks/nope/resend", headers=AUTH).status_code == 404


def test_resend_at_is_a_minute_after_the_send_and_only_while_unheard():
    from incidents import rules
    waiting = rules.with_receipt({"status": "approved", "sentAt": "2026-10-13T08:20:00.000Z", "heardAt": None})
    assert waiting["resendAt"] == "2026-10-13T08:21:00.000Z"
    assert rules.with_receipt({"status": "approved", "sentAt": "2026-10-13T08:20:00.000Z", "heardAt": "2026-10-13T08:20:10Z"})["resendAt"] is None
    assert rules.with_receipt({"status": "proposed", "sentAt": None})["resendAt"] is None
    assert rules.with_receipt({"status": "approved", "sentAt": "garbage"})["resendAt"] is None


# Incident detail extras: volunteer cards, timeline, summary ---------------------------

EXTRA_KEYS = ("volunteers", "timeline", "summary")


def _third_reporter(db):
    """A volunteer whose report is on the incident but not on either side of the conflict."""
    db.add("observations", "obs_03", {
        "volunteerId": "uid_ayu", "volunteerName": "Ayu", "capturedAt": "2026-10-13T08:14:00Z",
        "receivedAt": "2026-10-13T08:14:02Z", "source": "text", "lat": 1.483, "lng": 102.115,
        "accuracyM": 30, "chip": None, "text": "Smoke near the canal", "severity": "unknown",
        "photoPath": None, "immutable": True,
    })
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02", "obs_03"]


def _card(body, uid):
    return next(c for c in body["volunteers"] if c["volunteerId"] == uid)


def test_supervisor_cards_cover_every_report_not_only_the_conflict_pair(client, monkeypatch, db):
    _third_reporter(db)
    db.data["observations"]["obs_01"]["volunteerName"] = "Sari"
    db.add("volunteers", "uid_rizal", {"displayName": "Rizal", "phone": "+62 812 0000 222", "fcmTokens": ["secret"]})
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert [o["id"] for o in body["observations"]] == ["obs_01", "obs_02"]  # unchanged
    assert [c["volunteerId"] for c in body["volunteers"]] == ["uid_ayu", "uid_rizal", "uid_sari"]
    ayu = _card(body, "uid_ayu")
    assert (ayu["name"], ayu["reportCount"], ayu["lastSeverity"], ayu["lastLat"], ayu["lastLng"]) == ("Ayu", 1, "unknown", 1.483, 102.115)
    assert ayu["lastReportAt"] == ayu["firstReportAt"] == "2026-10-13T08:14:00Z"
    assert ayu["lastAccuracyM"] == 30
    assert ayu["distanceM"] == 111
    assert ayu["withdraw"] is None
    # A name falls back to volunteers/{uid}.displayName, and is None when neither exists.
    assert _card(body, "uid_rizal")["name"] == "Rizal"
    assert _card(body, "uid_sari")["name"] == "Sari"
    assert _card(body, "uid_sari")["distanceM"] == 0
    # No phone number and no device token ever ride on a card (phones stay in volunteerPhones).
    assert "secret" not in str(body) and "812" not in str(body)
    assert "volunteerPhones" not in body


def test_card_for_a_volunteer_with_only_a_task_has_no_report_fields(client, monkeypatch, db):
    db.add("tasks", "task_new", {
        "incidentId": "inc_01", "volunteerId": "uid_new", "type": "verify", "status": "proposed", "instruction": "Look",
    })
    _as(monkeypatch)
    card = _card(client.get("/incidents/inc_01", headers=AUTH).get_json(), "uid_new")
    assert card["name"] is None and card["reportCount"] == 0
    for key in ("firstReportAt", "lastReportAt", "lastSeverity", "lastLat", "lastLng", "lastAccuracyM", "distanceM", "withdraw"):
        assert card[key] is None


def test_an_incident_with_nothing_stored_has_empty_extras(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/incidents/inc_old", headers=AUTH).get_json()
    assert body["volunteers"] == [] and body["timeline"] == [] and body["summary"] is None
    assert body["observations"] == [] and body["tasks"] == []


def _withdrawn(db, **extra):
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW, **extra)
    db.add("tasks", "task_wd_sari", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "withdraw", "status": "approved",
        "instruction": "Withdraw upwind. Do not engage.", "sentAt": "2026-10-13T08:20:00.000Z",
        "heardAt": "2026-10-13T08:20:09.000Z", "sendCount": 1,
    })
    db.add("tasks", "task_wd_rizal", {
        "incidentId": "inc_01", "volunteerId": "uid_rizal", "type": "withdraw", "status": "approved",
        "instruction": "Withdraw upwind. Do not engage.", "sentAt": "2026-10-13T08:20:00.000Z",
        "heardAt": None, "sendCount": 2,
    })
    db.add("notificationAttempts", "att_1", {"kind": "withdraw", "targetId": "task_wd_sari", "volunteerId": "uid_sari", "result": "failed", "attempts": 3, "at": "2026-10-13T08:20:01Z"})
    db.add("notificationAttempts", "att_2", {"kind": "withdraw", "targetId": "task_wd_sari", "volunteerId": "uid_sari", "result": "sent", "attempts": 1, "at": "2026-10-13T08:21:01Z"})
    db.add("notificationAttempts", "att_3", {"kind": "withdraw", "targetId": "task_wd_rizal", "volunteerId": "uid_rizal", "result": "skipped", "attempts": 0, "at": "2026-10-13T08:20:01Z"})


def test_withdrawn_cards_carry_what_was_heard_and_delivered(client, monkeypatch, db):
    _withdrawn(db)
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    sari, rizal = _card(body, "uid_sari")["withdraw"], _card(body, "uid_rizal")["withdraw"]
    assert sari == {
        "sentAt": "2026-10-13T08:20:00.000Z", "heardAt": "2026-10-13T08:20:09.000Z", "sendCount": 1,
        "delivery": "sent", "safe": False, "safeAt": None, "safeBy": None,
    }
    assert (rizal["heardAt"], rizal["sendCount"], rizal["delivery"]) == (None, 2, "skipped")


def test_marking_safe_records_who_and_when_for_the_card_and_the_timeline(client, monkeypatch, db):
    _withdrawn(db)
    db.add("volunteers", "uid_maya", {"displayName": "Bu Maya"})
    _as(monkeypatch)
    done = client.post("/incidents/inc_01/withdraw/safe", headers=AUTH, json={"volunteerId": "uid_sari"}).get_json()
    assert db.data["audit"][done["auditId"]]["subjectId"] == "uid_sari"
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    safe = _card(body, "uid_sari")["withdraw"]
    assert safe["safe"] is True
    assert safe["safeAt"] == db.data["audit"][done["auditId"]]["at"]
    assert safe["safeBy"] == {"id": "uid_maya", "name": "Bu Maya"}
    assert _card(body, "uid_rizal")["withdraw"]["safe"] is False
    row = next(e for e in body["timeline"] if e["action"] == "withdraw.safe")
    assert (row["volunteerId"], row["actorId"], row["actorName"], row["kind"]) == ("uid_sari", "uid_maya", "Bu Maya", "audit")
    assert "subjectId" not in str(client.get("/audit", headers=AUTH).get_json())


def test_a_safe_mark_from_before_the_audit_row_carried_the_volunteer_has_no_time(client, monkeypatch, db):
    _withdrawn(db, safeVolunteerIds=["uid_sari"])
    _as(monkeypatch)
    safe = _card(client.get("/incidents/inc_01", headers=AUTH).get_json(), "uid_sari")["withdraw"]
    assert safe["safe"] is True and safe["safeAt"] is None and safe["safeBy"] is None


def test_only_the_safe_mark_audit_row_carries_a_subject(client, monkeypatch, db):
    _as(monkeypatch)
    client.post("/incidents/inc_01/verify", headers=AUTH)
    client.post("/tasks/task_verify_sari/reject", headers=AUTH)
    assert all("subjectId" not in row for row in _audit(db))


def test_timeline_merges_reports_and_audit_rows_oldest_first(client, monkeypatch, db):
    _third_reporter(db)
    db.add("audit", "aud_a", {"id": "aud_a", "actorId": "code", "action": "task.withdraw", "targetId": "inc_01", "at": "2026-10-13T08:20:00.000Z"})
    db.add("audit", "aud_b", {"id": "aud_b", "actorId": "uid_maya", "action": "task.approve", "targetId": "task_verify_rizal", "at": "2026-10-13T08:25:00.000Z"})
    db.add("audit", "aud_c", {"id": "aud_c", "actorId": "uid_maya", "action": "incident.verify", "targetId": "inc_01", "at": "2026-10-13T08:30:00.000Z"})
    db.add("audit", "aud_obs", {"id": "aud_obs", "actorId": "uid_sari", "action": "observation.create", "targetId": "obs_01", "at": "2026-10-13T08:12:04.000Z"})
    db.add("audit", "aud_other", {"id": "aud_other", "actorId": "uid_maya", "action": "incident.verify", "targetId": "inc_old", "at": "2026-10-13T08:31:00.000Z"})
    db.add("volunteers", "uid_maya", {"displayName": "Bu Maya"})
    _as(monkeypatch)
    timeline = client.get("/incidents/inc_01", headers=AUTH).get_json()["timeline"]
    assert [e["id"] for e in timeline] == ["obs_01", "obs_02", "obs_03", "aud_a", "aud_b", "aud_c"]
    assert [e["kind"] for e in timeline] == ["report"] * 3 + ["audit"] * 3
    code, approve, verify = timeline[3:]
    assert (code["actorId"], code["actorName"], code["action"]) == ("code", None, "task.withdraw")
    assert (approve["actorName"], approve["taskId"], approve["volunteerId"]) == ("Bu Maya", "task_verify_rizal", "uid_rizal")
    assert (verify["taskId"], verify["volunteerId"]) == (None, None)
    report = timeline[2]
    assert (report["volunteerId"], report["actorName"], report["text"], report["severity"], report["source"]) == (
        "uid_ayu", "Ayu", "Smoke near the canal", "unknown", "text")


def test_timeline_keeps_only_the_newest_hundred_entries(client, monkeypatch, db):
    for i in range(120):
        db.add("audit", f"aud_{i:03}", {"id": f"aud_{i:03}", "actorId": "code", "action": "task.withdraw", "targetId": "inc_01", "at": f"2026-10-13T09:{i // 60:02}:{i % 60:02}.000Z"})
    _as(monkeypatch)
    timeline = client.get("/incidents/inc_01", headers=AUTH).get_json()["timeline"]
    assert len(timeline) == 100
    assert timeline[-1]["id"] == "aud_119"
    assert timeline[0]["id"] == "aud_020"  # 122 entries: the two older reports and the 20 oldest audit rows drop out


def test_summary_is_returned_when_stored_and_left_out_when_blank(client, monkeypatch, db):
    db.add("incident_summaries", "inc_01", {
        "id": "inc_01", "incidentId": "inc_01", "english": "Two reports, they disagree.", "bahasa": "Dua laporan, berbeda.",
        "source": "template", "advisory": True, "model": None, "facts": {"reportCount": 2}, "at": "2026-10-13T08:15:00Z",
    })
    _as(monkeypatch)
    summary = client.get("/incidents/inc_01", headers=AUTH).get_json()["summary"]
    assert summary == {"english": "Two reports, they disagree.", "bahasa": "Dua laporan, berbeda.", "source": "template", "at": "2026-10-13T08:15:00Z"}
    db.data["incident_summaries"]["inc_01"].update(english="  ", bahasa=None)
    assert client.get("/incidents/inc_01", headers=AUTH).get_json()["summary"] is None


def test_a_volunteer_read_has_none_of_the_supervisor_extras(client, monkeypatch, db):
    _third_reporter(db)
    _withdrawn(db)
    db.add("incident_summaries", "inc_01", {"english": "Two reports.", "bahasa": "Dua laporan."})
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert not [key for key in EXTRA_KEYS + ("volunteerPhones",) if key in body]
    assert "Two reports" not in str(body)
    assert any(o.get("volunteerName") == "Ayu" for o in body["observations"])
    # A volunteer who is not on the incident still gets a 404, not the extras.
    _as(monkeypatch, role="volunteer", uid="uid_other")
    assert client.get("/incidents/inc_01", headers=AUTH).status_code == 404


def test_extras_read_in_batches_not_per_volunteer(client, monkeypatch, db):
    _third_reporter(db)
    _withdrawn(db)
    _as(monkeypatch)
    assert client.get("/incidents/inc_01", headers=AUTH).status_code == 200
    assert [r for r in db.batch_reads if r[0] == "observations"] == [("observations", 3)]
    assert len([r for r in db.batch_reads if r[0] == "volunteers"]) <= 2
    assert "volunteers" not in db.doc_reads and "observations" not in db.doc_reads
    assert all(fields for _, fields in db.queries)


# Profile: last heard, device ----------------------------------------------------------

def test_card_profile_has_last_heard_and_whether_a_device_is_stored(client, monkeypatch, db):
    db.data["tasks"]["task_verify_sari"].update(status="approved", sentAt="2026-10-13T08:30:00Z", heardAt="2026-10-13T08:31:00Z")
    db.add("volunteers", "uid_sari", {"fcmTokens": ["secret-token", "  "], "phone": "+62 812 0000 111"})
    db.add("volunteers", "uid_rizal", {"fcmTokens": [" ", 7]})
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    sari, rizal = _card(body, "uid_sari"), _card(body, "uid_rizal")
    assert sari["lastHeardAt"] == "2026-10-13T08:31:00Z"  # a later task receipt beats the report that arrived at 08:12:04
    assert rizal["lastHeardAt"] == "2026-10-13T08:13:03Z"  # only their newest report arriving
    assert (sari["pushReady"], rizal["pushReady"]) == (True, False)
    assert "secret-token" not in str(body) and "812" not in str(body)


def test_card_without_a_report_or_receipt_has_no_last_heard_and_no_device(client, monkeypatch, db):
    db.add("tasks", "task_new", {"incidentId": "inc_01", "volunteerId": "uid_new", "type": "verify", "status": "proposed", "instruction": "Look"})
    _as(monkeypatch)
    card = _card(client.get("/incidents/inc_01", headers=AUTH).get_json(), "uid_new")
    assert card["lastHeardAt"] is None and card["pushReady"] is False


# Send one instruction to one volunteer -------------------------------------------------

def _instruct(client, volunteer="uid_sari", body=None, incident="inc_01"):
    return client.post(f"/incidents/{incident}/volunteers/{volunteer}/instruct", headers=AUTH,
                       json={"instruction": "  Move to the east road and report.  "} if body is None else body)


def test_instruct_creates_a_sent_task_for_one_volunteer_with_an_audit_row_and_a_push(client, monkeypatch, db):
    pushed = []
    monkeypatch.setattr("incidents.routes.deliver_task", lambda task: pushed.append(task))
    _as(monkeypatch)
    before = set(db.data["tasks"])
    response = _instruct(client)
    body = response.get_json()
    assert response.status_code == 201
    (new_id,) = set(db.data["tasks"]) - before
    task = db.data["tasks"][new_id]
    assert task == {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "instruct", "status": "approved",
        "instruction": "Move to the east road and report.", "sentAt": task["sentAt"], "sendCount": 1,
    }
    assert body["task"]["id"] == new_id and body["task"]["type"] == "instruct"
    assert body["task"]["heardAt"] is None and body["task"]["resendAt"] is not None
    audit = db.data["audit"][body["auditId"]]
    assert (audit["action"], audit["actorId"], audit["targetId"]) == ("task.instruct", "uid_maya", new_id)
    assert [p["id"] for p in pushed] == [new_id]
    # The incident itself is untouched: status, severity, conflict and dispatch hold stay as they were.
    assert db.data["incidents"]["inc_01"]["status"] == "held" and db.data["incidents"]["inc_01"]["withdraw"] is None


def test_instruct_is_allowed_while_a_conflict_is_open_and_shows_in_the_timeline(client, monkeypatch, db):
    monkeypatch.setattr("incidents.routes.deliver_task", lambda task: None)
    _as(monkeypatch)
    assert db.data["conflicts"]["con_01"]["status"] == "open"
    assert _instruct(client).status_code == 201
    row = next(e for e in client.get("/incidents/inc_01", headers=AUTH).get_json()["timeline"] if e["action"] == "task.instruct")
    assert (row["volunteerId"], row["actorName"] or "", row["kind"]) == ("uid_sari", "Bu Maya", "audit")
    assert "Instruction sent to one volunteer" in str(client.get("/audit", headers=AUTH).get_json())


def test_a_push_failure_does_not_undo_the_instruction(client, monkeypatch, db):
    def boom(task):
        raise RuntimeError("fcm down")

    monkeypatch.setattr("incidents.routes.deliver_task", boom)
    _as(monkeypatch)
    assert _instruct(client).status_code == 201
    assert [a["action"] for a in _audit(db)] == ["task.instruct"]


@pytest.mark.parametrize("body,field", [
    ({}, "instruction"), ({"instruction": "   "}, "instruction"), ({"instruction": 5}, "instruction"),
    ({"instruction": "x" * 501}, "instruction"),
])
def test_instruct_refuses_a_bad_instruction_and_writes_nothing(client, monkeypatch, db, body, field):
    _as(monkeypatch)
    tasks, audits = dict(db.data["tasks"]), _audit(db)
    response = _instruct(client, body=body)
    assert response.status_code == 400 and field in response.get_json()["error"]["fields"]
    assert db.data["tasks"] == tasks and _audit(db) == audits


def test_instruct_refusals_unknown_incident_unknown_volunteer_extinguished(client, monkeypatch, db):
    _as(monkeypatch)
    assert _instruct(client, incident="nope").status_code == 404
    unknown = _instruct(client, volunteer="uid_stranger")
    assert unknown.status_code == 400 and "volunteerId" in unknown.get_json()["error"]["fields"]
    db.data["incidents"]["inc_01"]["status"] = "extinguished"
    assert _instruct(client).status_code == 409
    assert not [t for t in db.data["tasks"].values() if t["type"] == "instruct"]
    assert _audit(db) == []


def test_instruct_cannot_be_used_on_a_volunteer_under_an_active_withdraw(client, monkeypatch, db):
    monkeypatch.setattr("incidents.routes.deliver_task", lambda task: None)
    db.data["incidents"]["inc_01"]["withdraw"] = dict(ACTIVE_WITHDRAW, safeVolunteerIds=["uid_rizal"])
    _as(monkeypatch)
    refused = _instruct(client, volunteer="uid_sari")
    assert refused.status_code == 409 and refused.get_json()["error"]["code"] == "conflict"
    assert _audit(db) == []
    # Marked safe by a supervisor: the volunteer can be instructed again. The withdraw itself is untouched.
    assert _instruct(client, volunteer="uid_rizal").status_code == 201
    assert db.data["incidents"]["inc_01"]["withdraw"]["active"] is True


def test_a_volunteer_cannot_send_an_instruction(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert _instruct(client).status_code == 403
    assert not [t for t in db.data["tasks"].values() if t["type"] == "instruct"] and _audit(db) == []


def test_the_volunteer_sees_the_instruction_in_their_digest(client, monkeypatch, db):
    monkeypatch.setattr("incidents.routes.deliver_task", lambda task: None)
    _as(monkeypatch)
    _instruct(client)
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    mine = [t for t in client.get("/digest", headers=AUTH).get_json()["myTasks"] if t["type"] == "instruct"]
    assert [t["instruction"] for t in mine] == ["Move to the east road and report."]


# Photo read ------------------------------------------------------------------------------

PHOTO = "photos/uid_sari/20261013/" + "a" * 32 + ".jpg"


def _photo_db(db):
    db.data["observations"]["obs_01"].update(source="photo", photoPath=PHOTO)
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02"]


def test_a_supervisor_gets_a_short_lived_read_url_for_a_photo_report(client, monkeypatch, db):
    _photo_db(db)
    calls = []
    monkeypatch.setattr("incidents.routes.signing.sign_get_url", lambda bucket, path, ttl: calls.append((bucket, path, ttl)) or "https://storage.googleapis.com/signed?X-Goog-Signature=s")
    _as(monkeypatch)
    response = client.get("/incidents/inc_01/photos/obs_01", headers=AUTH)
    body = response.get_json()
    assert response.status_code == 200
    assert calls == [("ember-fire-commander-ember-photos", PHOTO, 300)]
    assert body["url"].startswith("https://storage.googleapis.com/") and body["expiresAt"].endswith("Z")
    assert response.headers["Cache-Control"] == "no-store"
    assert PHOTO not in str(body.get("expiresAt"))


def test_a_photo_in_a_conflict_is_readable_even_when_the_incident_list_lacks_it(client, monkeypatch, db):
    db.data["observations"]["obs_02"].update(source="photo", photoPath="photos/uid_rizal/20261013/" + "b" * 32 + ".webp")
    monkeypatch.setattr("incidents.routes.signing.sign_get_url", lambda bucket, path, ttl: "https://storage.googleapis.com/signed")
    _as(monkeypatch)
    assert client.get("/incidents/inc_01/photos/obs_02", headers=AUTH).status_code == 200


def test_a_volunteer_cannot_read_incident_photos(client, monkeypatch, db):
    _photo_db(db)
    monkeypatch.setattr("incidents.routes.signing.sign_get_url", lambda *a: pytest.fail("must not sign"))
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert client.get("/incidents/inc_01/photos/obs_01", headers=AUTH).status_code == 403


@pytest.mark.parametrize("incident,observation,patch", [
    ("nope", "obs_01", None),                       # unknown incident
    ("inc_01", "obs_gone", None),                   # unknown observation
    ("inc_old", "obs_01", None),                    # observation is not on this incident
    ("inc_01", "obs_02", None),                     # a report with no photo
    ("inc_01", "obs_01", "photos/uid_rizal/20261013/" + "a" * 32 + ".jpg"),  # path owned by someone else
    ("inc_01", "obs_01", "https://evil.example/x.jpg"),                      # not an object path
    ("inc_01", "obs_01", "photos/uid_sari/../uid_rizal/x.jpg"),
])
def test_photo_read_is_refused_for_anything_that_is_not_a_stored_photo_of_this_incident(client, monkeypatch, db, incident, observation, patch):
    _photo_db(db)
    if patch:
        db.data["observations"]["obs_01"]["photoPath"] = patch
    monkeypatch.setattr("incidents.routes.signing.sign_get_url", lambda *a: pytest.fail("must not sign"))
    _as(monkeypatch)
    response = client.get(f"/incidents/{incident}/photos/{observation}", headers=AUTH)
    assert response.status_code == 404 and response.get_json()["error"]["code"] == "not_found"


def test_photo_read_says_unavailable_when_signing_fails(client, monkeypatch, db):
    _photo_db(db)

    def boom(*a):
        raise RuntimeError("signBlob denied")

    monkeypatch.setattr("incidents.routes.signing.sign_get_url", boom)
    _as(monkeypatch)
    response = client.get("/incidents/inc_01/photos/obs_01", headers=AUTH)
    assert response.status_code == 503 and response.get_json()["error"]["code"] == "unavailable"
    assert "signBlob" not in response.get_data(as_text=True)


# Reports disagree (#95) and agency in charge (#105): supervisor-only context --------------------------------

def _conflict_audit(db):
    rows = {
        "aud_ok1": ("uid_maya", "task.approve", "task_verify_sari", "2026-10-13T08:20:00.000Z"),
        "aud_ok2": ("uid_maya", "task.reject", "task_investigate", "2026-10-13T08:21:00.000Z"),
        "aud_ok3": ("uid_maya", "incident.verify", "inc_01", "2026-10-13T08:30:00.000Z"),
        "aud_heard": ("uid_sari", "task.heard", "task_verify_sari", "2026-10-13T08:22:00.000Z"),
        # Not about the disagreement: a withdraw, a re-ignition row, another incident, and a report received.
        "aud_wd": ("code", "task.withdraw", "inc_01", "2026-10-13T08:19:00.000Z"),
        "aud_safe": ("uid_maya", "withdraw.safe", "inc_01", "2026-10-13T08:23:00.000Z"),
        "aud_other": ("uid_maya", "incident.verify", "inc_old", "2026-10-13T08:24:00.000Z"),
        "aud_obs": ("uid_sari", "observation.create", "obs_01", "2026-10-13T08:12:04.000Z"),
    }
    for audit_id, (actor, action, target, at) in rows.items():
        db.add("audit", audit_id, {"id": audit_id, "actorId": actor, "action": action, "targetId": target, "at": at})
    db.add("volunteers", "uid_maya", {"displayName": "Bu Maya"})


def test_supervisor_conflict_context_lists_reports_on_neither_side_and_the_conflict_audit_rows(client, monkeypatch, db):
    _third_reporter(db)
    _conflict_audit(db)
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert [o["id"] for o in body["observations"]] == ["obs_01", "obs_02"]  # still only the two sides
    context = body["conflictContext"]
    assert [o["id"] for o in context["otherObservations"]] == ["obs_03"]
    other = context["otherObservations"][0]
    assert (other["volunteerName"], other["severity"], other["lat"], other["accuracyM"], other["text"]) == ("Ayu", "unknown", 1.483, 30, "Smoke near the canal")
    assert set(other) == {"id", "volunteerId", "capturedAt", "receivedAt", "source", "lat", "lng", "accuracyM", "chip", "text", "severity", "photoPath", "immutable", "volunteerName"}
    assert [e["id"] for e in context["audit"]] == ["aud_ok1", "aud_ok2", "aud_heard", "aud_ok3"]
    approve, reject, heard, verify = context["audit"]
    assert (approve["kind"], approve["actorName"], approve["taskId"], approve["volunteerId"]) == ("audit", "Bu Maya", "task_verify_sari", "uid_sari")
    assert (reject["action"], reject["taskId"]) == ("task.reject", "task_investigate")
    assert (heard["actorId"], heard["action"]) == ("uid_sari", "task.heard")
    assert (verify["action"], verify["taskId"], verify["volunteerId"]) == ("incident.verify", None, None)
    # The timeline is unchanged by the new key.
    assert "aud_wd" in [e["id"] for e in body["timeline"]]


def test_conflict_context_is_empty_lists_when_a_disagreement_has_nothing_else_stored(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    context = body["conflictContext"]
    assert (context["otherObservations"], context["audit"]) == ([], [])
    # The two sides are still every report this incident has, oldest first.
    assert [o["id"] for o in context["allObservations"]] == ["obs_01", "obs_02"]
    assert body["evidenceFactors"] == []  # only what fusion stored: no wind or satellite factor is invented


def test_conflict_context_is_null_without_a_conflict(client, monkeypatch, db):
    _as(monkeypatch)
    assert client.get("/incidents/inc_old", headers=AUTH).get_json()["conflictContext"] is None


def test_conflict_context_is_never_on_a_volunteer_read(client, monkeypatch, db):
    _third_reporter(db)
    _conflict_audit(db)
    db.data["incidents"]["inc_01"]["agency"] = "BPBD Meranti"
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    response = client.get("/incidents/inc_01", headers=AUTH)
    assert response.status_code == 200
    body = response.get_json()
    assert "conflictContext" not in body and "agencyInCharge" not in body
    assert "BPBD" not in response.get_data(as_text=True)


def test_conflict_context_is_forbidden_to_a_volunteer_with_no_link_to_the_incident(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_stranger")
    assert client.get("/incidents/inc_01", headers=AUTH).status_code == 404


def test_agency_in_charge_is_the_trimmed_stored_value_and_null_otherwise(client, monkeypatch, db):
    _as(monkeypatch)
    assert client.get("/incidents/inc_01", headers=AUTH).get_json()["agencyInCharge"] is None
    db.data["incidents"]["inc_01"]["agency"] = "  BPBD Kepulauan Meranti "
    assert client.get("/incidents/inc_01", headers=AUTH).get_json()["agencyInCharge"] == "BPBD Kepulauan Meranti"
    for blank in ("   ", "", 7, None, {"name": "x"}):
        db.data["incidents"]["inc_01"]["agency"] = blank
        assert client.get("/incidents/inc_01", headers=AUTH).get_json()["agencyInCharge"] is None


def test_agency_is_not_added_to_the_incident_record_or_the_list(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["agency"] = "BPBD Meranti"
    _as(monkeypatch)
    listed = client.get("/incidents", headers=AUTH).get_json()
    assert "agency" not in listed[0]
    assert "agency" not in client.get("/incidents/inc_01", headers=AUTH).get_json()["incident"]


# Incident label ---------------------------------------------------------------

def test_incident_label_is_the_name_else_area_else_position_else_plain():
    from incidents import rules

    assert rules.incident_label({"name": " Bengkalis, Riau · Pak Dedi · #3 ", "area": "x"}) == "Bengkalis, Riau · Pak Dedi · #3"
    assert rules.incident_label({"area": "Bengkalis, Riau"}) == "Incident · Bengkalis, Riau"
    assert rules.incident_label({"lat": 13.05, "lng": 77.63}) == "Incident · 13.05°N 77.63°E"
    assert rules.incident_label({"lat": -1.5, "lng": -2.25}) == "Incident · 1.50°S 2.25°W"
    assert rules.incident_label({"name": "  ", "lat": "x", "lng": None}) == "Incident"


def test_a_supervisor_decision_stores_the_actor_name_on_the_audit_row(client, monkeypatch, db):
    _as(monkeypatch)
    assert client.post("/incidents/inc_01/verify", headers=AUTH).status_code == 200
    row = next(r for r in _audit(db) if r["action"] == "incident.verify")
    assert row["actorName"] == "Bu Maya"


def test_a_token_without_a_name_stores_no_actor_name(client, monkeypatch, db):
    _as(monkeypatch, name="")
    assert client.post("/incidents/inc_01/verify", headers=AUTH).status_code == 200
    row = next(r for r in _audit(db) if r["action"] == "incident.verify")
    assert "actorName" not in row


# Supervisor list counts --------------------------------------------------------

def _obs(db, obs_id, uid, chip="asap", name=None, severity="smoke"):
    db.add("observations", obs_id, {
        "volunteerId": uid, "capturedAt": "2026-10-16T08:00:00Z", "receivedAt": "2026-10-16T08:00:02Z",
        "source": "chip", "lat": 13.05, "lng": 77.63, "accuracyM": 10, "chip": chip, "text": None,
        "severity": severity, "photoPath": None, "immutable": True, **({"volunteerName": name} if name else {}),
    })


def test_the_supervisor_list_counts_reports_and_volunteers_from_stored_reports(client, monkeypatch, db):
    _obs(db, "o1", "uid_a")
    _obs(db, "o2", "uid_a")
    _obs(db, "o3", "uid_b")
    db.add("incidents", "inc_counts", {
        "status": "open", "severity": "smoke", "evidenceScore": 35, "conflictId": None, "withdraw": None,
        "lat": 13.05, "lng": 77.63, "observationIds": ["o1", "o2", "o3", "o_missing"],
    })
    _as(monkeypatch)
    listed = {i["id"]: i for i in client.get("/incidents", headers=AUTH).get_json()}
    row = listed["inc_counts"]
    assert (row["reportCount"], row["volunteerCount"], row["needsHelp"]) == (3, 2, False)
    assert (row["verified"], row["verifiedBy"]) == (False, None)
    # An incident with no stored reports reports zero, never a dash or a guess.
    assert (listed["inc_01"]["reportCount"], listed["inc_01"]["volunteerCount"]) == (0, 0)


def test_the_supervisor_list_flags_a_need_help_report(client, monkeypatch, db):
    _obs(db, "o1", "uid_a")
    _obs(db, "o2", "uid_b", chip="butuh_bantuan", severity="unknown")
    db.add("incidents", "inc_help", {
        "status": "open", "severity": "unknown", "evidenceScore": 5, "conflictId": None, "withdraw": None,
        "lat": 13.05, "lng": 77.63, "observationIds": ["o1", "o2"],
    })
    _as(monkeypatch)
    listed = {i["id"]: i for i in client.get("/incidents", headers=AUTH).get_json()}
    assert listed["inc_help"]["needsHelp"] is True
    assert listed["inc_01"]["needsHelp"] is False


def test_the_supervisor_list_names_who_verified(client, monkeypatch, db):
    db.add("incidents", "inc_v", {
        "status": "verified", "severity": "smoke", "evidenceScore": 35, "conflictId": None, "withdraw": None,
        "lat": 1.0, "lng": 2.0, "observationIds": [],
    })
    db.add("incidents", "inc_v2", {
        "status": "verified", "severity": "smoke", "evidenceScore": 35, "conflictId": None, "withdraw": None,
        "lat": 1.0, "lng": 2.0, "observationIds": [],
    })
    db.add("audit", "a_old", {"actorId": "uid_x", "action": "incident.verify", "targetId": "inc_v", "at": "2026-10-16T08:00:00Z"})
    db.add("audit", "a_new", {"actorId": "uid_maya", "actorName": "Bu Maya", "action": "incident.verify", "targetId": "inc_v", "at": "2026-10-16T09:00:00Z"})
    db.add("audit", "a_noname", {"actorId": "uid_x", "action": "incident.verify", "targetId": "inc_v2", "at": "2026-10-16T08:00:00Z"})
    _as(monkeypatch)
    listed = {i["id"]: i for i in client.get("/incidents", headers=AUTH).get_json()}
    assert (listed["inc_v"]["verified"], listed["inc_v"]["verifiedBy"]) == (True, "Bu Maya")
    # Verified, but the row predates stored names and the supervisor has no record: no name is made up.
    assert (listed["inc_v2"]["verified"], listed["inc_v2"]["verifiedBy"]) == (True, None)


# Proposed tasks ---------------------------------------------------------------

def test_proposed_tasks_need_a_supervisor_and_the_status_filter(client, monkeypatch, db):
    assert client.get("/tasks?status=proposed").status_code == 401
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert client.get("/tasks?status=proposed", headers=AUTH).status_code == 403
    _as(monkeypatch)
    assert client.get("/tasks", headers=AUTH).status_code == 400
    bad = client.get("/tasks?status=approved", headers=AUTH)
    assert bad.status_code == 400 and bad.get_json()["error"]["fields"] == {"status": "use proposed"}


def test_proposed_tasks_carry_the_incident_label_and_the_volunteer_name(client, monkeypatch, db):
    db.data["observations"]["obs_01"]["volunteerName"] = "Sari"
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02"]
    db.add("volunteers", "uid_rizal", {"displayName": "Rizal"})
    db.data["tasks"]["task_verify_rizal"]["status"] = "approved"
    _as(monkeypatch)
    items = client.get("/tasks?status=proposed", headers=AUTH).get_json()
    assert [i["task"]["id"] for i in items] == ["task_investigate", "task_verify_sari"]
    first = items[0]
    assert first["volunteerName"] == "Sari"
    assert first["task"]["status"] == "proposed" and first["task"]["type"] == "investigate"
    assert first["incident"] == {
        "id": "inc_01", "name": None, "area": None, "label": "Incident · 1.48°N 102.11°E",
        "status": "held", "severity": "small_flame", "conflictId": "con_01",
    }


def test_a_proposed_task_on_an_unknown_incident_and_a_nameless_volunteer_stay_honest(client, monkeypatch, db):
    db.add("tasks", "task_orphan", {
        "incidentId": "inc_gone", "volunteerId": "uid_nobody", "type": "verify", "status": "proposed", "instruction": None,
    })
    _as(monkeypatch)
    items = {i["task"]["id"]: i for i in client.get("/tasks?status=proposed", headers=AUTH).get_json()}
    assert items["task_orphan"]["incident"] is None
    assert items["task_orphan"]["volunteerName"] is None
    assert items["task_orphan"]["task"]["instruction"] is None


def test_the_approvals_count_matches_the_list(client, monkeypatch, db):
    _as(monkeypatch)
    listed = client.get("/tasks?status=proposed", headers=AUTH).get_json()
    count = client.get("/dashboard", headers=AUTH).get_json()["approvalsCount"]
    assert len(listed) == count == 3

# #195 volunteer presentation metadata ------------------------------------------------

def test_volunteer_metadata_uses_stored_reports_audit_and_safe_context(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    _third_reporter(db)
    db.data["observations"]["obs_02"].update(volunteerName="Rizal", phone="private-phone", device={"secret": True})
    db.data["tasks"]["task_verify_sari"].update(status="approved", sentAt="2026-10-13T08:16:00Z", createdAt="2026-10-13T08:15:00Z")
    db.add("audit", "approval", {"targetId": "task_verify_sari", "action": "task.approve", "actorName": "Bu Maya", "at": "2026-10-13T08:16:00Z"})
    db.add("audit", "held", {"targetId": "inc_01", "action": "conflict.open", "at": "2026-10-13T08:15:00Z"})
    body = client.get("/digest", headers=AUTH).get_json()
    incident = next(row for row in body["incidents"] if row["id"] == "inc_01")
    assert incident["reportCount"] == 3 and incident["myReportCount"] == 1
    assert incident["participantCount"] == 3 and incident["includesMe"] is True
    assert incident["updatedAt"] == "2026-10-13T08:15:00Z"
    assert incident["closedAt"] is None
    task = next(row for row in body["myTasks"] if row["id"] == "task_verify_sari")
    assert task["reasonCode"] == "reports_disagree"
    assert task["createdAt"] == "2026-10-13T08:15:00Z"
    detail = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert len(detail["observations"]) == 3
    assert detail["conflictSummary"]["supervisorName"] == "Bu Maya"
    assert detail["conflictSummary"]["instruction"] == "Check the east bank"
    assert any(row["volunteerName"] == "Rizal" for row in detail["conflictSummary"]["reports"])
    assert "private-phone" not in str(detail) and "secret" not in str(detail)
    assert not any(key in detail for key in ("volunteerPhones", "evidenceFactors", "liveSeat", "summary"))


def test_completed_date_comes_from_extinguish_audit_not_response_clock(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    db.data["incidents"]["inc_01"]["status"] = "extinguished"
    db.add("audit", "close", {"targetId": "inc_01", "action": "incident.extinguish", "at": "2026-10-12T08:10:00Z"})
    db.add("audit", "after", {"targetId": "inc_01", "action": "incident.severity.lower", "at": "2026-10-13T08:10:00Z"})
    incident = client.get("/digest", headers=AUTH).get_json()["incidents"][0]
    assert incident["closedAt"] == "2026-10-12T08:10:00Z"
    assert incident["updatedAt"] == "2026-10-13T08:13:03Z"
    del db.data["audit"]["close"]
    assert client.get("/digest", headers=AUTH).get_json()["incidents"][0]["closedAt"] is None


def test_volunteer_metadata_stays_scoped_and_missing_values_stay_null(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    db.add("incidents", "secret_incident", {"status": "extinguished", "observationIds": ["secret_report"]})
    db.add("observations", "secret_report", {"volunteerId": "uid_secret", "volunteerName": "Hidden Person"})
    response = client.get("/digest", headers=AUTH).get_json()
    assert "Hidden Person" not in str(response) and "secret_incident" not in str(response)
    assert all(row["closedAt"] is None for row in response["incidents"])
    assert ("observations", 1) not in db.batch_reads  # no isolated read of the unrelated report
    _as(monkeypatch, role="volunteer", uid="uid_stranger")
    assert client.get("/incidents/inc_01", headers=AUTH).status_code == 404


def test_task_creation_timestamp_can_come_from_firestore():
    from datetime import datetime, timezone
    from types import SimpleNamespace
    from incidents.volunteer_view import task_created, latest
    snap = SimpleNamespace(to_dict=lambda: {}, create_time=datetime(2026, 10, 17, 8, 0, tzinfo=timezone.utc))
    assert task_created(snap) == "2026-10-17T08:00:00Z"
    assert latest(["bad", "2026-10-17T09:00:00+01:00", "2026-10-17T08:30:00Z"]) == "2026-10-17T08:30:00Z"

@pytest.mark.parametrize("status", ["open", "verified", "extinguished"])
def test_old_conflict_does_not_add_hold_context_after_status_changes(client, monkeypatch, db, status):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    db.data["incidents"]["inc_01"]["status"] = status
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert body["incident"]["status"] == status
    assert body["conflictSummary"] is None
