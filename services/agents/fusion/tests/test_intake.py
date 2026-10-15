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


def _names(store):
    return sorted(i["name"] for i in store.collections["incidents"].values())


def test_new_incident_is_named_from_place_reporter_and_number(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    store.collections["observations"]["obs_01"]["volunteerName"] = "Pak Dedi"
    assert _intake(client, "obs_01").status_code == 202
    assert _names(store) == ["Bengkalis, Riau · Pak Dedi · #1"]


def test_numbers_are_sequential_across_incidents(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _seed(store, "obs_02", "uid_rizal", "smoke", lat=1.60)
    _seed(store, "obs_03", "uid_sari", "smoke", lat=1.70)
    for oid in ("obs_01", "obs_02", "obs_03"):
        assert _intake(client, oid).status_code == 202
    assert sorted(int(n.rsplit("#", 1)[1]) for n in _names(store)) == [1, 2, 3]


def test_second_report_keeps_the_incident_name(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _seed(store, "obs_02", "uid_rizal", "small_flame")
    store.collections["observations"]["obs_01"]["volunteerName"] = "Sari"
    store.collections["observations"]["obs_02"]["volunteerName"] = "Rizal"
    _intake(client, "obs_01")
    _intake(client, "obs_02")
    [incident] = store.collections["incidents"].values()
    assert incident["observationIds"] == ["obs_01", "obs_02"]
    assert incident["name"] == "Bengkalis, Riau · Sari · #1"
    assert store.collections["counters"]["incidents"]["value"] == 1


def test_repeat_intake_does_not_use_a_number(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _intake(client, "obs_01")
    _intake(client, "obs_01")
    assert store.collections["counters"]["incidents"]["value"] == 1


def test_reporter_name_falls_back_to_the_volunteer_record(client, store):
    store.collections["volunteers"]["uid_sari"] = {"displayName": "Sari", "fcmTokens": []}
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _intake(client, "obs_01")
    assert _names(store) == ["Bengkalis, Riau · Sari · #1"]


def test_no_reporter_name_leaves_place_and_number(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _intake(client, "obs_01")
    assert _names(store) == ["Bengkalis, Riau · #1"]


def test_unknown_area_uses_a_coordinate_label(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame", lat=10.0)
    _intake(client, "obs_01")
    assert _names(store) == ["10.00°N 102.11°E · #1"]


def test_failed_name_lookup_is_not_fatal(client, store, monkeypatch):
    def broken(volunteer_id):
        raise RuntimeError("volunteers unavailable")
    monkeypatch.setattr(store, "volunteer_name", broken)
    _seed(store, "obs_01", "uid_sari", "small_flame")
    assert _intake(client, "obs_01").status_code == 202
    assert _names(store) == ["Bengkalis, Riau · #1"]


def test_counter_failure_still_creates_the_incident(client, store, monkeypatch):
    def broken():
        raise RuntimeError("counter unavailable")
    monkeypatch.setattr(store, "next_incident_number", broken)
    _seed(store, "obs_01", "uid_sari", "large_flame")
    assert _intake(client, "obs_01").status_code == 202
    [incident] = store.collections["incidents"].values()
    assert "name" not in incident
    assert incident["withdraw"]["active"] is True
    assert len(store.collections["tasks"]) == 1


def test_incidents_that_predate_names_are_left_alone(client, store):
    store.collections["incidents"]["inc_old"] = {
        "id": "inc_old", "status": "open", "severity": "small_flame", "evidenceScore": 41,
        "conflictId": None, "withdraw": None, "lat": 1.482, "lng": 102.115,
        "observationIds": ["obs_00"], "evidenceFactors": [],
    }
    _seed(store, "obs_00", "uid_sari", "small_flame")
    _seed(store, "obs_01", "uid_rizal", "small_flame")
    _intake(client, "obs_01")
    assert "name" not in store.collections["incidents"]["inc_old"]
    assert store.collections["counters"] == {}


def test_new_incident_stores_its_area(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _intake(client, "obs_01")
    [incident] = store.collections["incidents"].values()
    assert incident["area"] == "Bengkalis, Riau"
    assert incident["name"].startswith(incident["area"] + " · ")


def test_area_is_a_coordinate_label_far_from_every_town(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame", lat=10.0)
    _intake(client, "obs_01")
    [incident] = store.collections["incidents"].values()
    assert incident["area"] == "10.00°N 102.11°E"


def test_area_is_stored_even_when_naming_fails(client, store, monkeypatch):
    def broken():
        raise RuntimeError("counter unavailable")
    monkeypatch.setattr(store, "next_incident_number", broken)
    _seed(store, "obs_01", "uid_sari", "small_flame")
    assert _intake(client, "obs_01").status_code == 202
    [incident] = store.collections["incidents"].values()
    assert incident["area"] == "Bengkalis, Riau"
    assert "name" not in incident


def test_later_report_keeps_the_area(client, store):
    _seed(store, "obs_01", "uid_sari", "small_flame")
    _seed(store, "obs_02", "uid_rizal", "small_flame")
    _intake(client, "obs_01")
    _intake(client, "obs_02")
    [incident] = store.collections["incidents"].values()
    assert incident["area"] == "Bengkalis, Riau"
