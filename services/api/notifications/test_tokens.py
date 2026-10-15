"""Device token routes and dead-token cleanup. No live Firebase."""
import pytest
from firebase_admin import exceptions, messaging

import identity
from app import app
from incidents import store
from incidents.fake_firestore import FakeFirestore
from notifications.send import deliver_task

AUTH = {"Authorization": "Bearer valid"}
URL = "/notifications/token"


class Sender:
    def __init__(self, errors=None):
        self.errors = errors or {}
        self.sent = []

    def send(self, token, title, body, data):
        if token in self.errors:
            raise self.errors[token]
        self.sent.append(token)


def _as(monkeypatch, uid, role="volunteer"):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": uid, "name": uid, "role": role},
    )


@pytest.fixture
def api():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def db(monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    return fake


def _tokens(db, uid):
    return db.data.get("volunteers", {}).get(uid, {}).get("fcmTokens")


def test_first_token_creates_the_volunteer_document(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    response = api.post(URL, headers=AUTH, json={"token": "tok-1"})
    assert response.status_code == 200
    assert response.get_json() == {"stored": True}
    assert _tokens(db, "uid_dedi") == ["tok-1"]


def test_the_same_token_is_stored_once(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    api.post(URL, headers=AUTH, json={"token": "tok-1"})
    again = api.post(URL, headers=AUTH, json={"token": " tok-1 "})
    assert again.status_code == 200
    assert again.get_json() == {"stored": False}
    assert _tokens(db, "uid_dedi") == ["tok-1"]


def test_a_second_device_is_added_next_to_the_first(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    db.add("volunteers", "uid_dedi", {"displayName": "Pak Dedi", "fcmTokens": ["tok-1"]})
    api.post(URL, headers=AUTH, json={"token": "tok-2"})
    assert _tokens(db, "uid_dedi") == ["tok-1", "tok-2"]
    assert db.data["volunteers"]["uid_dedi"]["displayName"] == "Pak Dedi"


def test_the_list_keeps_only_the_newest_tokens(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    for n in range(12):
        api.post(URL, headers=AUTH, json={"token": f"tok-{n}"})
    stored = _tokens(db, "uid_dedi")
    assert len(stored) == 10
    assert stored[0] == "tok-2" and stored[-1] == "tok-11"


@pytest.mark.parametrize("body", [{}, {"token": ""}, {"token": "   "}, {"token": 7}, {"token": None}, {"token": "a b"}, [], "tok"])
def test_an_empty_or_malformed_token_is_rejected(api, monkeypatch, db, body):
    _as(monkeypatch, "uid_dedi")
    response = api.post(URL, headers=AUTH, json=body)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "validation_error"
    assert _tokens(db, "uid_dedi") is None


def test_another_volunteers_id_is_rejected(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    response = api.post(URL, headers=AUTH, json={"token": "tok-1", "volunteerId": "uid_sari"})
    assert response.status_code == 403
    assert "volunteers" not in db.data or "uid_sari" not in db.data["volunteers"]
    assert _tokens(db, "uid_dedi") is None


def test_the_callers_own_id_is_accepted(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    response = api.post(URL, headers=AUTH, json={"token": "tok-1", "volunteerId": "uid_dedi"})
    assert response.status_code == 200


def test_a_supervisor_cannot_register_a_device(api, monkeypatch, db):
    _as(monkeypatch, "uid_maya", role="supervisor")
    assert api.post(URL, headers=AUTH, json={"token": "tok-1"}).status_code == 403
    assert api.delete(URL, headers=AUTH, json={"token": "tok-1"}).status_code == 403


def test_the_route_needs_a_signed_in_user(api, db):
    assert api.post(URL, json={"token": "tok-1"}).status_code == 401
    assert api.delete(URL, json={"token": "tok-1"}).status_code == 401


def test_the_response_never_lists_tokens(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    db.add("volunteers", "uid_sari", {"fcmTokens": ["tok-sari"]})
    response = api.post(URL, headers=AUTH, json={"token": "tok-1"})
    assert "tok-sari" not in response.get_data(as_text=True)
    assert api.get(URL, headers=AUTH).status_code == 405


def test_a_token_moves_when_another_volunteer_signs_in_on_the_phone(api, monkeypatch, db):
    db.add("volunteers", "uid_sari", {"fcmTokens": ["tok-1", "tok-sari"]})
    _as(monkeypatch, "uid_dedi")
    api.post(URL, headers=AUTH, json={"token": "tok-1"})
    assert _tokens(db, "uid_dedi") == ["tok-1"]
    assert _tokens(db, "uid_sari") == ["tok-sari"]


def test_delete_removes_only_that_token_for_the_caller(api, monkeypatch, db):
    db.add("volunteers", "uid_dedi", {"fcmTokens": ["tok-1", "tok-2"]})
    db.add("volunteers", "uid_sari", {"fcmTokens": ["tok-1"]})
    _as(monkeypatch, "uid_dedi")
    response = api.delete(URL, headers=AUTH, json={"token": "tok-1"})
    assert response.status_code == 200
    assert response.get_json() == {"removed": True}
    assert _tokens(db, "uid_dedi") == ["tok-2"]
    assert _tokens(db, "uid_sari") == ["tok-1"]


def test_delete_of_an_unknown_token_is_not_an_error(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    response = api.delete(URL, headers=AUTH, json={"token": "tok-9"})
    assert response.status_code == 200
    assert response.get_json() == {"removed": False}
    assert "volunteers" not in db.data or "uid_dedi" not in db.data["volunteers"]


def test_delete_rejects_an_empty_token(api, monkeypatch, db):
    _as(monkeypatch, "uid_dedi")
    assert api.delete(URL, headers=AUTH, json={"token": ""}).status_code == 400


# Dead tokens ---------------------------------------------------------------

def _task():
    return {"id": "task_1", "incidentId": "inc_1", "volunteerId": "uid_dedi",
            "type": "verify", "instruction": "Check the east bank"}


def _attempts(db):
    return list(db.data.get("notificationAttempts", {}).values())


@pytest.mark.parametrize("error", [
    messaging.UnregisteredError("Requested entity was not found."),
    messaging.SenderIdMismatchError("SenderId mismatch"),
    exceptions.InvalidArgumentError("The registration token is not a valid FCM registration token"),
])
def test_a_token_fcm_rejects_is_removed(monkeypatch, db, error):
    db.add("volunteers", "uid_dedi", {"fcmTokens": ["dead", "live"]})
    sender = Sender({"dead": error})
    outcome = deliver_task(_task(), sender=sender)
    assert outcome["result"] == "sent"
    assert sender.sent == ["live"]
    assert _tokens(db, "uid_dedi") == ["live"]


def test_when_every_token_is_rejected_the_attempt_is_failed_and_the_list_empties(db):
    db.add("volunteers", "uid_dedi", {"fcmTokens": ["dead"]})
    sender = Sender({"dead": messaging.UnregisteredError("gone")})
    outcome = deliver_task(_task(), sender=sender)
    assert outcome == {"result": "failed", "attempts": 1}
    assert _tokens(db, "uid_dedi") == []
    assert [row["result"] for row in _attempts(db)] == ["failed"]


def test_an_invalid_argument_that_is_not_about_the_token_keeps_the_token(db):
    db.add("volunteers", "uid_dedi", {"fcmTokens": ["tok-1"]})
    sender = Sender({"tok-1": exceptions.InvalidArgumentError("Invalid data payload key")})
    assert deliver_task(_task(), sender=sender)["result"] == "failed"
    assert _tokens(db, "uid_dedi") == ["tok-1"]


def test_a_permission_error_keeps_the_token(db):
    db.add("volunteers", "uid_dedi", {"fcmTokens": ["tok-1"]})
    sender = Sender({"tok-1": exceptions.PermissionDeniedError("denied")})
    assert deliver_task(_task(), sender=sender)["result"] == "failed"
    assert _tokens(db, "uid_dedi") == ["tok-1"]


def test_a_failure_while_removing_a_token_does_not_hide_the_send_result(monkeypatch, db):
    db.add("volunteers", "uid_dedi", {"fcmTokens": ["dead", "live"]})

    def broken(volunteer_id, token):
        raise RuntimeError("firestore down")

    monkeypatch.setattr("notifications.send.token_store.remove", broken)
    sender = Sender({"dead": messaging.UnregisteredError("gone")})
    assert deliver_task(_task(), sender=sender)["result"] == "sent"
