import logging

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
            "crewCount": 1,
            "firesContained": 0,
            "firesContainedNote": "Extinguished by a supervisor, of 0 incidents",
            "falseAlarmsCleared": 0,
            "falseAlarmsNote": "Satellite leads a person checked and found no fire",
            "injuries": None,
            "injuriesNote": "No injury reports are recorded in EMBER",
            "medianTimeToHumanCheck": None,
            "medianTimeNote": None,
            "reignitionsCaught": 0,
            "reignitionsNote": "0 alerts near 0 extinguished sites. A person still has to look",
        },
        "charts": {
            "satelliteNote": "0 satellite leads in the last 7 days. Real = linked to an incident",
            "realFires": 0,
            "dismissed": 0,
            "medianNote": "No incident verified in the last 24 hours",
            "medianToday": None,
            "medianTarget": None,
            "crewNote": CREW_NOTE,
            "onSite": 0,
            "enRoute": 0,
            "ready": 0,
            "offline": 1,  # uid_sari has tasks and no registered device
            "weatherNote": None,
            "airTempC": None,
            "humidity": None,
            "wind": None,
            "rain": None,
        },
        "reignitionAlert": None,
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
    _incident(fake, "inc_b", "open", observationIds=["obs_1", "obs_1b"], name="Ketapang, Kalimantan Barat · Pak Dedi · #3", area="Ketapang, Kalimantan Barat")
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
        assert fire["liveCameras"] is None
        assert fire["photoCadence"] is None
        assert fire["distanceToRisk"] is None
    assert set(body["seasonImpact"]) == set(SEASON_KEYS)
    assert set(body["charts"]) == set(CHART_KEYS)


def test_volunteer_cannot_read_dashboard(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    _task(fake, "task_proposed", "proposed")

    response = client.get("/dashboard", headers=AUTH)
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"


# --- values computed from stored records ---------------------------------------------------

NOW = "2026-10-16T07:46:00Z"
CREW_NOTE = (
    "On site = reported from a live fire. En route = sent a task, no report yet. "
    "Offline = no device registered"
)
SEASON_KEYS = (
    "since", "region", "crewCount", "firesContained", "firesContainedNote", "falseAlarmsCleared",
    "falseAlarmsNote", "injuries", "injuriesNote", "medianTimeToHumanCheck", "medianTimeNote",
    "reignitionsCaught", "reignitionsNote",
)
CHART_KEYS = (
    "satelliteNote", "realFires", "dismissed", "medianNote", "medianToday", "medianTarget",
    "crewNote", "onSite", "enRoute", "ready", "offline", "weatherNote", "airTempC", "humidity",
    "wind", "rain",
)


@pytest.fixture
def fake(monkeypatch):
    db = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: db)
    monkeypatch.setattr(rules, "now_iso", lambda: NOW)
    _as(monkeypatch)
    return db


def _read(client, caplog):
    """The dashboard body. Fails when any card source raised and was skipped."""
    with caplog.at_level(logging.ERROR):
        response = client.get("/dashboard", headers=AUTH)
    assert response.status_code == 200
    assert [r for r in caplog.records if r.levelno >= logging.ERROR] == []
    return response.get_json()


def _obs(db, obs_id, volunteer, received):
    db.add("observations", obs_id, {"volunteerId": volunteer, "receivedAt": received, "capturedAt": received})


def test_banner_names_the_fire_from_the_stored_name_and_area(client, fake, caplog):
    _incident(
        fake, "inc_1", "open", name="Bengkalis, Riau · Pak Dedi · #3", area="Bengkalis, Riau",
        observationIds=["o2", "o1"], lat=1.47, lng=102.1,
    )
    _obs(fake, "o1", "uid_dedi", "2026-10-16T07:10:30.000Z")
    _obs(fake, "o2", "uid_sari", "2026-10-16T07:20:00.000Z")

    fire = _read(client, caplog)["liveFires"][0]
    assert fire["code"] == "#3"
    assert fire["placeName"] == "Bengkalis, Riau"
    assert fire["since"] == "2026-10-16T07:10:30.000Z"


