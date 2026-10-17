"""GET /digest?lat=&lng= : live incidents near the phone, for the volunteer home screen."""
import pytest

import identity
from app import app
from incidents import nearby, store
from incidents.fake_firestore import FakeFirestore

AUTH = {"Authorization": "Bearer valid"}
# The phone is at 1.4800, 102.1100. One degree of latitude is about 111 km.
HERE = {"lat": "1.48", "lng": "102.11"}


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
    fake.add("observations", "obs_rizal", {
        "volunteerId": "uid_rizal", "volunteerName": "Rizal", "capturedAt": "2026-10-16T08:00:00Z", "chip": "api",
    })
    fake.add("observations", "obs_dewi", {
        "volunteerId": "uid_dewi", "capturedAt": "2026-10-16T08:05:00Z", "chip": "api",
    })
    # About 1.1 km north of the phone.
    fake.add("incidents", "inc_north", {
        "name": "Bengkalis · Rizal · #1", "area": "Bengkalis", "status": "open", "severity": "small_flame",
        "withdraw": None, "lat": 1.49, "lng": 102.11, "observationIds": ["obs_rizal", "obs_dewi"],
    })
    # About 3.3 km east of the phone.
    fake.add("incidents", "inc_east", {
        "status": "verified", "severity": "smoke", "withdraw": None, "lat": 1.48, "lng": 102.14, "observationIds": [],
    })
    # About 55 km away.
    fake.add("incidents", "inc_far", {"status": "open", "severity": "smoke", "withdraw": None, "lat": 1.98, "lng": 102.11})
    fake.add("incidents", "inc_out", {"status": "extinguished", "severity": "none", "withdraw": None, "lat": 1.481, "lng": 102.11})
    fake.add("volunteers", "uid_dewi", {"displayName": "Dewi"})
    fake.add("tasks", "task_rizal", {"incidentId": "inc_north", "volunteerId": "uid_rizal", "type": "verify", "status": "approved"})
    fake.add("tasks", "task_asked", {"incidentId": "inc_north", "volunteerId": "uid_asked", "type": "verify", "status": "proposed"})
    return fake


def _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari"):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": uid, "name": name, "role": role})


def test_bearing_is_a_compass_direction():
    assert nearby.bearing_deg(0, 0, 1, 0) == 0
    assert nearby.bearing_deg(0, 0, 0, 1) == 90
    assert nearby.bearing_deg(0, 0, -1, 0) == 180
    assert nearby.bearing_deg(0, 0, 0, -1) == 270


def test_without_a_position_nearby_is_empty(client, db, monkeypatch):
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH).get_json()
    assert body["nearby"] == []
    assert body["myJoinRequests"] == []


def test_a_volunteer_gets_live_incidents_nearest_first(client, db, monkeypatch):
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH, query_string=HERE).get_json()
    assert [i["id"] for i in body["nearby"]] == ["inc_north", "inc_east"]
    north = body["nearby"][0]
    assert 1000 < north["distanceM"] < 1200
    assert north["bearingDeg"] == 0
    assert north["name"] == "Bengkalis · Rizal · #1"
    assert north["area"] == "Bengkalis"
    assert north["status"] == "open"
    assert {"distanceM", "bearingDeg", "crewOnSite", "reporterName"} <= set(north)
    assert 3000 < body["nearby"][1]["distanceM"] < 3600
    assert body["nearby"][1]["bearingDeg"] == 90


def test_crew_and_reporter_come_from_reports_and_approved_tasks(client, db, monkeypatch):
    _as(monkeypatch)
    north, east = client.get("/digest", headers=AUTH, query_string=HERE).get_json()["nearby"]
    # Rizal and Dewi reported. Rizal's approved task adds nobody. A proposed task is not a person on site.
    assert north["crewOnSite"] == 2
    assert north["reporterName"] == "Rizal"
    assert east["crewOnSite"] == 0
    assert east["reporterName"] is None


