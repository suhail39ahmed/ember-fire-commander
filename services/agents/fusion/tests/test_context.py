"""What fusion records beside the score: the join record, the conflict-open audit row, and the wind and satellite factors."""
from fusion.rules import evidence, lead_window_start, nearest_lead
from fusion.settings import Settings
from fusion.tests.test_rules import BASE, NOW, World, obs

# About 111 m of latitude per 0.001 degree.
NORTH_100M = 0.0009
NORTH_1KM = 0.009


def lead(lat=BASE[0] + NORTH_1KM, lng=BASE[1], acq="2026-10-13T07:10:00.000Z", **extra):
    record = {"id": "lead_1", "kind": "firms_hotspot", "lat": lat, "lng": lng, "acqAt": acq, "confidence": "nominal", "status": "to_verify"}
    record.update(extra)
    return record


# Join record ---------------------------------------------------------------

def test_the_first_report_starts_an_incident_and_says_so():
    world = World()
    plan = world.intake(obs("obs_a", "uid_sari", "smoke"))
    assert plan.join == {
        "id": "obs_a", "observationId": "obs_a", "incidentId": plan.incident["id"], "joined": False,
        "nearbyCount": 0, "nearestM": None, "radiusM": 300.0, "at": NOW,
    }


def test_a_report_that_joins_counts_the_reports_within_the_radius():
    world = World()
    first = world.intake(obs("obs_a", "uid_sari", "smoke"))
    world.intake(obs("obs_b", "uid_rizal", "smoke", lat=BASE[0] + NORTH_100M))
    plan = world.intake(obs("obs_c", "uid_dedi", "smoke", lat=BASE[0] + 2 * NORTH_100M))
    assert plan.join["joined"] is True
    assert plan.join["incidentId"] == first.incident["id"]
    assert plan.join["nearbyCount"] == 2
    assert plan.join["nearestM"] == 100
    assert plan.join["radiusM"] == 300.0


def test_a_member_beyond_the_radius_is_not_counted_as_nearby():
    world = World()
    world.intake(obs("obs_a", "uid_sari", "smoke"))
    world.intake(obs("obs_b", "uid_rizal", "smoke", lat=BASE[0] + 0.002))  # about 220 m, chains the incident
    plan = world.intake(obs("obs_c", "uid_dedi", "smoke", lat=BASE[0] + 0.004))  # 440 m from a, 220 m from b
    assert plan.join["joined"] is True
    assert plan.join["nearbyCount"] == 1
    assert plan.join["nearestM"] == 222


def test_the_join_record_uses_the_radius_from_settings():
    world = World()
    world.intake(obs("obs_a", "uid_sari", "smoke"))
    plan = world.intake(obs("obs_b", "uid_rizal", "smoke", lat=BASE[0] + NORTH_100M), settings=Settings(cluster_radius_m=150))
    assert plan.join["radiusM"] == 150
    assert plan.join["nearbyCount"] == 1


def test_a_new_incident_reports_the_nearest_report_elsewhere():
    world = World()
    world.intake(obs("obs_a", "uid_sari", "smoke"))
    plan = world.intake(obs("obs_b", "uid_rizal", "smoke", lat=BASE[0] + NORTH_1KM))
    assert plan.join["joined"] is False
    assert plan.join["nearbyCount"] == 0
    assert plan.join["nearestM"] == 1001


def test_a_skipped_repeat_has_no_join_record():
    world = World()
    observation = obs("obs_a", "uid_sari", "smoke")
    world.intake(observation)
    assert world.intake(observation).join is None


# Conflict opened -----------------------------------------------------------

def test_opening_a_conflict_writes_one_audit_row_by_code():
    world = World()
    world.intake(obs("obs_a", "uid_sari", "small_flame"))
    plan = world.intake(obs("obs_b", "uid_rizal", "none"))
    opened = [a for a in plan.audits if a["action"] == "conflict.open"]
    assert len(opened) == 1
    assert opened[0]["actorId"] == "code"
    assert opened[0]["targetId"] == plan.incident["id"]
    assert opened[0]["at"] == NOW


