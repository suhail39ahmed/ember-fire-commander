import pytest

import sites.routes
from app import app
from sites.store import MemorySitesStore
from sites.watch import remember, scan

SITE = (1.482, 102.115)
EXT_AT = "2026-10-13T10:00:00.000Z"


@pytest.fixture
def store(monkeypatch):
    memory = MemorySitesStore()
    monkeypatch.setattr(sites.routes, "get_store", lambda: memory)
    memory.collections["incidents"]["inc_01"] = {
        "status": "extinguished", "severity": "small_flame", "lat": SITE[0], "lng": SITE[1],
        "observationIds": ["obs_old"], "withdraw": None, "conflictId": None, "evidenceScore": 50,
    }
    memory.collections["audit"]["aud_x"] = {
        "actorId": "uid_maya", "action": "incident.extinguish", "targetId": "inc_01", "at": EXT_AT,
    }
    return memory


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def obs(store, oid, lat, received="2026-10-13T12:00:00.000Z"):
    store.collections["observations"][oid] = {
        "volunteerId": "uid_sari", "source": "chip", "severity": "smoke", "lat": lat,
        "lng": SITE[1], "receivedAt": received, "immutable": True,
    }


def test_nearby_new_observation_raises_reinspect_alert(client, store):
    obs(store, "obs_new", SITE[0] + 0.001)  # ~110 m away
    before = dict(store.collections["incidents"]["inc_01"])
    body = client.post("/internal/sites/scan").get_json()
    assert body == {"sitesWatched": 1, "sitesRemembered": 1, "alertsCreated": 1}
    site = store.collections["sites"]["inc_01"]
    assert site["status"] == "reinspect"
    assert site["extinguishedAt"] == EXT_AT
    [alert] = site["alerts"]
    assert alert["kind"] == "observation" and alert["sourceId"] == "obs_new"
    assert 90 <= alert["distanceM"] <= 130
    audits = [a for a in store.collections["audit"].values() if a["action"] == "site.reinspect"]
    assert len(audits) == 1 and audits[0]["actorId"] == "code"
    # never reopened, verified, or re-rated
    assert store.collections["incidents"]["inc_01"] == before


def test_distant_observation_does_not_alert(client, store):
    obs(store, "obs_far", SITE[0] + 0.02)  # ~2.2 km away
    body = client.post("/internal/sites/scan").get_json()
    assert body["alertsCreated"] == 0
    site = store.collections["sites"]["inc_01"]
    assert site["status"] == "watching" and site["alerts"] == []
    assert store.collections["incidents"]["inc_01"]["status"] == "extinguished"


def test_nearby_firms_lead_alerts(client, store):
    store.collections["leads"]["firms-abc"] = {
        "source": "firms", "label": "unverified_lead", "needsHumanVerification": True,
        "confirmedFire": False, "status": "to_verify", "lat": SITE[0], "lng": SITE[1] + 0.002,
        "acqAt": "2026-10-13T11:40:00Z", "firstSeenAt": "2026-10-13T12:00:00Z",
    }
    client.post("/internal/sites/scan")
    [alert] = store.collections["sites"]["inc_01"]["alerts"]
    assert alert["kind"] == "lead" and alert["sourceId"] == "firms-abc"
    assert store.collections["leads"]["firms-abc"]["status"] == "to_verify"


def test_old_and_own_observations_are_ignored(client, store):
    obs(store, "obs_before", SITE[0], received="2026-10-13T09:00:00.000Z")
    obs(store, "obs_old", SITE[0], received="2026-10-13T11:00:00.000Z")
    assert client.post("/internal/sites/scan").get_json()["alertsCreated"] == 0


def test_rescan_does_not_duplicate(client, store):
    obs(store, "obs_new", SITE[0])
    client.post("/internal/sites/scan")
    body = client.post("/internal/sites/scan").get_json()
    assert body == {"sitesWatched": 1, "sitesRemembered": 0, "alertsCreated": 0}
    assert len(store.collections["sites"]["inc_01"]["alerts"]) == 1
    assert len([a for a in store.collections["audit"].values() if a["action"] == "site.reinspect"]) == 1


def test_scan_is_pure():
    site = remember({"id": "inc_9", "lat": 0.0, "lng": 0.0}, "2026-01-01T00:00:00Z", radius_m=100)
    item = {"id": "o1", "lat": 0.0005, "lng": 0.0, "receivedAt": "2026-01-02T00:00:00Z"}
    result = scan([site], [item], [], lambda c: f"{c}_1", "2026-01-02T00:01:00Z")
    assert len(result.sites) == 1
    assert site["alerts"] == []  # input not mutated
