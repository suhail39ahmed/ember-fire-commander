"""Volunteer answers to an instruction: accept, decline, and the WITHDRAW answer."""
import pytest

import identity
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
def db(monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    fake.add("incidents", "inc_01", {
        "status": "open", "severity": "large_flame", "lat": 1.48, "lng": 102.11,
        "withdraw": {"active": True, "instruction": "Withdraw upwind", "reasons": ["large flame"], "volunteerIds": ["uid_sari", "uid_rizal"]},
    })
    fake.add("incidents", "inc_calm", {"status": "open", "severity": "smoke", "lat": 1.5, "lng": 102.2, "withdraw": None})
    fake.add("tasks", "task_sari", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "verify", "status": "approved",
        "instruction": "Check the east bank", "sentAt": "2026-10-16T08:00:00.000Z",
    })
    fake.add("tasks", "task_rizal", {
        "incidentId": "inc_01", "volunteerId": "uid_rizal", "type": "verify", "status": "approved", "instruction": "Check the west bank",
    })
    fake.add("tasks", "task_proposed", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "verify", "status": "proposed", "instruction": "Wait",
    })
    fake.add("tasks", "task_withdraw", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "withdraw", "status": "approved", "instruction": "Mundur",
    })
    return fake


def _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari"):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": uid, "name": name, "role": role})


def _audit(db):
    return list(db.data.get("audit", {}).values())


# Doing it -------------------------------------------------------------------

def test_accept_records_the_time_once_and_audits_it(client, db, monkeypatch):
    _as(monkeypatch)
    first = client.post("/tasks/task_sari/accept", headers=AUTH)
    assert first.status_code == 200
    body = first.get_json()
    assert body["task"]["acceptedAt"]
    assert body["auditId"]
    again = client.post("/tasks/task_sari/accept", headers=AUTH)
    assert again.status_code == 200
    assert again.get_json()["auditId"] is None
    assert again.get_json()["task"]["acceptedAt"] == body["task"]["acceptedAt"]
    assert [row["action"] for row in _audit(db)] == ["task.accept"]


def test_accept_is_for_the_volunteers_own_sent_task_only(client, db, monkeypatch):
    _as(monkeypatch)
    assert client.post("/tasks/task_rizal/accept", headers=AUTH).status_code == 404
    assert client.post("/tasks/missing/accept", headers=AUTH).status_code == 404
    assert client.post("/tasks/task_proposed/accept", headers=AUTH).status_code == 409
    assert client.post("/tasks/task_withdraw/accept", headers=AUTH).status_code == 409
    assert _audit(db) == []


def test_a_supervisor_cannot_accept_or_decline(client, db, monkeypatch):
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")
    assert client.post("/tasks/task_sari/accept", headers=AUTH).status_code == 403
    assert client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "unsafe"}).status_code == 403


# Can't do it ----------------------------------------------------------------

def test_accept_message_survives_retry_and_both_reads(client, db, monkeypatch):
    _as(monkeypatch)
    first = client.post("/tasks/task_sari/accept", headers=AUTH, json={"response": "on_my_way", "note": "  Bringing the pump  "})
    assert first.status_code == 200
    assert first.get_json()["task"]["acceptNote"] == "Bringing the pump"
    retry = client.post("/tasks/task_sari/accept", headers=AUTH, json={"response": "starting_now", "note": "Changed"})
    assert retry.get_json()["auditId"] is None
    assert retry.get_json()["task"]["acceptResponse"] == "on_my_way"
    digest = client.get("/digest", headers=AUTH).get_json()
    assert next(t for t in digest["myTasks"] if t["id"] == "task_sari")["acceptNote"] == "Bringing the pump"
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")
    detail = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert next(t for t in detail["tasks"] if t["id"] == "task_sari")["acceptNote"] == "Bringing the pump"
    assert len(_audit(db)) == 1


@pytest.mark.parametrize("body", [{"response": "unknown"}, {"response": []}, {"note": 4}, {"note": "x" * 301}, []])
def test_accept_validates_optional_message(client, db, monkeypatch, body):
    _as(monkeypatch)
    assert client.post("/tasks/task_sari/accept", headers=AUTH, json=body).status_code == 400
    assert _audit(db) == []


def test_decline_stores_the_reason_and_note_and_keeps_the_instruction(client, db, monkeypatch):
    _as(monkeypatch)
    response = client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "too_far", "note": "  Road is flooded "})
    assert response.status_code == 200
    task = response.get_json()["task"]
    assert task["declineReason"] == "too_far"
    assert task["declineNote"] == "Road is flooded"
    assert task["declinedAt"]
    assert task["instruction"] == "Check the east bank"
    assert task["status"] == "approved"
    stored = db.data["tasks"]["task_sari"]
    assert stored["instruction"] == "Check the east bank"
    assert [row["action"] for row in _audit(db)] == ["task.decline"]