def test_a_later_report_on_an_open_conflict_does_not_write_another():
    world = World()
    world.intake(obs("obs_a", "uid_sari", "small_flame"))
    world.intake(obs("obs_b", "uid_rizal", "none"))
    plan = world.intake(obs("obs_c", "uid_dedi", "none"))
    assert [a for a in plan.audits if a["action"] == "conflict.open"] == []


def test_agreeing_reports_write_no_conflict_row():
    world = World()
    world.intake(obs("obs_a", "uid_sari", "small_flame"))
    plan = world.intake(obs("obs_b", "uid_rizal", "small_flame"))
    assert all(a["action"] != "conflict.open" for a in plan.audits)


# Wind and satellite factors ------------------------------------------------

def factors_of(incident):
    return {f["factor"]: f for f in incident["evidenceFactors"]}


def test_known_wind_is_listed_and_adds_no_points():
    world = World()
    quiet = world.intake(obs("obs_a", "uid_sari", "smoke"))
    windy = World().intake(obs("obs_a", "uid_sari", "smoke"), wind_kmh=12.4)
    factor = factors_of(windy.incident)["wind"]
    assert factor["points"] == 0
    assert "12.4 km/h" in factor["detail"] and "not at the incident" in factor["detail"]
    assert windy.incident["evidenceScore"] == quiet.incident["evidenceScore"]
    assert "wind" not in factors_of(quiet.incident)


def test_wind_below_the_withdraw_threshold_never_withdraws():
    plan = World().intake(obs("obs_a", "uid_sari", "smoke"), wind_kmh=12.4)
    assert plan.incident["withdraw"] is None


def test_a_recent_lead_near_the_incident_is_listed_and_adds_no_points():
    plan = World().intake(obs("obs_a", "uid_sari", "smoke"), leads=[lead()])
    factor = factors_of(plan.incident)["satellite"]
    assert factor["points"] == 0
    assert "unverified" in factor["detail"] and "1.0 km" in factor["detail"] and "07:10 UTC" in factor["detail"]
    assert "nominal" in factor["detail"]
    assert plan.incident["evidenceScore"] == World().intake(obs("obs_a", "uid_sari", "smoke")).incident["evidenceScore"]


def test_the_nearest_lead_is_the_one_listed():
    leads = [lead(lat=BASE[0] + 0.015, id="far"), lead(lat=BASE[0] + 0.0045, id="near")]
    plan = World().intake(obs("obs_a", "uid_sari", "smoke"), leads=leads)
    assert "500 m" in factors_of(plan.incident)["satellite"]["detail"]


def test_a_lead_outside_the_radius_or_the_window_or_dismissed_is_not_listed():
    settings = Settings()
    centre = BASE
    assert nearest_lead([lead(lat=BASE[0] + 0.03)], *centre, NOW, settings) is None  # about 3.3 km
    assert nearest_lead([lead(acq="2026-10-12T07:00:00.000Z")], *centre, NOW, settings) is None  # over a day old
    assert nearest_lead([lead(acq="2026-10-13T09:00:00.000Z")], *centre, NOW, settings) is None  # in the future
    assert nearest_lead([lead(status="checked_no_fire")], *centre, NOW, settings) is None
    assert nearest_lead([lead(kind="other")], *centre, NOW, settings) is None
    assert nearest_lead([lead(lat=None)], *centre, NOW, settings) is None
    assert nearest_lead([], *centre, NOW, settings) is None
    assert nearest_lead(None, *centre, NOW, settings) is None


def test_an_unknown_confidence_is_left_out_of_the_sentence():
    plan = World().intake(obs("obs_a", "uid_sari", "smoke"), leads=[lead(confidence="unknown")])
    assert "confidence" not in factors_of(plan.incident)["satellite"]["detail"]


def test_the_lead_window_starts_a_day_before_now_by_default():
    assert lead_window_start(NOW, Settings()) == "2026-10-12T08:20:00.000Z"


def test_evidence_without_context_is_unchanged():
    score, factors = evidence([obs("o", "u", "smoke")], conflict_open=False)
    assert score == 20
    assert [f["factor"] for f in factors] == ["severity"]
