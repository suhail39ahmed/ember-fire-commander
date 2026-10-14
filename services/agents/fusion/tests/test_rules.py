import itertools

from fusion.rules import State, evidence, fuse
from fusion.settings import Settings

NOW = "2026-10-13T08:20:00.000Z"
BASE = (1.482, 102.115)


def ids():
    counter = itertools.count(1)
    return lambda collection: f"{collection[:3]}_{next(counter):02d}"


def obs(oid, volunteer, severity, lat=BASE[0], lng=BASE[1], source="chip", **extra):
    record = {
        "id": oid, "volunteerId": volunteer, "source": source, "severity": severity,
        "lat": lat, "lng": lng, "accuracyM": 80, "photoPath": None, "immutable": True,
    }
    record.update(extra)
    return record


class World:
    """Apply plans in memory so a test can run several intakes in a row."""

    def __init__(self):
        self.state = State()
        self.new_id = ids()
        self.audits = []

    def intake(self, observation, wind_kmh=None, settings=None):
        plan = fuse(observation, self.state, self.new_id, NOW, wind_kmh=wind_kmh, settings=settings)
        if plan.skipped:
            return plan
        self.state.observations[observation["id"]] = observation
        self.state.incidents = [i for i in self.state.incidents if i["id"] != plan.incident["id"]]
        self.state.incidents.append(plan.incident)
        if plan.conflict:
            self.state.conflicts = [c for c in self.state.conflicts if c["id"] != plan.conflict["id"]]
            self.state.conflicts.append(plan.conflict)
        self.state.tasks.extend(plan.tasks)
        self.audits.extend(plan.audits)
        return plan


def test_agreement_clusters_into_one_incident():
    world = World()
    first = world.intake(obs("obs_a", "uid_sari", "small_flame"))
    second = world.intake(obs("obs_b", "uid_rizal", "small_flame", lat=BASE[0] + 0.0005))
    assert second.incident["id"] == first.incident["id"]
    assert len(world.state.incidents) == 1
    incident = second.incident
    assert incident["observationIds"] == ["obs_a", "obs_b"]
    assert incident["severity"] == "small_flame"
    assert incident["status"] == "open"
    assert incident["conflictId"] is None
    assert incident["withdraw"] is None
    assert second.conflict is None and second.tasks == []
    assert incident["evidenceScore"] > first.incident["evidenceScore"]
    names = [f["factor"] for f in incident["evidenceFactors"]]
    assert names == ["severity", "corroboration"]
    assert incident["evidenceScore"] == sum(f["points"] for f in incident["evidenceFactors"])


def test_conflict_keeps_both_holds_and_proposes_verify():
    world = World()
    world.intake(obs("obs_01", "uid_sari", "small_flame"))
    plan = world.intake(obs("obs_02", "uid_rizal", "none"))
    incident, conflict = plan.incident, plan.conflict
    assert set(conflict["observationIds"]) == {"obs_01", "obs_02"}
    assert conflict["higherSeverity"] == "small_flame"
    assert conflict["status"] == "open" and conflict["dispatchHeld"] is True
    assert incident["severity"] == "small_flame"  # not averaged down
    assert incident["status"] == "held"
    assert incident["conflictId"] == conflict["id"]
    verify = [t for t in plan.tasks if t["type"] == "verify"]
    assert sorted(t["volunteerId"] for t in verify) == ["uid_rizal", "uid_sari"]
    assert all(t["status"] == "proposed" and t["incidentId"] == incident["id"] for t in verify)
    assert not [t for t in plan.tasks if t["type"] == "investigate"]
    assert world.state.observations["obs_01"]["severity"] == "small_flame"
    assert world.state.observations["obs_02"]["severity"] == "none"
    assert "conflict" in [f["factor"] for f in incident["evidenceFactors"]]


def test_conflict_does_not_duplicate_verify_tasks():
    world = World()
    world.intake(obs("obs_01", "uid_sari", "small_flame"))
    world.intake(obs("obs_02", "uid_rizal", "none"))
    plan = world.intake(obs("obs_03", "uid_rizal", "none"))
    assert plan.tasks == []
    assert len(world.state.conflicts) == 1
    assert "obs_03" in plan.conflict["observationIds"]


def test_distance_separates_incidents():
    world = World()
    near = world.intake(obs("obs_a", "uid_sari", "small_flame"))
    # about 1.1 km north, beyond the 300 m radius
    far = world.intake(obs("obs_b", "uid_rizal", "none", lat=BASE[0] + 0.01))
    assert far.incident["id"] != near.incident["id"]
    assert len(world.state.incidents) == 2
    assert far.conflict is None
    assert far.incident["observationIds"] == ["obs_b"]