def test_decline_note_is_optional_and_a_repeat_writes_nothing(client, db, monkeypatch):
    _as(monkeypatch)
    first = client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "unsafe"})
    assert first.get_json()["task"]["declineNote"] is None
    second = client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "other"})
    assert second.status_code == 200
    assert second.get_json()["auditId"] is None
    assert second.get_json()["task"]["declineReason"] == "unsafe"
    assert len(_audit(db)) == 1


def test_decline_rejects_an_unknown_reason_a_long_note_and_a_bad_body(client, db, monkeypatch):
    _as(monkeypatch)
    bad_reason = client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "lazy"})
    assert bad_reason.status_code == 400
    assert "reason" in bad_reason.get_json()["error"]["fields"]
    assert client.post("/tasks/task_sari/decline", headers=AUTH, json={}).status_code == 400
    assert client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "other", "note": "x" * 301}).status_code == 400
    assert client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "other", "note": 4}).status_code == 400
    assert client.post("/tasks/task_sari/decline", headers=AUTH, data="nope", content_type="application/json").status_code == 400
    assert _audit(db) == []


def test_decline_is_for_the_volunteers_own_sent_task_only(client, db, monkeypatch):
    _as(monkeypatch)
    assert client.post("/tasks/task_rizal/decline", headers=AUTH, json={"reason": "unsafe"}).status_code == 404
    assert client.post("/tasks/task_proposed/decline", headers=AUTH, json={"reason": "unsafe"}).status_code == 409
    assert client.post("/tasks/task_withdraw/decline", headers=AUTH, json={"reason": "unsafe"}).status_code == 409


def test_accept_after_a_decline_is_refused_but_decline_after_accept_is_allowed(client, db, monkeypatch):
    _as(monkeypatch)
    assert client.post("/tasks/task_sari/accept", headers=AUTH).status_code == 200
    assert client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "unsafe"}).status_code == 200
    assert client.post("/tasks/task_sari/accept", headers=AUTH).status_code == 409


def test_the_digest_carries_the_answer_back_to_the_phone(client, db, monkeypatch):
    _as(monkeypatch)
    client.post("/tasks/task_sari/accept", headers=AUTH)
    client.post("/tasks/task_sari/decline", headers=AUTH, json={"reason": "no_equipment", "note": "No pump"})
    task = {t["id"]: t for t in client.get("/digest", headers=AUTH).get_json()["myTasks"]}["task_sari"]
    assert task["acceptedAt"] and task["declinedAt"]
    assert task["declineReason"] == "no_equipment"
    assert task["declineNote"] == "No pump"


# WITHDRAW answer --------------------------------------------------------------

def test_a_safe_answer_is_stored_with_the_place_and_audited(client, db, monkeypatch):
    _as(monkeypatch)
    response = client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "safe", "lat": 1.49, "lng": 102.12, "accuracyM": 14})
    assert response.status_code == 200
    answer = response.get_json()["answer"]
    assert answer["state"] == "safe" and answer["lat"] == 1.49 and answer["accuracyM"] == 14
    assert db.data["withdraw_answers"]["inc_01__uid_sari"]["state"] == "safe"
    row = _audit(db)[0]
    assert (row["action"], row["targetId"], row["subjectId"], row["actorId"]) == ("withdraw.answer", "inc_01", "uid_sari", "uid_sari")


def test_the_latest_answer_replaces_the_earlier_one(client, db, monkeypatch):
    _as(monkeypatch)
    client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "safe", "lat": 1.49, "lng": 102.12})
    client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "stuck"})
    stored = db.data["withdraw_answers"]["inc_01__uid_sari"]
    assert stored["state"] == "stuck"
    assert stored["lat"] is None and stored["lng"] is None
    assert len(db.data["withdraw_answers"]) == 1


def test_an_answer_without_a_place_is_still_accepted(client, db, monkeypatch):
    _as(monkeypatch)
    assert client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "stuck"}).status_code == 200


def test_the_answer_does_not_change_the_withdraw(client, db, monkeypatch):
    _as(monkeypatch)
    client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "safe"})
    withdraw = db.data["incidents"]["inc_01"]["withdraw"]
    assert withdraw["active"] is True
    assert "safeVolunteerIds" not in withdraw


def test_answer_validation(client, db, monkeypatch):
    _as(monkeypatch)
    post = lambda body: client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json=body)  # noqa: E731
    assert post({"state": "fine"}).status_code == 400
    assert post({}).status_code == 400
    assert post({"state": "safe", "lat": 91, "lng": 0}).status_code == 400
    assert post({"state": "safe", "lat": 1.0}).status_code == 400
    assert post({"state": "safe", "lat": "1", "lng": "2"}).status_code == 400
    assert post({"state": "safe", "lat": True, "lng": 2}).status_code == 400
    assert post({"state": "safe", "accuracyM": -1}).status_code == 400
    assert db.data.get("withdraw_answers", {}) == {}


