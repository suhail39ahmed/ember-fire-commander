"""Nearby digest, join, and en-route (#134 / #135)."""
import pytest

import identity
from app import app
from incidents import members, store
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
    # Volunteer is on inc_mine via a task. Nearby fire is separate.
    fake.add("incidents", "inc_mine", {
        "name": "TOHOR-1 · Desa Tohor · #1", "area": "Desa Tohor",
        "status": "open", "severity": "smoke", "lat": 1.48, "lng": 102.11, "withdraw": None,
        "observationIds": [],
    })
    fake.add("incidents", "inc_near", {
        "name": "TOHOR-3 · Peat field · #3", "area": "Peat field behind SDN 2",
        "status": "open", "severity": "small_flame", "lat": 1.49, "lng": 102.12, "withdraw": None,
        "observationIds": ["obs_other"],
    })
    fake.add("incidents", "inc_far", {
        "name": "FAR-1", "area": "Far", "status": "open", "severity": "smoke",
        "lat": 2.5, "lng": 103.5, "withdraw": None, "observationIds": [],
    })
    fake.add("incidents", "inc_out", {
        "name": "OUT-1", "area": "Out", "status": "extinguished", "severity": "none",
        "lat": 1.49, "lng": 102.12, "withdraw": None, "observationIds": [],
    })
    fake.add("observations", "obs_other", {
        "volunteerId": "uid_sari", "lat": 1.49, "lng": 102.12, "severity": "small_flame",
    })
    fake.add("tasks", "task_mine", {
        "incidentId": "inc_mine", "volunteerId": "uid_dedi", "type": "verify",
        "status": "approved", "instruction": "Check the ditch",
    })
    fake.add("volunteers", "uid_dedi", {"displayName": "Pak Dedi"})
    return fake


def _as(monkeypatch, role="volunteer", uid="uid_dedi", name="Pak Dedi"):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": uid, "name": name, "role": role})


def test_nearby_empty_without_position(client, db, monkeypatch):
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH).get_json()
    assert body["nearby"] == []
    assert [i["id"] for i in body["incidents"]] == ["inc_mine"]


def test_nearby_closest_live_not_already_joined(client, db, monkeypatch):
    _as(monkeypatch)
    # Phone near both fires; only the one they are not on appears.
    body = client.get("/digest?lat=1.485&lng=102.115", headers=AUTH).get_json()
    assert [n["id"] for n in body["nearby"]] == ["inc_near"]
    near = body["nearby"][0]
    assert near["distanceM"] > 0
    assert isinstance(near["bearingDeg"], int)
    assert near["crewOnSite"] == 1  # obs_other's volunteer
    assert near["ask"] is None
    assert near["severity"] == "small_flame"


def test_join_adds_member_and_opens_incident(client, db, monkeypatch):
    _as(monkeypatch)
    first = client.post("/incidents/inc_near/join", headers=AUTH)
    assert first.status_code == 200
    body = first.get_json()
    assert body["membership"]["volunteerId"] == "uid_dedi"
    assert body["membership"]["addedBy"] == "uid_dedi"
    assert body["membership"]["joinedAt"]
    assert body["membership"]["enRouteAt"] is None
    assert body["auditId"]
    # Idempotent.
    again = client.post("/incidents/inc_near/join", headers=AUTH)
    assert again.status_code == 200
    assert again.get_json()["auditId"] is None
    # Now in digest incidents, not nearby.
    digest = client.get("/digest?lat=1.485&lng=102.115", headers=AUTH).get_json()
    assert "inc_near" in {i["id"] for i in digest["incidents"]}
    assert digest["nearby"] == []
    detail = client.get("/incidents/inc_near", headers=AUTH).get_json()
    assert detail["membership"]["joinedAt"] == body["membership"]["joinedAt"]


def test_join_refuses_extinguished_and_unknown(client, db, monkeypatch):
    _as(monkeypatch)
    assert client.post("/incidents/inc_out/join", headers=AUTH).status_code == 409
    assert client.post("/incidents/missing/join", headers=AUTH).status_code == 404


def test_en_route_persists(client, db, monkeypatch):
    _as(monkeypatch)
    client.post("/incidents/inc_near/join", headers=AUTH)
    first = client.post("/incidents/inc_near/en-route", headers=AUTH)
    assert first.status_code == 200
    at = first.get_json()["membership"]["enRouteAt"]
    assert at
    assert first.get_json()["auditId"]
    again = client.post("/incidents/inc_near/en-route", headers=AUTH)
    assert again.get_json()["membership"]["enRouteAt"] == at
    assert again.get_json()["auditId"] is None
    detail = client.get("/incidents/inc_near", headers=AUTH).get_json()
    assert detail["membership"]["enRouteAt"] == at


def test_supervisor_cannot_join(client, db, monkeypatch):
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")
    assert client.post("/incidents/inc_near/join", headers=AUTH).status_code == 403


def test_bearing_and_distance_helpers():
    assert members.bearing_deg(0, 0, 0, 1) == 90
    assert members.parse_position({"lat": "1.5", "lng": "102.1"}) == (1.5, 102.1)
    assert members.parse_position({}) is None
    assert members.parse_position({"lat": "99", "lng": "0"}) is None
