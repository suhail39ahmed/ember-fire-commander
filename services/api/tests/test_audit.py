import pytest

import identity
from app import app
from incidents import store
from incidents.fake_firestore import FakeFirestore


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya"):
    monkeypatch.setattr(
        identity, "verify_id_token",
        lambda token: {"uid": uid, "name": name, "role": role},
    )


AUTH = {"Authorization": "Bearer valid"}


def _seed(fake):
    fake.add("volunteers", "uid_maya", {"displayName": "Bu Maya"})
    fake.add("volunteers", "uid_sari", {"displayName": "Sari"})
    fake.add("volunteers", "uid_dedi", {"displayName": "Pak Dedi"})
    fake.add("incidents", "inc_tohor", {
        "name": "TOHOR-3",
        "severity": "large_flame",
        "conflictId": None,
        "observationIds": ["obs_1"],
        "withdraw": {
            "active": True,
            "volunteerIds": ["uid_sari", "uid_dedi"],
            "instruction": "Withdraw now",
        },
    })
    fake.add("incidents", "inc_held", {
        "name": "KARIMUN-1",
        "severity": "small_flame",
        "conflictId": "con_1",
        "observationIds": [],
    })
    fake.add("tasks", "task_verify", {
        "incidentId": "inc_held",
        "volunteerId": "uid_sari",
        "type": "verify",
        "status": "approved",
        "instruction": "Check east bank",
    })
    fake.add("tasks", "task_edit", {
        "incidentId": "inc_held",
        "volunteerId": "uid_dedi",
        "type": "investigate",
        "status": "proposed",
        "instruction": "New instruction",
    })
    fake.add("observations", "obs_1", {
        "volunteerId": "uid_sari",
        "chip": "aman",
        "severity": "none",
    })
    fake.add("audit", "aud_3", {
        "actorId": "uid_maya", "action": "task.edit", "targetId": "task_edit",
        "at": "2026-10-16T14:12:00Z",
    })
    fake.add("audit", "aud_2", {
        "actorId": "uid_maya", "action": "task.approve", "targetId": "task_verify",
        "at": "2026-10-16T14:15:00Z",
    })
    fake.add("audit", "aud_1", {
        "actorId": "code", "action": "task.withdraw", "targetId": "inc_tohor",
        "at": "2026-10-16T14:21:00Z",
    })
    fake.add("audit", "aud_0", {
        "actorId": "uid_sari", "action": "observation.create", "targetId": "obs_1",
        "at": "2026-10-16T14:08:00Z",
    })


def test_audit_needs_a_token(client):
    assert client.get("/audit").status_code == 401


