"""FCM double for one approved task and one WITHDRAW. No live Firebase."""
import pytest

import identity
from app import app
from incidents import store
from incidents.fake_firestore import FakeFirestore
from notifications.message import message_for
from notifications.send import TransientPushError, deliver_task

AUTH = {"Authorization": "Bearer valid"}
CALLER = "sa-ember-agents@example.iam.gserviceaccount.com"


class FcmDouble:
    def __init__(self, fail_times=0, error=None):
        self.sent = []
        self.fail_times = fail_times
        self.error = error if error is not None else TransientPushError("unavailable")
        self.calls = 0

    def send(self, token, title, body, data):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise self.error
        self.sent.append({"token": token, "title": title, "body": body, "data": dict(data)})


def _db(monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    fake.add("observations", "obs_01", {
        "volunteerId": "uid_sari", "source": "chip", "severity": "small_flame",
        "lat": 1.482, "lng": 102.115, "immutable": True,
    })
    fake.add("incidents", "inc_01", {
        "status": "open", "severity": "small_flame", "evidenceScore": 40,
        "conflictId": None, "withdraw": None, "lat": 1.482, "lng": 102.115,
    })
    fake.add("tasks", "task_verify_sari", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "verify",
        "status": "proposed", "instruction": "Check the east bank",
    })
    fake.add("volunteers", "uid_sari", {"fcmTokens": ["tok-sari"]})
    return fake


def _supervisor(monkeypatch):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": "uid_maya", "name": "Bu Maya", "role": "supervisor"},
    )


def _attempts(db):
    return list(db.data.get("notificationAttempts", {}).values())


@pytest.fixture
def api():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def db(monkeypatch):
    return _db(monkeypatch)


@pytest.fixture
def fcm(monkeypatch):
    double = FcmDouble()
    monkeypatch.setattr("notifications.send.default_sender", lambda: double)
    return double


def test_message_is_title_instruction_and_ids_only():
    message = message_for({
        "id": "task_01", "incidentId": "inc_01", "volunteerId": "uid_sari",
        "type": "verify", "instruction": "Check the east bank",
        "lat": 1.482, "lng": 102.115,
    })
    assert message["title"] == "EMBER"
    assert message["body"] == "Check the east bank"
    assert message["data"] == {"taskId": "task_01", "incidentId": "inc_01", "type": "verify"}
    assert "uid_sari" not in message["body"]
    assert "1.482" not in str(message)


def test_blank_instruction_uses_a_generic_body():
    assert message_for({"id": "t", "instruction": "  "})["body"] == "New task"


def test_task_and_withdraw_each_reach_the_double(api, monkeypatch, db, fcm):
    _supervisor(monkeypatch)
    approved = api.post("/tasks/task_verify_sari/approve", headers=AUTH)
    assert approved.status_code == 200
    withdrawn = api.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_sari"],
        "instruction": "Withdraw upwind. Do not engage.",
        "reasons": ["supervisor instruction"],
    })
    assert withdrawn.status_code == 200

    assert [item["data"]["type"] for item in fcm.sent] == ["verify", "withdraw"]
    assert all(item["title"] == "EMBER" for item in fcm.sent)
    assert fcm.sent[0]["body"] == "Check the east bank"
    assert fcm.sent[1]["body"] == "Withdraw upwind. Do not engage."
    assert fcm.sent[0]["token"] == "tok-sari"
    for item in fcm.sent:
        assert set(item["data"]) == {"taskId", "incidentId", "type"}
        assert "uid_sari" not in item["data"].values()
        assert "Bu Maya" not in str(item)
    assert [row["result"] for row in _attempts(db)] == ["sent", "sent"]
    assert db.data["tasks"]["task_verify_sari"]["status"] == "approved"
    assert db.data["incidents"]["inc_01"]["withdraw"]["active"] is True


def test_missing_token_is_skipped_and_the_task_stays_approved(api, monkeypatch, db, fcm):
    _supervisor(monkeypatch)
    del db.data["volunteers"]["uid_sari"]
    response = api.post("/tasks/task_verify_sari/approve", headers=AUTH)
    assert response.status_code == 200
    assert db.data["tasks"]["task_verify_sari"]["status"] == "approved"
    assert fcm.sent == []
    row = _attempts(db)[0]
    assert row["kind"] == "task"
    assert row["targetId"] == "task_verify_sari"
    assert row["volunteerId"] == "uid_sari"
    assert row["result"] == "skipped"
    assert row["attempts"] == 0
    assert row["at"].endswith("Z")


