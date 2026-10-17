"""Incident detail context (#92, #93, #95) and the volunteer's own sent list (#131)."""
from datetime import datetime, timezone

from incidents import sent
from incidents.test_incidents import AUTH, _as, client, db  # noqa: F401  (fixtures)

SUPERVISOR_KEYS = ("header", "conditions", "photoReads")


def _detail(client, monkeypatch, incident_id="inc_01"):
    _as(monkeypatch)
    return client.get(f"/incidents/{incident_id}", headers=AUTH).get_json()


# Header ------------------------------------------------------------------------------------

def test_the_header_names_the_incident_and_says_who_and_when(client, monkeypatch, db):
    db.data["incidents"]["inc_01"].update(name="Bengkalis, Riau · Sari · #3", area="Bengkalis, Riau", observationIds=["obs_01", "obs_02"])
    header = _detail(client, monkeypatch)["header"]
    assert header == {
        "code": "#3", "placeName": "Bengkalis, Riau", "openedAt": "2026-10-13T08:12:04Z",
        "peopleOnSite": 2, "source": "chip",
    }


def test_the_header_counts_people_on_reports_and_tasks_once(client, monkeypatch, db):
    # uid_sari and uid_rizal have reports and tasks. Nobody else has anything.
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02"]
    assert _detail(client, monkeypatch)["header"]["peopleOnSite"] == 2


def test_an_incident_with_no_number_or_area_falls_back_to_the_short_id_and_the_position(client, monkeypatch, db):
    header = _detail(client, monkeypatch)["header"]
    assert header["code"] == "INC-C_01"
    assert header["placeName"] == "1.48°N 102.11°E"


def test_the_header_has_no_opening_time_or_source_when_no_report_can_be_read(client, monkeypatch, db):
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_missing"]
    header = _detail(client, monkeypatch)["header"]
    assert (header["openedAt"], header["source"]) == (None, None)


def test_the_opening_report_is_the_earliest_received_one(client, monkeypatch, db):
    db.add("observations", "obs_00", dict(db.data["observations"]["obs_01"], receivedAt="2026-10-13T08:00:00Z", source="photo", photoPath="photos/uid_sari/x.jpg"))
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_00", "obs_02"]
    header = _detail(client, monkeypatch)["header"]
    assert (header["openedAt"], header["source"]) == ("2026-10-13T08:00:00Z", "photo")


# Conditions --------------------------------------------------------------------------------

WEATHER = {
    "source": "open-meteo", "observedAt": "2026-10-16T07:00:00Z", "windKmh": 12.4, "windDirDeg": 225, "gustKmh": 20.1,
    "tempC": 31.2, "humidityPct": 62, "precipMm": 0.0, "lat": 1.0, "lng": 102.0,
}


def test_conditions_are_the_stored_weather_and_air_reads(client, monkeypatch, db):
    db.add("weather", "current", WEATHER)
    db.add("psi", "current", {"source": "data.gov.sg", "observedAt": "2026-10-16T07:00:00Z", "psi24hMax": 88, "pm25_24h": {"north": 31, "south": 40}})
    conditions = _detail(client, monkeypatch)["conditions"]
    assert conditions["weather"] == {
        "observedAt": "2026-10-16T07:00:00Z", "windKmh": 12.4, "windDirDeg": 225.0, "windFrom": "SW", "gustKmh": 20.1,
        "tempC": 31.2, "humidityPct": 62, "rainMm": 0.0, "source": "open-meteo",
    }
    assert conditions["air"] == {"observedAt": "2026-10-16T07:00:00Z", "psi24hMax": 88, "pm25Max": 40, "source": "data.gov.sg"}


def test_conditions_are_empty_when_nothing_is_stored(client, monkeypatch, db):
    assert _detail(client, monkeypatch)["conditions"] == {"weather": None, "air": None}


def test_a_missing_reading_stays_null_and_nothing_is_invented(client, monkeypatch, db):
    db.add("weather", "current", {"windKmh": 8, "tempC": "hot", "windDirDeg": None})
    weather = _detail(client, monkeypatch)["conditions"]["weather"]
    assert weather["windKmh"] == 8
    assert (weather["windDirDeg"], weather["windFrom"], weather["tempC"], weather["humidityPct"], weather["gustKmh"]) == (None,) * 5


