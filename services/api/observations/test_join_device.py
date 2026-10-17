"""What POST /observations says about where a report went (#131, #132), and the device context a phone may send."""
from datetime import datetime, timezone

import pytest

import identity
from app import app
from incidents.fake_firestore import FakeFirestore
from observations.store import FirestoreObservationStore, MemoryObservationStore, join_view, observation_id_for
from observations.validate import prepare_observation

CHIP_BODY = {
    "source": "chip",
    "capturedAt": "2026-10-13T08:12:00Z",
    "lat": 1.482,
    "lng": 102.115,
    "accuracyM": 18,
    "chip": "api",
    "text": None,
    "clientId": "ob-7f3a",
}
NOW = datetime(2026, 10, 14, 12, 0, 0, tzinfo=timezone.utc)
JOIN = {
    "id": "x", "observationId": "x", "incidentId": "inc_01", "joined": True,
    "nearbyCount": 2, "nearestM": 85, "radiusM": 300.0, "at": "2026-10-13T08:12:05.000Z",
}


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    monkeypatch.setattr("observations.validate._now", lambda: NOW)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def store(monkeypatch):
    memory = MemoryObservationStore()
    monkeypatch.setattr("observations.routes.get_store", lambda: memory)
    return memory


@pytest.fixture(autouse=True)
def signed_in(monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": "uid_sari", "name": "Sari", "role": "volunteer"})


def _post(client, body):
    return client.post("/observations", json=body, headers={"Authorization": "Bearer valid"})


def _place(store, incident=None):
    """Agents has placed the report sent with CHIP_BODY."""
    oid = observation_id_for("uid_sari", "ob-7f3a")
    store.joins[oid] = dict(JOIN, id=oid, observationId=oid)
    store.incidents["inc_01"] = incident if incident is not None else {"name": "Bengkalis, Riau · Sari · #1", "area": "Bengkalis, Riau"}


# The join in the create response ------------------------------------------------------

def test_a_report_agents_has_placed_carries_the_join(client, store):
    _place(store)
    body = _post(client, CHIP_BODY).get_json()
    assert body["join"] == {
        "incidentId": "inc_01", "incidentName": "Bengkalis, Riau · Sari · #1", "incidentArea": "Bengkalis, Riau",
        "joined": True, "nearbyCount": 2, "nearestM": 85, "radiusM": 300.0,
    }


def test_a_new_incident_says_nothing_was_close(client, store):
    oid = observation_id_for("uid_sari", "ob-7f3a")
    store.joins[oid] = dict(JOIN, joined=False, nearbyCount=0, nearestM=None)
    store.incidents["inc_01"] = {}
    join = _post(client, CHIP_BODY).get_json()["join"]
    assert (join["joined"], join["nearbyCount"], join["nearestM"], join["radiusM"]) == (False, 0, None, 300.0)
    assert (join["incidentName"], join["incidentArea"]) == (None, None)


def test_a_report_agents_has_not_placed_has_no_join_key(client, store):
    body = _post(client, CHIP_BODY).get_json()
    assert "join" not in body


def test_a_replay_returns_the_join_too(client, store):
    first = _post(client, CHIP_BODY)
    assert first.status_code == 201 and "join" not in first.get_json()
    _place(store)
    replay = _post(client, CHIP_BODY)
    assert replay.status_code == 200
    assert replay.get_json()["join"]["incidentId"] == "inc_01"


def test_a_failed_join_read_never_fails_the_report(client, store, monkeypatch):
    def broken(observation_id):
        raise RuntimeError("firestore unavailable")
    monkeypatch.setattr(store, "get_join", broken)
    response = _post(client, CHIP_BODY)
    assert response.status_code == 201
    assert "join" not in response.get_json()


def test_the_join_is_not_stored_on_the_observation(client, store):
    _place(store)
    body = _post(client, CHIP_BODY).get_json()
    assert "join" not in store.get(body["id"])


def test_join_view_is_none_without_a_record_or_an_incident_id():
    assert join_view(None, {}) is None
    assert join_view({"joined": True}, {}) is None


def test_join_view_never_passes_on_a_value_of_the_wrong_type():
    view = join_view({"incidentId": "i", "joined": 1, "nearbyCount": "3", "nearestM": "x", "radiusM": None}, {"name": 5, "area": ["x"]})
    assert view == {"incidentId": "i", "incidentName": None, "incidentArea": None, "joined": True, "nearbyCount": 0, "nearestM": None, "radiusM": None}


def test_the_firestore_store_reads_the_join_and_its_incident():
    fake = FakeFirestore()
    fake.add("observation_joins", "obs_1", dict(JOIN, id="obs_1"))
    fake.add("incidents", "inc_01", {"name": "Bengkalis, Riau · Sari · #1", "area": "Bengkalis, Riau"})
    store = FirestoreObservationStore(client=fake)
    assert store.get_join("obs_1")["incidentName"] == "Bengkalis, Riau · Sari · #1"
    assert store.get_join("obs_missing") is None


def test_the_firestore_store_keeps_the_join_when_the_incident_is_gone():
    fake = FakeFirestore()
    fake.add("observation_joins", "obs_1", dict(JOIN, id="obs_1"))
    join = FirestoreObservationStore(client=fake).get_join("obs_1")
    assert (join["incidentId"], join["incidentName"]) == ("inc_01", None)


# Device context ------------------------------------------------------------------------

def test_a_phone_may_send_battery_network_and_language(client, store):
    body = _post(client, dict(CHIP_BODY, device={"batteryPct": 64, "network": "4g", "language": "id"})).get_json()
    assert body["device"] == {"batteryPct": 64, "network": "4g", "language": "id"}
    assert store.get(body["id"])["device"] == {"batteryPct": 64, "network": "4g", "language": "id"}


def test_a_report_without_device_context_stores_none(client, store):
    body = _post(client, CHIP_BODY).get_json()
    assert "device" not in body


def test_unusable_device_parts_are_left_out_and_the_report_still_stores(client, store):
    response = _post(client, dict(CHIP_BODY, device={"batteryPct": 140, "network": "lte", "language": "fr", "imei": "123"}))
    assert response.status_code == 201
    assert "device" not in response.get_json()


def test_a_usable_part_survives_next_to_an_unusable_one(client, store):
    body = _post(client, dict(CHIP_BODY, device={"batteryPct": "full", "network": "wifi", "tokens": ["x"]})).get_json()
    assert body["device"] == {"network": "wifi"}


@pytest.mark.parametrize("device", [None, "4g", 5, [], {}, {"batteryPct": True}, {"batteryPct": -1}, {"batteryPct": float("nan")}])
def test_a_malformed_device_is_ignored_not_refused(device):
    prepared = prepare_observation(dict(CHIP_BODY, device=device))
    assert prepared["device"] is None


def test_battery_is_rounded_to_a_whole_percent():
    assert prepare_observation(dict(CHIP_BODY, device={"batteryPct": 63.6}))["device"] == {"batteryPct": 64}
    assert prepare_observation(dict(CHIP_BODY, device={"batteryPct": 0}))["device"] == {"batteryPct": 0}
    assert prepare_observation(dict(CHIP_BODY, device={"batteryPct": 100}))["device"] == {"batteryPct": 100}