def test_banner_falls_back_for_incidents_without_area_or_name(client, fake, caplog):
    _incident(fake, "inc_old_T4L7", "verified", lat=15.0517, lng=77.6312)
    _incident(fake, "inc_name_only", "open", name="Dumai, Riau · #2")
    _incident(fake, "inc_nothing", "held")

    fires = {f["id"]: f for f in _read(client, caplog)["liveFires"]}
    old = fires["inc_old_T4L7"]
    assert old["code"] == "INC-T4L7"
    assert old["placeName"] == "15.05\u00b0N 77.63\u00b0E"
    assert old["since"] is None
    named = fires["inc_name_only"]
    assert named["code"] == "#2"
    assert named["placeName"] == "Dumai, Riau"
    bare = fires["inc_nothing"]
    assert bare["placeName"] is None
    assert bare["code"] == "INC-HING"


def test_since_skips_observations_that_cannot_be_read(client, fake, caplog):
    _incident(fake, "inc_1", "open", observationIds=["gone", "o1"])
    _obs(fake, "o1", "uid_dedi", "2026-10-16T07:10:00.000Z")
    assert _read(client, caplog)["liveFires"][0]["since"] == "2026-10-16T07:10:00.000Z"


def test_season_counts_come_from_incident_status(client, fake, caplog):
    _incident(fake, "i1", "extinguished", area="Bengkalis, Riau", observationIds=["o1"])
    _incident(fake, "i2", "extinguished", area="Dumai, Riau", observationIds=["o2"])
    _incident(fake, "i3", "open", area="Jambi, Jambi", observationIds=["o3"])
    _incident(fake, "i4", "verified", area="1.48\u00b0N 102.12\u00b0E")
    _obs(fake, "o1", "uid_a", "2026-10-14T01:00:00.000Z")
    _obs(fake, "o2", "uid_b", "2026-10-15T01:00:00.000Z")
    _obs(fake, "o3", "uid_a", "2026-10-16T01:00:00.000Z")
    fake.add("tasks", "t1", {"incidentId": "i3", "volunteerId": "uid_c", "type": "verify", "status": "proposed"})
    fake.add("volunteers", "uid_d", {"fcmTokens": ["tok"]})

    season = _read(client, caplog)["seasonImpact"]
    assert season["firesContained"] == 2
    assert season["firesContainedNote"] == "Extinguished by a supervisor, of 4 incidents"
    assert season["since"] == "2026-10-14T01:00:00.000Z"
    assert season["region"] == "Riau, Jambi"
    assert season["crewCount"] == 4  # a, b, c (task only), d (device only)
    assert season["injuries"] is None


def test_region_is_null_when_no_area_has_a_province(client, fake, caplog):
    _incident(fake, "i1", "open", area="1.48\u00b0N 102.12\u00b0E")
    _incident(fake, "i2", "open")
    assert _read(client, caplog)["seasonImpact"]["region"] is None


def test_false_alarms_count_leads_a_person_checked(client, fake, caplog):
    fake.add("leads", "l1", {"status": "checked_no_fire", "firstSeenAt": "2026-09-01T00:00:00.000Z"})
    fake.add("leads", "l2", {"status": "checked_no_fire", "firstSeenAt": "2026-10-15T00:00:00.000Z"})
    fake.add("leads", "l3", {"status": "to_verify", "firstSeenAt": "2026-10-15T00:00:00.000Z"})
    assert _read(client, caplog)["seasonImpact"]["falseAlarmsCleared"] == 2


def test_median_time_to_human_check(client, fake, caplog):
    for incident_id, first in (("i1", "2026-10-16T06:00:00.000Z"), ("i2", "2026-10-16T06:30:00.000Z"),
                               ("i3", "2026-10-10T06:00:00.000Z")):
        _incident(fake, incident_id, "verified", observationIds=[f"o_{incident_id}"])
        _obs(fake, f"o_{incident_id}", "uid_a", first)
    _incident(fake, "i_open", "open", observationIds=["o_open"])
    _obs(fake, "o_open", "uid_a", "2026-10-16T06:00:00.000Z")
    fake.add("audit", "a1", {"action": "incident.verify", "targetId": "i1", "at": "2026-10-16T06:10:00.000Z"})
    fake.add("audit", "a2", {"action": "incident.verify", "targetId": "i2", "at": "2026-10-16T06:50:00.000Z"})
    fake.add("audit", "a3", {"action": "incident.verify", "targetId": "i3", "at": "2026-10-10T07:00:00.000Z"})
    # A second verify row for the same incident and one for an unknown incident do not count.
    fake.add("audit", "a4", {"action": "incident.verify", "targetId": "i1", "at": "2026-10-16T07:00:00.000Z"})
    fake.add("audit", "a5", {"action": "incident.verify", "targetId": "ghost", "at": "2026-10-16T07:00:00.000Z"})
    fake.add("audit", "a6", {"action": "task.approve", "targetId": "i_open", "at": "2026-10-16T06:05:00.000Z"})

    body = _read(client, caplog)
    # Season: 10, 20 and 60 minutes. Median 20.
    assert body["seasonImpact"]["medianTimeToHumanCheck"] == "20 min"
    assert body["seasonImpact"]["medianTimeNote"] == "First report to supervisor verification, 3 incidents"
    # Last 24 hours: 10 and 20 minutes. Median 15.
    assert body["charts"]["medianToday"] == "15 min"
    assert body["charts"]["medianNote"] == "Last 24 hours, 2 incidents"
    assert body["charts"]["medianTarget"] is None


