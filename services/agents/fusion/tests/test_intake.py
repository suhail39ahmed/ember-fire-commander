import pytest

import fusion.intake
from app import app
from fusion.store import MemoryFusionStore


@pytest.fixture
def store(monkeypatch):
    memory = MemoryFusionStore()
    monkeypatch.setattr(fusion.intake, "get_store", lambda: memory)
    return memory


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _seed(store, oid, volunteer, severity, lat=1.482):
    store.collections["observations"][oid] = {
        "volunteerId": volunteer, "source": "chip", "severity": severity, "lat": lat,
        "lng": 102.115, "accuracyM": 18, "chip": None, "text": None, "photoPath": None,
        "capturedAt": "2026-10-13T08:12:00Z", "receivedAt": "2026-10-13T08:12:02Z",
        "immutable": True,
    }


def _intake(client, oid):
    # Same shape notify.py sends: POST, empty body, JSON content type.
    return client.post(
        f"/internal/observations/{oid}/intake",
        data=b"",
        headers={"Content-Type": "application/json", "Authorization": "Bearer x"},
    )


def test_worked_path_from_contract(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _seed(store, "obs_02", "uid_rizal", "none")
    _seed(store, "obs_03", "uid_sari", "large_flame")

    response = _intake(client, "obs_01")
    assert response.status_code == 202
    assert response.get_json() == {"observationId": "obs_01"}
    assert _intake(client, "obs_02").status_code == 202

    [incident] = store.collections["incidents"].values()
    [conflict] = store.collections["conflicts"].values()
    assert incident["status"] == "held"
    assert incident["severity"] == "small_flame"
    assert incident["observationIds"] == ["obs_01", "obs_02"]
    assert set(conflict["observationIds"]) == {"obs_01", "obs_02"}
    verify = [t for t in store.collections["tasks"].values() if t["type"] == "verify"]
    assert len(verify) == 2

    assert _intake(client, "obs_03").status_code == 202
    [incident] = store.collections["incidents"].values()
    assert incident["withdraw"]["active"] is True
    assert incident["withdraw"]["volunteerIds"] == ["uid_rizal", "uid_sari"]
    withdraw = [t for t in store.collections["tasks"].values() if t["type"] == "withdraw"]
    assert sorted(t["volunteerId"] for t in withdraw) == ["uid_rizal", "uid_sari"]
    assert all(t["status"] == "approved" for t in withdraw)
    audits = [a for a in store.collections["audit"].values() if a["action"] == "task.withdraw"]
    assert len(audits) == 1 and audits[0]["actorId"] == "code"
    # observations are never rewritten
    assert store.collections["observations"]["obs_02"]["severity"] == "none"


def test_wind_from_weather_doc(client, store):
    store.collections["weather"]["current"] = {"windKmh": 55}
    _seed(store, "obs_01", "uid_sari", "smoke")
    assert _intake(client, "obs_01").status_code == 202
    [incident] = store.collections["incidents"].values()
    assert incident["withdraw"]["active"] is True


def test_repeat_intake_does_not_double_write(client, store):
    _seed(store, "obs_01", "uid_sari", "large_flame")
    _intake(client, "obs_01")
    _intake(client, "obs_01")
    assert len(store.collections["incidents"]) == 1
    assert len(store.collections["tasks"]) == 1
    assert len(store.collections["audit"]) == 1


def test_unknown_observation_is_404(client, store):
    response = _intake(client, "missing")
    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "not_found"


def test_get_is_not_allowed(client, store):
    assert client.get("/internal/observations/obs_01/intake").status_code == 405


def test_healthz_still_public(client):
    assert client.get("/healthz").status_code == 200