def test_only_a_volunteer_named_on_an_active_withdraw_can_answer(client, db, monkeypatch):
    _as(monkeypatch, uid="uid_other", name="Other")
    assert client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "safe"}).status_code == 404
    _as(monkeypatch)
    assert client.post("/incidents/nope/withdraw/answer", headers=AUTH, json={"state": "safe"}).status_code == 404
    assert client.post("/incidents/inc_calm/withdraw/answer", headers=AUTH, json={"state": "safe"}).status_code == 404
    db.data["incidents"]["inc_01"]["withdraw"]["active"] = False
    assert client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "safe"}).status_code == 409
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")
    assert client.post("/incidents/inc_01/withdraw/answer", headers=AUTH, json={"state": "safe"}).status_code == 403


# Flag a wrong report ---------------------------------------------------------

SARI_PHOTO = "photos/uid_sari/20261016/" + "a" * 32 + ".jpg"


@pytest.fixture
def flaggable(db):
    db.add("observations", "obs_rizal", {"volunteerId": "uid_rizal", "chip": "api", "text": "Fire at the canal", "immutable": True})
    db.add("observations", "obs_sari", {"volunteerId": "uid_sari", "chip": "asap", "text": "Thin smoke", "immutable": True})
    db.add("observations", "obs_far", {"volunteerId": "uid_far", "chip": "api", "text": "Elsewhere", "immutable": True})
    db.add("incidents", "inc_flag", {"status": "open", "severity": "smoke", "lat": 1.5, "lng": 102.1, "withdraw": None, "observationIds": ["obs_rizal", "obs_sari"]})
    db.add("incidents", "inc_far", {"status": "open", "severity": "smoke", "lat": 9.0, "lng": 99.0, "withdraw": None, "observationIds": ["obs_far"]})
    return db


def test_a_volunteer_on_the_incident_can_flag_someone_elses_report(client, flaggable, monkeypatch):
    _as(monkeypatch)
    response = client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "no_fire", "photoPath": SARI_PHOTO})
    assert response.status_code == 200
    body = response.get_json()
    assert body["flag"] == {
        "observationId": "obs_rizal", "incidentId": "inc_flag", "volunteerId": "uid_sari",
        "reason": "no_fire", "photoPath": SARI_PHOTO, "at": body["flag"]["at"],
    }
    assert body["auditId"]
    assert flaggable.data["observation_flags"]["obs_rizal__uid_sari"]["reason"] == "no_fire"
    assert [row["action"] for row in _audit(flaggable)] == ["observation.flag"]
    assert _audit(flaggable)[0]["targetId"] == "obs_rizal"


def test_flagging_never_changes_the_report(client, flaggable, monkeypatch):
    _as(monkeypatch)
    before = dict(flaggable.data["observations"]["obs_rizal"])
    client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "fake"})
    assert flaggable.data["observations"]["obs_rizal"] == before


def test_a_second_flag_from_the_same_volunteer_replaces_the_first(client, flaggable, monkeypatch):
    _as(monkeypatch)
    client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "no_fire"})
    client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "old_photo"})
    flags = flaggable.data["observation_flags"]
    assert list(flags) == ["obs_rizal__uid_sari"]
    assert flags["obs_rizal__uid_sari"]["reason"] == "old_photo"
    assert flags["obs_rizal__uid_sari"]["photoPath"] is None


def test_a_volunteer_cannot_flag_their_own_report(client, flaggable, monkeypatch):
    _as(monkeypatch)
    assert client.post("/observations/obs_sari/flag", headers=AUTH, json={"reason": "fake"}).status_code == 409
    assert "observation_flags" not in flaggable.data or not flaggable.data["observation_flags"]


def test_a_report_on_another_incident_or_an_unknown_report_is_not_found(client, flaggable, monkeypatch):
    _as(monkeypatch)
    assert client.post("/observations/obs_far/flag", headers=AUTH, json={"reason": "fake"}).status_code == 404
    assert client.post("/observations/missing/flag", headers=AUTH, json={"reason": "fake"}).status_code == 404
    assert _audit(flaggable) == []


def test_flag_validation(client, flaggable, monkeypatch):
    _as(monkeypatch)
    bad = client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "lazy"})
    assert bad.status_code == 400
    assert "reason" in bad.get_json()["error"]["fields"]
    assert client.post("/observations/obs_rizal/flag", headers=AUTH, json={}).status_code == 400
    someone_elses = "photos/uid_rizal/20261016/" + "b" * 32 + ".jpg"
    assert client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "fake", "photoPath": someone_elses}).status_code == 400
    assert client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "fake", "photoPath": "https://x.test/a.jpg"}).status_code == 400
    assert client.post("/observations/obs_rizal/flag", headers=AUTH, data="nope", content_type="application/json").status_code == 400


def test_a_supervisor_cannot_flag(client, flaggable, monkeypatch):
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")
    assert client.post("/observations/obs_rizal/flag", headers=AUTH, json={"reason": "fake"}).status_code == 403