def test_median_is_null_without_a_verified_incident(client, fake, caplog):
    _incident(fake, "i1", "open", observationIds=["o1"])
    _obs(fake, "o1", "uid_a", "2026-10-16T06:00:00.000Z")
    body = _read(client, caplog)
    assert body["seasonImpact"]["medianTimeToHumanCheck"] is None
    assert body["seasonImpact"]["medianTimeNote"] is None
    assert body["charts"]["medianToday"] is None


def test_verify_without_a_readable_report_is_left_out(client, fake, caplog):
    _incident(fake, "i1", "verified")
    fake.add("audit", "a1", {"action": "incident.verify", "targetId": "i1", "at": "2026-10-16T06:10:00.000Z"})
    assert _read(client, caplog)["seasonImpact"]["medianTimeToHumanCheck"] is None


def test_duration_text():
    from dashboard import _duration_text
    assert [_duration_text(s) for s in (0, 45, 90, 600, 3600, 3900, 7500)] == [
        "0 s", "45 s", "2 min", "10 min", "1 h 00 min", "1 h 05 min", "2 h 05 min",
    ]


def test_reignitions_count_sites_with_a_reinspect_alert(client, fake, caplog):
    fake.add("audit", "a1", {"action": "site.reinspect", "actorId": "code", "targetId": "i1", "at": NOW})
    fake.add("audit", "a2", {"action": "site.reinspect", "actorId": "code", "targetId": "i1", "at": NOW})
    fake.add("audit", "a3", {"action": "site.reinspect", "actorId": "code", "targetId": "i2", "at": NOW})
    fake.add("audit", "a4", {"action": "incident.extinguish", "targetId": "i3", "at": NOW})
    season = _read(client, caplog)["seasonImpact"]
    assert season["reignitionsCaught"] == 2
    assert season["reignitionsNote"] == "3 alerts near 2 extinguished sites. A person still has to look"


def test_satellite_chart_counts_leads_seen_this_week(client, fake, caplog):
    fake.add("leads", "l1", {"status": "checked_no_fire", "firstSeenAt": "2026-10-15T00:00:00.000Z"})
    fake.add("leads", "l2", {"status": "to_verify", "firstSeenAt": "2026-10-15T00:00:00.000Z", "incidentId": "i1"})
    fake.add("leads", "l3", {"status": "to_verify", "firstSeenAt": "2026-10-16T00:00:00.000Z"})
    fake.add("leads", "l_old", {"status": "checked_no_fire", "firstSeenAt": "2026-10-01T00:00:00.000Z"})
    charts = _read(client, caplog)["charts"]
    assert charts["realFires"] == 1
    assert charts["dismissed"] == 1
    assert charts["satelliteNote"] == "3 satellite leads in the last 7 days. Real = linked to an incident"
    assert charts["medianTarget"] is None