def test_air_without_a_pm25_map_has_no_pm25(client, monkeypatch, db):
    db.add("psi", "current", {"psi24hMax": 55})
    assert _detail(client, monkeypatch)["conditions"]["air"]["pm25Max"] is None


def test_an_unreadable_weather_source_leaves_conditions_empty_but_the_incident_is_returned(client, monkeypatch, db):
    original = db.collection

    def broken(name):
        if name == "weather":
            raise RuntimeError("firestore unavailable")
        return original(name)

    monkeypatch.setattr(db, "collection", broken)
    body = _detail(client, monkeypatch)
    assert body["conditions"] == {"weather": None, "air": None}
    assert body["incident"]["id"] == "inc_01"


# Cards -------------------------------------------------------------------------------------

def test_a_card_carries_crew_team_role_and_the_newest_device_context(client, monkeypatch, db):
    db.add("volunteers", "uid_sari", {"displayName": "Sari", "crewName": "Tim Pompa A", "fcmTokens": []})
    db.add("incident_members", "inc_01__uid_sari", {"incidentId": "inc_01", "volunteerId": "uid_sari", "teamRole": "pump team"})
    db.add("observations", "obs_03", dict(db.data["observations"]["obs_01"], capturedAt="2026-10-13T08:20:00Z", device={"batteryPct": 41, "network": "3g", "language": "id"}))
    db.add("observations", "obs_04", dict(db.data["observations"]["obs_01"], capturedAt="2026-10-13T08:15:00Z", device={"batteryPct": 70, "network": "4g", "language": "en"}))
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02", "obs_03", "obs_04"]
    cards = {c["volunteerId"]: c for c in _detail(client, monkeypatch)["volunteers"]}
    sari = cards["uid_sari"]
    assert (sari["crewName"], sari["teamRole"]) == ("Tim Pompa A", "pump team")
    assert sari["device"] == {"batteryPct": 41, "network": "3g", "language": "id", "at": "2026-10-13T08:20:00Z"}


def test_a_card_has_null_for_everything_nothing_stored(client, monkeypatch, db):
    cards = {c["volunteerId"]: c for c in _detail(client, monkeypatch)["volunteers"]}
    rizal = cards["uid_rizal"]
    assert (rizal["crewName"], rizal["teamRole"], rizal["device"]) == (None, None, None)


def test_a_blank_crew_or_role_is_null(client, monkeypatch, db):
    db.add("volunteers", "uid_sari", {"crewName": "   "})
    db.add("incident_members", "inc_01__uid_sari", {"incidentId": "inc_01", "volunteerId": "uid_sari", "teamRole": ""})
    sari = next(c for c in _detail(client, monkeypatch)["volunteers"] if c["volunteerId"] == "uid_sari")
    assert (sari["crewName"], sari["teamRole"]) == (None, None)


def test_a_device_block_with_no_usable_part_is_null(client, monkeypatch, db):
    db.data["observations"]["obs_01"]["device"] = {"batteryPct": None}
    sari = next(c for c in _detail(client, monkeypatch)["volunteers"] if c["volunteerId"] == "uid_sari")
    assert sari["device"] is None


# Photo reads -------------------------------------------------------------------------------

def _photo(db):
    db.add("observations", "obs_photo", dict(db.data["observations"]["obs_01"], source="photo", chip=None, photoPath="photos/uid_sari/20261013/x.jpg"))
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02", "obs_photo"]


def test_a_successful_photo_read_is_returned_by_observation_id(client, monkeypatch, db):
    _photo(db)
    db.add("photo_triage", "obs_photo", {
        "status": "ok", "advisory": True, "at": "2026-10-13T08:30:00Z",
        "result": {"smokeVisible": True, "flameVisible": "small", "burnScarVisible": False, "notes": "Thin smoke beside a canal"},
    })
    assert _detail(client, monkeypatch)["photoReads"] == {
        "obs_photo": {"smokeVisible": True, "flameVisible": "small", "burnScarVisible": False, "notes": "Thin smoke beside a canal", "at": "2026-10-13T08:30:00Z"},
    }


