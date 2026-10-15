import pytest

import identity
from app import app
from incidents import rules, store
from incidents.fake_firestore import FakeFirestore


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _as(monkeypatch, role="supervisor", uid="uid_maya"):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": uid, "name": "Bu Maya", "role": role},
    )


AUTH = {"Authorization": "Bearer valid"}


def _task(db, task_id, status):
    db.add("tasks", task_id, {
        "incidentId": "inc_01", "volunteerId": "uid_sari", "type": "verify",
        "status": status, "instruction": "Check the east bank",
    })


def test_dashboard_needs_a_token(client):
    assert client.get("/dashboard").status_code == 401


def test_dashboard_returns_agency_clock_and_proposed_count(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(rules, "now_iso", lambda: "2026-10-16T07:46:00Z")
    _as(monkeypatch)
    fake.add("volunteers", "uid_maya", {"agency": "  BPBD Kepulauan Meranti  ", "fcmTokens": []})
    fake.add("volunteers", "uid_other", {"agency": "Someone else"})
    _task(fake, "task_proposed", "proposed")
    _task(fake, "task_approved", "approved")
    _task(fake, "task_rejected", "rejected")
    _task(fake, "task_proposed_2", "proposed")

    response = client.get("/dashboard", headers=AUTH)
    assert response.status_code == 200
    assert response.get_json() == {
        "agency": "BPBD Kepulauan Meranti",
        "serverTime": "2026-10-16T07:46:00Z",
        "approvalsCount": 2,
    }


def test_dashboard_agency_missing_is_null(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch)
    fake.add("volunteers", "uid_maya", {"agency": "   ", "fcmTokens": []})
    _task(fake, "task_proposed", "proposed")

    body = client.get("/dashboard", headers=AUTH).get_json()
    assert body["agency"] is None
    assert body["approvalsCount"] == 1
    assert body["serverTime"].endswith("Z")


def test_dashboard_without_a_profile_document(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch)

    body = client.get("/dashboard", headers=AUTH).get_json()
    assert body["agency"] is None
    assert body["approvalsCount"] == 0


def test_volunteer_cannot_read_dashboard(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    _task(fake, "task_proposed", "proposed")

    response = client.get("/dashboard", headers=AUTH)
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