def test_crew_card_from_reports_tasks_and_devices(client, fake, caplog):
    _incident(fake, "live", "open", observationIds=["o1"])
    _incident(fake, "gone", "extinguished", observationIds=["o2"])
    _obs(fake, "o1", "uid_onsite", "2026-10-16T07:00:00.000Z")
    _obs(fake, "o2", "uid_past", "2026-10-15T07:00:00.000Z")
    fake.add("tasks", "t1", {"incidentId": "live", "volunteerId": "uid_route", "type": "verify", "status": "approved"})
    fake.add("tasks", "t2", {"incidentId": "live", "volunteerId": "uid_onsite", "type": "verify", "status": "approved"})
    fake.add("tasks", "t3", {"incidentId": "live", "volunteerId": "uid_prop", "type": "verify", "status": "proposed"})
    fake.add("tasks", "t4", {"incidentId": "live", "volunteerId": "uid_wd", "type": "withdraw", "status": "approved"})
    fake.add("tasks", "t5", {"incidentId": "gone", "volunteerId": "uid_old_task", "type": "verify", "status": "approved"})
    for uid in ("uid_onsite", "uid_route", "uid_past", "uid_idle"):
        fake.add("volunteers", uid, {"fcmTokens": ["tok"]})
    fake.add("volunteers", "uid_profile_only", {"agency": "BPBD"})
    fake.add("volunteers", "uid_no_tokens", {"fcmTokens": []})

    charts = _read(client, caplog)["charts"]
    assert charts["crewNote"] == CREW_NOTE
    assert charts["onSite"] == 1       # uid_onsite
    assert charts["enRoute"] == 1      # uid_route
    assert charts["ready"] == 2        # uid_past, uid_idle
    assert charts["offline"] == 3      # uid_prop, uid_wd, uid_old_task have a task or report, no device


def test_crew_card_is_zero_with_no_volunteers(client, fake, caplog):
    charts = _read(client, caplog)["charts"]
    assert [charts[k] for k in ("onSite", "enRoute", "ready", "offline")] == [0, 0, 0, 0]


def test_weather_card_from_the_latest_stored_read(client, fake, caplog):
    fake.add("weather", "current", {
        "tempC": 31.24, "humidityPct": 62.4, "windKmh": 12.4, "windDirDeg": 225, "precipMm": 0,
        "observedAt": "2026-10-16T07:00:00Z",
    })
    charts = _read(client, caplog)["charts"]
    assert charts["airTempC"] == 31.2
    assert charts["humidity"] == "62%"
    assert charts["wind"] == "12 km/h SW"
    assert charts["rain"] == "0.0 mm"
    assert charts["weatherNote"] == "Open-Meteo, fixed monitoring point, read 07:00 UTC"


def test_weather_card_keeps_missing_values_null(client, fake, caplog):
    fake.add("weather", "current", {"tempC": None, "windKmh": 5, "humidityPct": "bad"})
    charts = _read(client, caplog)["charts"]
    assert charts["airTempC"] is None
    assert charts["humidity"] is None
    assert charts["rain"] is None
    assert charts["wind"] == "5 km/h"
    assert charts["weatherNote"] == "Open-Meteo, fixed monitoring point"


def test_weather_is_null_when_nothing_was_ingested(client, fake, caplog):
    charts = _read(client, caplog)["charts"]
    assert all(charts[k] is None for k in ("weatherNote", "airTempC", "humidity", "wind", "rain"))


def test_an_unreadable_source_leaves_only_its_cards_null(client, fake, monkeypatch, caplog):
    import dashboard as module

    def boom():
        raise RuntimeError("weather store down")

    monkeypatch.setattr(module, "_weather_chart", boom)
    _incident(fake, "i1", "extinguished")
    with caplog.at_level(logging.ERROR):
        response = client.get("/dashboard", headers=AUTH)
    assert response.status_code == 200
    body = response.get_json()
    assert body["charts"]["airTempC"] is None
    assert body["seasonImpact"]["firesContained"] == 1
    assert any("weather" in r.getMessage() for r in caplog.records)


def test_a_failed_incident_read_returns_the_empty_cards(client, fake, monkeypatch, caplog):
    import dashboard as module

    def boom(now):
        raise RuntimeError("firestore down")

    monkeypatch.setattr(module, "_Picture", boom)
    with caplog.at_level(logging.ERROR):
        body = client.get("/dashboard", headers=AUTH).get_json()
    assert body["liveFires"] == []
    assert all(value is None for value in body["seasonImpact"].values())
    assert all(value is None for value in body["charts"].values())
    assert body["approvalsCount"] == 0


def test_dashboard_never_returns_volunteer_ids_or_names(client, fake, caplog):
    _incident(fake, "i1", "open", observationIds=["o1"], name="Dumai, Riau · Pak Dedi · #1", area="Dumai, Riau")
    fake.add("observations", "o1", {
        "volunteerId": "uid_secret", "volunteerName": "Pak Dedi", "receivedAt": NOW, "lat": 1.0, "lng": 101.0,
    })
    fake.add("volunteers", "uid_secret", {"fcmTokens": ["tok_secret"]})
    text = str(_read(client, caplog))
    assert "uid_secret" not in text and "tok_secret" not in text
    assert "Pak Dedi" not in text