def test_transient_failure_is_retried_then_sent(db, fcm):
    fcm.fail_times = 2
    task = {
        "id": "task_verify_sari", "incidentId": "inc_01", "volunteerId": "uid_sari",
        "type": "verify", "instruction": "Check the east bank",
    }
    outcome = deliver_task(task)
    assert outcome == {"result": "sent", "attempts": 3}
    assert len(fcm.sent) == 1
    assert _attempts(db)[0]["result"] == "sent"
    assert _attempts(db)[0]["attempts"] == 3


def test_failed_send_does_not_undo_withdraw(api, monkeypatch, db, fcm):
    _supervisor(monkeypatch)
    fcm.fail_times = 5
    fcm.error = RuntimeError("rejected")
    response = api.post("/incidents/inc_01/withdraw", headers=AUTH, json={
        "volunteerIds": ["uid_sari"],
        "instruction": "Withdraw upwind. Do not engage.",
        "reasons": [],
    })
    assert response.status_code == 200
    assert db.data["incidents"]["inc_01"]["withdraw"]["active"] is True
    assert fcm.sent == []
    assert _attempts(db)[0]["result"] == "failed"
    assert _attempts(db)[0]["attempts"] == 1
    withdraw_tasks = [task for task in db.data["tasks"].values() if task["type"] == "withdraw"]
    assert withdraw_tasks[0]["status"] == "approved"


def _agents(monkeypatch):
    monkeypatch.setenv("EMBER_AGENTS_CALLER", CALLER)
    monkeypatch.setattr("notifications.caller.caller_email", lambda token, aud: CALLER)


def test_code_withdraw_push_uses_the_stored_task(api, monkeypatch, db, fcm):
    _agents(monkeypatch)
    db.data["incidents"]["inc_01"]["withdraw"] = {
        "active": True, "instruction": "Withdraw upwind. Do not engage.",
        "reasons": ["large flame reported"], "volunteerIds": ["uid_sari"],
    }
    db.add("tasks", "task_wd", {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "withdraw",
        "status": "approved", "instruction": "Withdraw upwind. Do not engage.",
    })
    before = dict(db.data["incidents"]["inc_01"])
    response = api.post("/internal/notifications/withdraw", json={
        "incidentId": "inc_01",
        "tasks": [{"id": "task_wd", "volunteerId": "uid_sari"}],
        "instruction": "Ignore this extra text",
        "name": "Sari",
    }, headers={"Authorization": "Bearer agents"})
    assert response.status_code == 202
    assert response.get_json()["results"] == [{"result": "sent", "attempts": 1}]
    assert fcm.sent[0]["body"] == "Withdraw upwind. Do not engage."
    assert fcm.sent[0]["data"]["type"] == "withdraw"
    assert fcm.sent[0]["data"]["taskId"] == "task_wd"
    assert "Sari" not in str(fcm.sent)
    assert db.data["incidents"]["inc_01"] == before


def test_internal_withdraw_rejects_a_stranger(api, monkeypatch, db, fcm):
    monkeypatch.setenv("EMBER_AGENTS_CALLER", CALLER)
    monkeypatch.setattr("notifications.caller.caller_email", lambda token, aud: "someone-else@example.com")
    response = api.post("/internal/notifications/withdraw", json={
        "incidentId": "inc_01", "tasks": [{"id": "task_wd", "volunteerId": "uid_sari"}],
    }, headers={"Authorization": "Bearer agents"})
    assert response.status_code == 403
    assert fcm.sent == []
    assert _attempts(db) == []


def test_internal_withdraw_needs_the_caller_env(api, monkeypatch, db):
    monkeypatch.delenv("EMBER_AGENTS_CALLER", raising=False)
    response = api.post("/internal/notifications/withdraw", json={
        "incidentId": "inc_01", "tasks": [{"id": "t", "volunteerId": "uid_sari"}],
    }, headers={"Authorization": "Bearer agents"})
    assert response.status_code == 401
    assert db.data["incidents"]["inc_01"]["withdraw"] is None