def test_large_flame_withdraws_everyone_on_incident_without_approval():
    world = World()
    world.intake(obs("obs_01", "uid_sari", "small_flame"))
    world.intake(obs("obs_02", "uid_rizal", "none"))
    plan = world.intake(obs("obs_03", "uid_ayu", "large_flame"))
    withdraw = plan.incident["withdraw"]
    assert withdraw["active"] is True
    assert withdraw["reasons"] == ["large flame reported"]
    assert withdraw["volunteerIds"] == ["uid_ayu", "uid_rizal", "uid_sari"]
    assert withdraw["instruction"]
    tasks = [t for t in plan.tasks if t["type"] == "withdraw"]
    assert sorted(t["volunteerId"] for t in tasks) == withdraw["volunteerIds"]
    assert all(t["status"] == "approved" for t in tasks)
    audits = [a for a in plan.audits if a["action"] == "task.withdraw"]
    assert len(audits) == 1
    assert audits[0]["actorId"] == "code"
    assert audits[0]["targetId"] == plan.incident["id"]
    assert audits[0]["at"] == NOW
    assert plan.incident["severity"] == "large_flame"
    raise_audits = [a for a in plan.audits if a["action"] == "incident.severity.raise"]
    assert raise_audits and raise_audits[0]["actorId"] == "code"


def test_high_wind_withdraws():
    world = World()
    plan = world.intake(obs("obs_01", "uid_sari", "smoke"), wind_kmh=45)
    withdraw = plan.incident["withdraw"]
    assert withdraw["active"] is True
    assert withdraw["volunteerIds"] == ["uid_sari"]
    assert withdraw["reasons"][0].startswith("wind 45 km/h")
    assert plan.incident["severity"] == "smoke"
    assert [a["action"] for a in plan.audits] == ["task.withdraw"]


def test_wind_below_threshold_does_not_withdraw():
    world = World()
    plan = world.intake(obs("obs_01", "uid_sari", "smoke"), wind_kmh=39.9)
    assert plan.incident["withdraw"] is None
    assert plan.audits == []


def test_wind_threshold_is_a_setting():
    world = World()
    plan = world.intake(obs("obs_01", "uid_sari", "smoke"), wind_kmh=25,
                        settings=Settings(wind_withdraw_kmh=20))
    assert plan.incident["withdraw"]["active"] is True


def test_active_withdraw_extends_to_newcomers():
    world = World()
    world.intake(obs("obs_01", "uid_sari", "large_flame"))
    plan = world.intake(obs("obs_02", "uid_rizal", "smoke"))
    assert plan.incident["withdraw"]["volunteerIds"] == ["uid_rizal", "uid_sari"]
    assert [t["volunteerId"] for t in plan.tasks if t["type"] == "withdraw"] == ["uid_rizal"]
    assert [a["action"] for a in plan.audits] == ["task.withdraw"]


def test_code_never_lowers_or_closes():
    world = World()
    world.intake(obs("obs_01", "uid_sari", "large_flame"))
    plan = world.intake(obs("obs_02", "uid_sari", "smoke"))
    assert plan.incident["severity"] == "large_flame"
    assert plan.incident["withdraw"]["active"] is True


def test_human_status_is_kept():
    status = "verified"
    world = World()
    first = world.intake(obs("obs_01", "uid_sari", "small_flame"))
    world.state.incidents[0]["status"] = status
    plan = world.intake(obs("obs_02", "uid_rizal", "none"))
    assert plan.incident["id"] == first.incident["id"]
    assert plan.incident["status"] == status
    assert plan.conflict["dispatchHeld"] is True


def test_extinguished_incident_is_not_reopened():
    world = World()
    first = world.intake(obs("obs_01", "uid_sari", "small_flame"))
    world.state.incidents[0]["status"] = "extinguished"
    plan = world.intake(obs("obs_02", "uid_sari", "smoke"))
    assert plan.incident["id"] != first.incident["id"]
    assert plan.incident["status"] == "open"


def test_live_severity_is_not_copied_onto_incident():
    world = World()
    plan = world.intake(obs("obs_01", "uid_sari", "small_flame", source="live"))
    assert plan.incident["severity"] == "unknown"
    plan = world.intake(obs("obs_02", "uid_rizal", "none", source="live"))
    assert plan.conflict is None


def test_live_large_flame_still_withdraws():
    world = World()
    plan = world.intake(obs("obs_01", "uid_sari", "large_flame", source="live"))
    assert plan.incident["withdraw"]["active"] is True
    assert plan.incident["severity"] == "unknown"


def test_unknown_does_not_change_known_severity():
    world = World()
    world.intake(obs("obs_01", "uid_sari", "smoke"))
    plan = world.intake(obs("obs_02", "uid_rizal", "unknown"))
    assert plan.incident["severity"] == "smoke"
    assert plan.audits == []


def test_repeat_intake_is_a_no_op():
    world = World()
    observation = obs("obs_01", "uid_sari", "small_flame")
    world.intake(observation)
    plan = world.intake(observation)
    assert plan.skipped is True
    assert len(world.state.incidents) == 1


def test_evidence_is_bounded_and_explained():
    many = [
        obs(f"o{i}", f"uid_{i}", "large_flame", accuracyM=10, photoPath="p/x.jpg")
        for i in range(6)
    ]
    score, factors = evidence(many, conflict_open=False)
    assert score == 100
    assert {f["factor"] for f in factors} == {"severity", "corroboration", "photo", "gps"}
    score, _ = evidence([obs("o", "u", "none")], conflict_open=True)
    assert score == 0
