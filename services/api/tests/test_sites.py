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


@pytest.fixture
def db(monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    monkeypatch.setattr(rules, "now_iso", lambda: "2026-10-16T12:00:00Z")
    return fake


def _as(monkeypatch, role="supervisor", uid="uid_maya"):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": uid, "name": "Bu Maya", "role": role},
    )


AUTH = {"Authorization": "Bearer valid"}


def _site(fake, alert_over=None):
    alert = {
        "id": "alert_1",
        "kind": "lead",
        "sourceId": "lead_secret",
        "distanceM": 140,
        "itemAt": "2026-10-16T11:00:00Z",
        "at": "2026-10-16T11:05:00Z",
        "message": "New activity near an extinguished site. Re-inspect before any decision.",
    }
    if alert_over:
        alert.update(alert_over)
    fake.add("incidents", "inc_karimun", {
        "status": "extinguished", "severity": "smoke", "evidenceScore": 20,
        "conflictId": None, "withdraw": None, "lat": -1.1, "lng": 102.5,
        "observationIds": ["obs_k"], "name": "Karimun · #1",
    })
    fake.add("observations", "obs_k", {"volunteerId": "uid_sari"})
    fake.add("sites", "inc_karimun", {
        "incidentId": "inc_karimun",
        "lat": -1.1,
        "lng": 102.5,
        "radiusM": 500,
        "extinguishedAt": "2026-09-28T12:10:00Z",
        "status": "reinspect",
        "observationIds": ["obs_k"],
        "alerts": [alert],
        "lastAlertAt": "2026-10-16T11:05:00Z",
    })
    return alert


def test_dashboard_shows_reignition_alert_without_lead_id(client, monkeypatch, db):
    _as(monkeypatch)
    _site(db)
    body = client.get("/dashboard", headers=AUTH).get_json()
    assert body["reignitionAlert"] == {
        "id": "alert_1",
        "incidentId": "inc_karimun",
        "code": None,
        "distanceM": 140,
        "extinguishedAt": "2026-09-28T12:10:00Z",
        "message": "New activity near an extinguished site. Re-inspect before any decision.",
        "taskId": None,
    }
    assert "lead_secret" not in str(body)
    assert "kind" not in body["reignitionAlert"]
    assert "sourceId" not in body["reignitionAlert"]


def test_dismiss_needs_a_reason_and_hides_the_alert(client, monkeypatch, db):
    _as(monkeypatch)
    _site(db)
    bad = client.post(
        "/sites/inc_karimun/alerts/alert_1/dismiss",
        headers=AUTH,
        json={},
    )
    assert bad.status_code == 400
    response = client.post(
        "/sites/inc_karimun/alerts/alert_1/dismiss",
        headers=AUTH,
        json={"reason": "Trash fire, already checked"},
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["dismissed"] is True
    audit = db.data["audit"][body["auditId"]]
    assert audit["action"] == "site.dismiss"
    assert audit["targetId"] == "inc_karimun"
    assert audit["actorId"] == "uid_maya"
    assert db.data["sites"]["inc_karimun"]["alerts"][0]["dismissReason"] == "Trash fire, already checked"
    assert db.data["incidents"]["inc_karimun"]["status"] == "extinguished"
    assert client.get("/dashboard", headers=AUTH).get_json()["reignitionAlert"] is None


def test_send_recheck_creates_proposed_verify_without_reopening(client, monkeypatch, db):
    _as(monkeypatch)
    _site(db)
    response = client.post("/sites/inc_karimun/alerts/alert_1/recheck", headers=AUTH)
    assert response.status_code == 200
    body = response.get_json()
    task = body["task"]
    assert task["type"] == "verify"
    assert task["status"] == "proposed"
    assert task["incidentId"] == "inc_karimun"
    assert task["volunteerId"] == "uid_sari"
    assert body["alert"]["taskId"] == task["id"]
    assert db.data["audit"][body["auditId"]]["action"] == "site.recheck"
    assert db.data["incidents"]["inc_karimun"]["status"] == "extinguished"
    alert = client.get("/dashboard", headers=AUTH).get_json()["reignitionAlert"]
    assert alert["taskId"] == task["id"]


def test_volunteer_cannot_dismiss_or_recheck(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    _site(db)
    assert client.post(
        "/sites/inc_karimun/alerts/alert_1/dismiss",
        headers=AUTH,
        json={"reason": "no"},
    ).status_code == 403
    assert client.post("/sites/inc_karimun/alerts/alert_1/recheck", headers=AUTH).status_code == 403
