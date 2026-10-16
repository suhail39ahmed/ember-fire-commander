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
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    fake.add("observations", "obs_sari", {
        "volunteerId": "uid_sari", "capturedAt": "2026-10-16T14:19:00Z",
        "receivedAt": "2026-10-16T14:19:02Z", "source": "live", "lat": -1.1,
        "lng": 102.5, "accuracyM": 18, "chip": None, "text": "north side",
        "severity": "small_flame", "photoPath": None, "immutable": True,
        "volunteerName": "Sari",
    })
    fake.add("observations", "obs_rizal", {
        "volunteerId": "uid_rizal", "capturedAt": "2026-10-16T14:15:00Z",
        "receivedAt": "2026-10-16T14:15:02Z", "source": "chip", "lat": -1.1,
        "lng": 102.5, "accuracyM": 20, "chip": "api", "text": None,
        "severity": "smoke", "photoPath": None, "immutable": True,
        "volunteerName": "Rizal",
    })
    fake.add("incidents", "inc_tohor", {
        "status": "verified", "severity": "small_flame", "evidenceScore": 40,
        "conflictId": None, "withdraw": None, "lat": -1.1, "lng": 102.5,
        "observationIds": ["obs_sari", "obs_rizal"],
        "name": "TOHOR-3 · Peat field",
    })
    return fake


def _as(monkeypatch, role="supervisor", uid="uid_maya"):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": uid, "name": "Bu Maya", "role": role},
    )


AUTH = {"Authorization": "Bearer valid"}


def _seed_seat(db, over=None):
    seat = {
        "incidentId": "inc_tohor",
        "status": "free",
        "holderId": None,
        "updatedAt": "2026-10-16T14:31:00Z",
        "lastDrop": {
            "volunteerId": "uid_sari",
            "at": "2026-10-16T14:31:00Z",
            "reason": "signal_below_3g",
            "signal": "2g",
        },
        "volunteers": {
            "uid_sari": {
                "signal": "2g",
                "media": "photo_60s",
                "updatedAt": "2026-10-16T14:31:00Z",
            },
            "uid_rizal": {
                "signal": "4g",
                "media": "none",
                "updatedAt": "2026-10-16T14:30:00Z",
            },
        },
    }
    if over:
        seat.update(over)
    db.add("liveSeats", "inc_tohor", seat)
    return seat


def test_detail_includes_live_seat_for_supervisor(client, monkeypatch, db):
    _as(monkeypatch)
    _seed_seat(db)
    body = client.get("/incidents/inc_tohor", headers=AUTH).get_json()
    seat = body["liveSeat"]
    assert seat["status"] == "free"
    assert seat["holderId"] is None
    assert seat["lastDrop"]["volunteerId"] == "uid_sari"
    assert seat["lastDrop"]["volunteerName"] == "Sari"
    assert seat["lastDrop"]["reason"] == "signal_below_3g"
    assert seat["lastDrop"]["signal"] == "2g"
    assert seat["volunteers"]["uid_sari"]["media"] == "photo_60s"
    assert seat["volunteers"]["uid_sari"]["photoCadence"] == "every_60s"
    assert seat["volunteers"]["uid_sari"]["canRetry"] is False
    assert seat["volunteers"]["uid_rizal"]["canMakeLive"] is True


def test_volunteer_detail_has_no_live_seat(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    _seed_seat(db)
    body = client.get("/incidents/inc_tohor", headers=AUTH).get_json()
    assert "liveSeat" not in body


def test_make_live_holds_seat_when_signal_is_good(client, monkeypatch, db):
    _as(monkeypatch)
    _seed_seat(db)
    response = client.post(
        "/incidents/inc_tohor/live/make-live",
        headers=AUTH,
        json={"volunteerId": "uid_rizal"},
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["liveSeat"]["status"] == "held"
    assert body["liveSeat"]["holderId"] == "uid_rizal"
    assert body["liveSeat"]["volunteers"]["uid_rizal"]["media"] == "live"
    assert db.data["audit"][body["auditId"]]["action"] == "live.make"
    assert db.data["incidents"]["inc_tohor"]["status"] == "verified"


def test_retry_stays_unavailable_below_3g(client, monkeypatch, db):
    _as(monkeypatch)
    _seed_seat(db)
    response = client.post(
        "/incidents/inc_tohor/live/retry",
        headers=AUTH,
        json={"volunteerId": "uid_sari"},
    )
    assert response.status_code == 409
    assert "3G" in response.get_json()["error"]["message"]
    assert db.data["liveSeats"]["inc_tohor"]["holderId"] is None


def test_retry_holds_seat_when_signal_recovers(client, monkeypatch, db):
    _as(monkeypatch)
    _seed_seat(db)
    db.data["liveSeats"]["inc_tohor"]["volunteers"]["uid_sari"]["signal"] = "3g"
    response = client.post(
        "/incidents/inc_tohor/live/retry",
        headers=AUTH,
        json={"volunteerId": "uid_sari"},
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["liveSeat"]["holderId"] == "uid_sari"
    assert body["liveSeat"]["volunteers"]["uid_sari"]["media"] == "live"
    assert db.data["audit"][body["auditId"]]["action"] == "live.retry"


def test_make_live_conflicts_when_seat_held(client, monkeypatch, db):
    _as(monkeypatch)
    _seed_seat(db, {
        "status": "held",
        "holderId": "uid_sari",
        "volunteers": {
            "uid_sari": {"signal": "4g", "media": "live", "updatedAt": "2026-10-16T14:32:00Z"},
            "uid_rizal": {"signal": "4g", "media": "none", "updatedAt": "2026-10-16T14:30:00Z"},
        },
    })
    response = client.post(
        "/incidents/inc_tohor/live/make-live",
        headers=AUTH,
        json={"volunteerId": "uid_rizal"},
    )
    assert response.status_code == 409
    assert db.data["liveSeats"]["inc_tohor"]["holderId"] == "uid_sari"


def test_volunteer_cannot_make_live(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    _seed_seat(db)
    assert client.post(
        "/incidents/inc_tohor/live/make-live",
        headers=AUTH,
        json={"volunteerId": "uid_rizal"},
    ).status_code == 403


def test_empty_seat_when_none_stored(client, monkeypatch, db):
    _as(monkeypatch)
    seat = client.get("/incidents/inc_tohor", headers=AUTH).get_json()["liveSeat"]
    assert seat == {
        "incidentId": "inc_tohor",
        "status": "free",
        "holderId": None,
        "holderName": None,
        "lastDrop": None,
        "volunteers": {},
    }