def test_a_rejected_or_failed_photo_read_is_not_returned(client, monkeypatch, db):
    _photo(db)
    db.add("photo_triage", "obs_photo", {"status": "rejected", "reason": "not a fire photo", "result": None})
    assert _detail(client, monkeypatch)["photoReads"] == {}


def test_photo_reads_are_empty_with_no_photo_report(client, monkeypatch, db):
    assert _detail(client, monkeypatch)["photoReads"] == {}


# Conflict ---------------------------------------------------------------------------------

def test_the_conflict_open_row_is_on_the_timeline_and_in_the_conflict_context(client, monkeypatch, db):
    db.add("audit", "aud_open", {"actorId": "code", "action": "conflict.open", "targetId": "inc_01", "at": "2026-10-13T08:13:04.000Z"})
    body = _detail(client, monkeypatch)
    opened = [e for e in body["conflictContext"]["audit"] if e["action"] == "conflict.open"]
    assert len(opened) == 1 and (opened[0]["actorId"], opened[0]["actorName"]) == ("code", None)
    assert "aud_open" in [e["id"] for e in body["timeline"]]


def test_all_observations_lists_both_sides_and_the_others_oldest_first(client, monkeypatch, db):
    db.add("observations", "obs_smoke", dict(db.data["observations"]["obs_01"], volunteerId="uid_dedi", chip="asap", severity="smoke", capturedAt="2026-10-13T08:10:00Z", volunteerName="Pak Dedi"))
    db.data["incidents"]["inc_01"]["observationIds"] = ["obs_01", "obs_02", "obs_smoke"]
    context = _detail(client, monkeypatch)["conflictContext"]
    assert [o["id"] for o in context["allObservations"]] == ["obs_smoke", "obs_01", "obs_02"]
    assert [o["id"] for o in context["otherObservations"]] == ["obs_smoke"]
    assert context["allObservations"][0]["volunteerName"] == "Pak Dedi"
    assert "device" not in context["allObservations"][0]


# Who sees what ----------------------------------------------------------------------------