def test_the_reporter_falls_back_to_the_volunteer_profile(client, db, monkeypatch):
    db.data["observations"]["obs_rizal"]["capturedAt"] = "2026-10-16T09:00:00Z"
    db.data["observations"]["obs_rizal"].pop("volunteerName")
    _as(monkeypatch)
    north = client.get("/digest", headers=AUTH, query_string=HERE).get_json()["nearby"][0]
    assert north["reporterName"] == "Dewi"


def test_incidents_the_volunteer_is_on_are_not_nearby(client, db, monkeypatch):
    db.add("tasks", "task_sari", {"incidentId": "inc_north", "volunteerId": "uid_sari", "type": "verify", "status": "approved"})
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH, query_string=HERE).get_json()
    assert [i["id"] for i in body["nearby"]] == ["inc_east"]
    assert [i["id"] for i in body["incidents"]] == ["inc_north"]


def test_the_radius_comes_from_the_environment(client, db, monkeypatch):
    monkeypatch.setenv("EMBER_NEARBY_RADIUS_M", "2000")
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH, query_string=HERE).get_json()
    assert [i["id"] for i in body["nearby"]] == ["inc_north"]


def test_a_bad_radius_setting_uses_the_default(monkeypatch):
    for bad in ("far", "0", "-5"):
        monkeypatch.setenv("EMBER_NEARBY_RADIUS_M", bad)
        assert nearby.radius_m() == nearby.DEFAULT_RADIUS_M


def test_at_most_five_are_returned(client, db, monkeypatch):
    for index in range(8):
        db.add("incidents", f"inc_more_{index}", {
            "status": "open", "severity": "smoke", "withdraw": None, "lat": 1.4801 + index * 0.001, "lng": 102.11,
        })
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH, query_string=HERE).get_json()
    assert len(body["nearby"]) == 5
    distances = [i["distanceM"] for i in body["nearby"]]
    assert distances == sorted(distances)


@pytest.mark.parametrize("query,field", [
    ({"lat": "1.48"}, "lng"),
    ({"lng": "102.1"}, "lat"),
    ({"lat": "north", "lng": "102.1"}, "lat"),
    ({"lat": "1.48", "lng": "nan"}, "lng"),
    ({"lat": "91", "lng": "102.1"}, "lat"),
    ({"lat": "1.48", "lng": "-181"}, "lng"),
])
def test_a_bad_position_is_a_400(client, db, monkeypatch, query, field):
    _as(monkeypatch)
    response = client.get("/digest", headers=AUTH, query_string=query)
    assert response.status_code == 400
    assert field in response.get_json()["error"]["fields"]


def test_the_position_is_never_stored(client, db, monkeypatch):
    _as(monkeypatch)
    client.get("/digest", headers=AUTH, query_string=HERE)
    assert "uid_sari" not in db.data.get("volunteers", {})
    assert db.data.get("audit", {}) == {}


def test_a_supervisor_digest_is_unchanged(client, db, monkeypatch):
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")
    body = client.get("/digest", headers=AUTH, query_string=HERE).get_json()
    assert set(body) == {"updatedAt", "incidents", "myTasks"}
    assert body["myTasks"] == []


def test_my_join_requests_list_only_the_callers_newest_first(client, db, monkeypatch):
    db.add("joinRequests", "inc_east__uid_sari", {
        "incidentId": "inc_east", "volunteerId": "uid_sari", "status": "pending", "createdAt": "2026-10-16T08:10:00.000Z",
    })
    db.add("joinRequests", "inc_north__uid_sari", {
        "incidentId": "inc_north", "volunteerId": "uid_sari", "status": "declined", "createdAt": "2026-10-16T08:20:00.000Z",
    })
    db.add("joinRequests", "inc_east__uid_other", {
        "incidentId": "inc_east", "volunteerId": "uid_other", "status": "pending", "createdAt": "2026-10-16T08:30:00.000Z",
    })
    _as(monkeypatch)
    body = client.get("/digest", headers=AUTH).get_json()
    assert body["myJoinRequests"] == [
        {"incidentId": "inc_north", "status": "declined", "createdAt": "2026-10-16T08:20:00.000Z"},
        {"incidentId": "inc_east", "status": "pending", "createdAt": "2026-10-16T08:10:00.000Z"},
    ]
