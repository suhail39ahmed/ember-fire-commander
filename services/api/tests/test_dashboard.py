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
        "updatedAt": "2026-10-16T07:46:00Z",
        "nextSatellitePass": None,
        "liveFires": [],
        "seasonImpact": {
            "since": None,
            "region": None,
            "crewCount": None,
            "firesContained": None,
            "firesContainedNote": None,
            "falseAlarmsCleared": None,
            "falseAlarmsNote": None,
            "injuries": None,
            "injuriesNote": None,
            "medianTimeToHumanCheck": None,
            "medianTimeNote": None,
            "reignitionsCaught": None,
            "reignitionsNote": None,
        },
        "charts": {
            "satelliteNote": None,
            "realFires": None,
            "dismissed": None,
            "medianNote": None,
            "medianToday": None,
            "medianTarget": None,
            "crewNote": None,
            "onSite": None,
            "enRoute": None,
            "ready": None,
            "offline": None,
            "weatherNote": None,
            "airTempC": None,
            "humidity": None,
            "wind": None,
            "rain": None,
        },
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


def _incident(db, incident_id, status, **extra):
    db.add("incidents", incident_id, {"status": status, **extra})


def test_live_banner_uses_open_held_and_verified(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(rules, "now_iso", lambda: "2026-10-16T07:46:00Z")
    _as(monkeypatch)
    _incident(fake, "inc_b", "open", observationIds=["obs_1", "obs_1b"], name="Ketapang", area="Riau")
    _incident(fake, "inc_a", "held", conflictId="con_1", withdraw={"active": True})
    _incident(fake, "inc_c", "verified")
    _incident(fake, "inc_out", "extinguished", observationIds=["obs_gone"])
    fake.add("observations", "obs_1", {"volunteerId": "uid_sari"})
    fake.add("observations", "obs_1b", {"volunteerId": "uid_sari"})
    fake.add("observations", "obs_task", {"volunteerId": "uid_dedi"})
    fake.add("observations", "obs_conflict", {"volunteerId": "uid_rina"})
    fake.add("observations", "obs_gone", {"volunteerId": "uid_gone"})
    fake.add("conflicts", "con_1", {"observationIds": ["obs_conflict"]})
    fake.add("tasks", "task_on_b", {
        "incidentId": "inc_b", "volunteerId": "uid_dedi", "type": "verify", "status": "approved",
    })
    fake.add("tasks", "task_same_person", {
        "incidentId": "inc_b", "volunteerId": "uid_sari", "type": "verify", "status": "approved",
    })
    fake.add("tasks", "task_elsewhere", {
        "incidentId": "inc_c", "volunteerId": "uid_other", "type": "verify", "status": "proposed",
    })

    body = client.get("/dashboard", headers=AUTH).get_json()
    assert body["updatedAt"] == "2026-10-16T07:46:00Z"
    assert body["nextSatellitePass"] is None
    assert [fire["id"] for fire in body["liveFires"]] == ["inc_a", "inc_b", "inc_c"]
    by_id = {fire["id"]: fire for fire in body["liveFires"]}
    assert by_id["inc_b"]["peopleOnSite"] == 2
    assert by_id["inc_a"]["peopleOnSite"] == 1
    assert by_id["inc_a"]["withdrawActive"] is True
    assert by_id["inc_b"]["withdrawActive"] is False
    assert by_id["inc_c"]["peopleOnSite"] == 1
    for fire in body["liveFires"]:
        assert fire["code"] is None
        assert fire["placeName"] is None
        assert fire["liveCameras"] is None
        assert fire["photoCadence"] is None
        assert fire["distanceToRisk"] is None
        assert fire["since"] is None
    assert "Ketapang" not in response_text(body)
    assert set(body["seasonImpact"]) == {
        "since", "region", "crewCount", "firesContained", "firesContainedNote",
        "falseAlarmsCleared", "falseAlarmsNote", "injuries", "injuriesNote",
        "medianTimeToHumanCheck", "medianTimeNote", "reignitionsCaught", "reignitionsNote",
    }
    assert all(value is None for value in body["seasonImpact"].values())
    assert all(value is None for value in body["charts"].values())


def response_text(body):
    return str(body)


def test_volunteer_cannot_read_dashboard(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    _task(fake, "task_proposed", "proposed")

    response = client.get("/dashboard", headers=AUTH)
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