def test_audit_rejects_a_volunteer(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari")
    assert client.get("/audit", headers=AUTH).status_code == 403


def test_audit_returns_newest_first_with_names_and_detail(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch)
    _seed(fake)

    body = client.get("/audit", headers=AUTH).get_json()
    assert body["nextCursor"] is None
    actions = [item["action"] for item in body["items"]]
    assert actions == ["task.withdraw", "task.approve", "task.edit", "observation.create"]

    withdraw = body["items"][0]
    assert withdraw["actorName"] == "AI"
    assert withdraw["actorId"] == "code"
    assert withdraw["target"] == "TOHOR-3"
    assert withdraw["incidentId"] == "inc_tohor"
    assert "Sari" in withdraw["detail"]
    assert "Pak Dedi" in withdraw["detail"]

    approve = body["items"][1]
    assert approve["actorName"] == "Bu Maya"
    assert approve["target"] == "verify · Sari"
    assert approve["detail"] == "Approved while conflict open (allowed)"
    assert approve["incidentId"] == "inc_held"

    edit = body["items"][2]
    assert edit["detail"] == "Instruction replaced"
    assert edit["target"] == "investigate · Pak Dedi"

    obs = body["items"][3]
    assert obs["actorName"] == "Sari"
    assert obs["actorId"] == "uid_sari"
    assert obs["target"] == "obs · Sari"
    assert obs["detail"] == "chip aman · none"
    assert obs["incidentId"] == "inc_tohor"


def test_audit_empty(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch)
    body = client.get("/audit", headers=AUTH).get_json()
    assert body == {"items": [], "nextCursor": None}


def test_audit_filter_and_cursor(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch)
    _seed(fake)

    filtered = client.get("/audit?targetId=inc_tohor", headers=AUTH).get_json()
    assert [i["id"] for i in filtered["items"]] == ["aud_1"]

    page = client.get("/audit?limit=2", headers=AUTH).get_json()
    assert len(page["items"]) == 2
    assert page["items"][0]["id"] == "aud_1"
    assert page["nextCursor"]

    page2 = client.get(f"/audit?limit=2&cursor={page['nextCursor']}", headers=AUTH).get_json()
    assert [i["id"] for i in page2["items"]] == ["aud_3", "aud_0"]


def test_audit_never_shows_a_raw_id_for_a_person_or_an_incident(client, monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    _as(monkeypatch)
    # No volunteer records at all: names must come from the row, a report, or the role.
    fake.add("incidents", "inc_13sWGNQce9QZLmgGQznA", {
        "severity": "smoke", "observationIds": ["obs_1"], "lat": 13.05, "lng": 77.63,
    })
    fake.add("incidents", "inc_named", {"name": "Bengkalis, Riau · Pak Dedi · #3", "observationIds": []})
    fake.add("observations", "obs_1", {
        "volunteerId": "IUR0XPrGPvTqpApb7bkCRBcC0a2", "volunteerName": "Pak Dedi", "chip": "asap", "severity": "smoke",
    })
    fake.add("tasks", "task_1", {
        "incidentId": "inc_13sWGNQce9QZLmgGQznA", "volunteerId": "IUR0XPrGPvTqpApb7bkCRBcC0a2",
        "type": "instruct", "status": "approved", "instruction": "Move to the road",
    })
    fake.add("audit", "a1", {
        "actorId": "uid_maya", "actorName": "Bu Maya", "action": "task.instruct", "targetId": "task_1",
        "at": "2026-10-16T14:30:00Z",
    })
    fake.add("audit", "a2", {
        "actorId": "uid_older", "action": "incident.verify", "targetId": "inc_13sWGNQce9QZLmgGQznA",
        "at": "2026-10-16T14:20:00Z",
    })
    fake.add("audit", "a3", {
        "actorId": "IUR0XPrGPvTqpApb7bkCRBcC0a2", "action": "observation.create", "targetId": "obs_1",
        "at": "2026-10-16T14:10:00Z",
    })
    fake.add("audit", "a4", {
        "actorId": "uid_dev1", "action": "task.heard", "targetId": "task_1", "at": "2026-10-16T14:05:00Z",
    })
    fake.add("audit", "a5", {
        "actorId": "uid_older", "action": "incident.extinguish", "targetId": "inc_named", "at": "2026-10-16T14:01:00Z",
    })
    items = {i["id"]: i for i in client.get("/audit", headers=AUTH).get_json()["items"]}
    assert items["a1"]["actorName"] == "Bu Maya"
    assert items["a1"]["target"] == "instruct · Pak Dedi"
    # A row from before names were stored, by a supervisor with no record: the role, not the uid.
    assert items["a2"]["actorName"] == "Supervisor"
    assert items["a2"]["target"] == "Incident · 13.05°N 77.63°E"
    assert items["a3"]["actorName"] == "Pak Dedi"
    assert items["a3"]["target"] == "obs · Pak Dedi"
    assert items["a4"]["actorName"] == "Volunteer"
    assert items["a5"]["target"] == "Bengkalis, Riau · Pak Dedi · #3"
    for item in items.values():
        text = " ".join(str(v) for v in item.values() if v is not None and v not in (item["actorId"], item["targetId"], item["incidentId"], item["id"]))
        assert "IUR0XPrG" not in text and "uid_" not in text and "inc_13sW" not in text