def test_a_volunteer_read_has_none_of_the_supervisor_context(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari")
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    for key in SUPERVISOR_KEYS:
        assert key not in body


def test_a_supervisor_read_always_has_the_new_keys(client, monkeypatch, db):
    body = _detail(client, monkeypatch, "inc_old")
    for key in SUPERVISOR_KEYS:
        assert key in body
    assert body["header"]["peopleOnSite"] == 0


# Sent today -------------------------------------------------------------------------------

NOW = datetime(2026, 10, 16, 12, 0, 0, tzinfo=timezone.utc)


def _report(db, oid, received, uid="uid_sari", **extra):
    db.add("observations", oid, {
        "volunteerId": uid, "capturedAt": received, "receivedAt": received, "source": "chip", "lat": 1.48, "lng": 102.11,
        "accuracyM": 18, "chip": "api", "text": None, "severity": "small_flame", "photoPath": None, "immutable": True, **extra,
    })


def _digest(client, monkeypatch, query="", uid="uid_sari", role="volunteer"):
    _as(monkeypatch, role=role, uid=uid, name="Sari")
    return client.get(f"/digest{query}", headers=AUTH).get_json()


def test_the_digest_has_no_sent_list_unless_asked(client, monkeypatch, db):
    _report(db, "obs_a", "2026-10-16T05:00:00.000Z")
    assert "sentToday" not in _digest(client, monkeypatch)


def test_the_list_is_this_volunteers_reports_since_their_start_of_day_oldest_first(client, monkeypatch, db):
    monkeypatch.setattr(sent, "datetime", type("D", (datetime,), {"now": classmethod(lambda cls, tz=None: NOW)}))
    _report(db, "obs_old", "2026-10-15T10:00:00.000Z")
    _report(db, "obs_b", "2026-10-16T06:30:00.000Z", text="Api di kanal", chip="api", clientId="ob-2")
    _report(db, "obs_a", "2026-10-16T05:10:00.000Z")
    _report(db, "obs_other", "2026-10-16T06:00:00.000Z", uid="uid_rizal")
    body = _digest(client, monkeypatch, "?sentSince=2026-10-16T00:00:00%2B07:00")
    assert [i["id"] for i in body["sentToday"]] == ["obs_a", "obs_b"]
    second = body["sentToday"][1]
    assert (second["clientId"], second["text"], second["chip"], second["receivedAt"], second["accuracyM"]) == ("ob-2", "Api di kanal", "api", "2026-10-16T06:30:00.000Z", 18)
    assert "clientId" not in body["sentToday"][0]
    assert body["sentToday"][0]["join"] is None


def test_each_report_carries_the_join_agents_wrote(client, monkeypatch, db):
    monkeypatch.setattr(sent, "datetime", type("D", (datetime,), {"now": classmethod(lambda cls, tz=None: NOW)}))
    _report(db, "obs_a", "2026-10-16T05:10:00.000Z")
    _report(db, "obs_b", "2026-10-16T06:30:00.000Z")
    db.add("incidents", "inc_named", {"name": "Bengkalis, Riau · Sari · #1", "area": "Bengkalis, Riau", "status": "open", "severity": "smoke", "lat": 1.48, "lng": 102.11, "withdraw": None})
    db.add("observation_joins", "obs_a", {"observationId": "obs_a", "incidentId": "inc_named", "joined": False, "nearbyCount": 0, "nearestM": None, "radiusM": 300.0})
    db.add("observation_joins", "obs_b", {"observationId": "obs_b", "incidentId": "inc_named", "joined": True, "nearbyCount": 1, "nearestM": 90, "radiusM": 300.0})
    items = _digest(client, monkeypatch, "?sentSince=2026-10-16T00:00:00%2B07:00")["sentToday"]
    assert items[0]["join"] == {"incidentId": "inc_named", "incidentName": "Bengkalis, Riau · Sari · #1", "incidentArea": "Bengkalis, Riau", "joined": False, "nearbyCount": 0, "nearestM": None, "radiusM": 300.0}
    assert (items[1]["join"]["joined"], items[1]["join"]["nearbyCount"], items[1]["join"]["nearestM"]) == (True, 1, 90)


def test_a_supervisor_digest_has_no_sent_list(client, monkeypatch, db):
    _report(db, "obs_a", "2026-10-16T05:00:00.000Z")
    body = _digest(client, monkeypatch, "?sentSince=2026-10-16T00:00:00%2B07:00", uid="uid_maya", role="supervisor")
    assert "sentToday" not in body


def test_an_unreadable_sent_list_leaves_the_digest_without_it(client, monkeypatch, db):
    def broken(uid, raw):
        raise RuntimeError("firestore unavailable")
    monkeypatch.setattr(sent, "sent_today", broken)
    body = _digest(client, monkeypatch, "?sentSince=2026-10-16T00:00:00%2B07:00")
    assert "sentToday" not in body and "incidents" in body


def test_the_start_of_day_is_read_with_its_zone(client, monkeypatch, db):
    start = sent.window_start("2026-10-16T00:00:00+07:00", NOW)
    assert start == datetime(2026, 10, 15, 17, 0, tzinfo=timezone.utc)
    # A plus sign that arrived as a space in a query string is the same offset.
    assert sent.window_start("2026-10-16T00:00:00 07:00", NOW) == start


def test_a_missing_unreadable_zoneless_or_future_start_means_the_last_day(client, monkeypatch, db):
    last_day = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
    for raw in (None, "", "yesterday", "2026-10-16T00:00:00", "2026-10-17T00:00:00Z", 5):
        assert sent.window_start(raw, NOW) == last_day


def test_an_early_start_is_held_to_two_days(client, monkeypatch, db):
    assert sent.window_start("2026-10-01T00:00:00Z", NOW) == datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)


def test_only_the_newest_fifty_are_returned(client, monkeypatch, db):
    for n in range(55):
        _report(db, f"obs_{n:02d}", f"2026-10-16T05:{n:02d}:00.000Z")
    items = sent.sent_today("uid_sari", "2026-10-16T00:00:00Z", NOW)
    assert len(items) == 50 and items[0]["id"] == "obs_05" and items[-1]["id"] == "obs_54"


def test_a_report_with_no_readable_time_is_left_out(client, monkeypatch, db):
    _report(db, "obs_bad", "not a time")
    assert sent.sent_today("uid_sari", "2026-10-16T00:00:00Z", NOW) == []
