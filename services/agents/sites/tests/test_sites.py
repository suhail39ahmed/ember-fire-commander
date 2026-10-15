import pytest

import sites.routes
from app import app
from sites.store import FirestoreSitesStore, MemorySitesStore
from sites.watch import MAX_ALERTS, remember, scan

SITE = (1.482, 102.115)
EXT_AT = "2026-10-13T10:00:00.000Z"
NOW = "2026-10-14T00:00:00.000Z"


@pytest.fixture
def clock(monkeypatch):
    """A fixed, movable clock so the tests do not age out as real time passes."""
    state = {"now": NOW}
    monkeypatch.setattr(sites.routes, "_now", lambda: state["now"])
    return state


@pytest.fixture
def store(monkeypatch, clock):
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
    assert body == {"sitesWatched": 1, "sitesRemembered": 1, "sitesExpired": 0, "alertsCreated": 1}
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
    assert body == {"sitesWatched": 1, "sitesRemembered": 0, "sitesExpired": 0, "alertsCreated": 0}
    assert len(store.collections["sites"]["inc_01"]["alerts"]) == 1
    assert len([a for a in store.collections["audit"].values() if a["action"] == "site.reinspect"]) == 1


def test_scan_is_pure():
    site = remember({"id": "inc_9", "lat": 0.0, "lng": 0.0}, "2026-01-01T00:00:00Z", radius_m=100)
    item = {"id": "o1", "lat": 0.0005, "lng": 0.0, "receivedAt": "2026-01-02T00:00:00Z"}
    result = scan([site], [item], [], lambda c: f"{c}_1", "2026-01-02T00:01:00Z")
    assert len(result.sites) == 1
    assert site["alerts"] == []  # input not mutated


# ---- watch window, expiry and the incremental read window ----

class CountingStore(MemorySitesStore):
    """Records the `since` values handed to the observation and lead reads."""

    def __init__(self):
        super().__init__()
        self.reads = []

    def observations_since(self, since):
        self.reads.append(since)
        return super().observations_since(since)


@pytest.fixture
def counting(monkeypatch, clock):
    memory = CountingStore()
    monkeypatch.setattr(sites.routes, "get_store", lambda: memory)
    return memory


def extinguished(store, iid, at, lat=SITE[0]):
    store.collections["incidents"][iid] = {
        "status": "extinguished", "severity": "small_flame", "lat": lat, "lng": SITE[1],
        "observationIds": [], "withdraw": None, "conflictId": None, "evidenceScore": 50,
    }
    store.collections["audit"][f"aud_{iid}"] = {
        "actorId": "uid_maya", "action": "incident.extinguish", "targetId": iid, "at": at,
    }


def test_remember_sets_expiry_from_extinguish_time():
    site = remember({"id": "inc_9", "lat": 0.0, "lng": 0.0}, "2026-10-01T00:00:00.000Z", watch_days=14)
    assert site["expiresAt"] == "2026-10-15T00:00:00.000Z"
    assert remember({"id": "i", "lat": 0, "lng": 0}, "2026-10-01T00:00:00Z")["expiresAt"] == "2026-10-15T00:00:00.000Z"


def test_site_past_its_watch_window_expires_and_is_not_scanned(client, store, clock):
    client.post("/internal/sites/scan")  # remembers inc_01
    clock["now"] = "2026-10-28T00:00:00.000Z"  # 15 days after EXT_AT
    obs(store, "obs_late", SITE[0], received="2026-10-27T12:00:00.000Z")
    body = client.post("/internal/sites/scan").get_json()
    assert body == {"sitesWatched": 0, "sitesRemembered": 0, "sitesExpired": 1, "alertsCreated": 0}
    site = store.collections["sites"]["inc_01"]
    assert site["status"] == "expired" and site["alerts"] == []
    # an expired site is neither scanned nor remembered again
    body = client.post("/internal/sites/scan").get_json()
    assert body == {"sitesWatched": 0, "sitesRemembered": 0, "sitesExpired": 0, "alertsCreated": 0}
    assert store.collections["sites"]["inc_01"]["status"] == "expired"


def test_watch_window_is_configurable(client, store, clock, monkeypatch):
    monkeypatch.setenv("EMBER_SITE_WATCH_DAYS", "1")
    client.post("/internal/sites/scan")
    assert store.collections["sites"]["inc_01"]["expiresAt"] == "2026-10-14T10:00:00.000Z"
    clock["now"] = "2026-10-14T10:00:00.000Z"
    assert client.post("/internal/sites/scan").get_json()["sitesExpired"] == 1


def test_bad_watch_days_falls_back_to_default(client, store, monkeypatch):
    for bad in ("abc", "0", "-3"):
        monkeypatch.setenv("EMBER_SITE_WATCH_DAYS", bad)
        assert sites.routes._watch_days() == 14


def test_legacy_site_without_expiry_expires_from_extinguish_time(client, store, clock):
    store.collections["sites"]["inc_01"] = {
        "incidentId": "inc_01", "lat": SITE[0], "lng": SITE[1], "radiusM": 500.0,
        "extinguishedAt": EXT_AT, "observationIds": [], "status": "watching", "alerts": [],
    }
    clock["now"] = "2026-10-28T00:00:00.000Z"
    body = client.post("/internal/sites/scan").get_json()
    assert body["sitesExpired"] == 1 and body["sitesRemembered"] == 0
    assert store.collections["sites"]["inc_01"]["status"] == "expired"


def test_read_window_is_incremental_and_bounded(client, counting, clock):
    extinguished(counting, "inc_01", EXT_AT)
    client.post("/internal/sites/scan")
    assert counting.reads[-1] == EXT_AT  # a new site is read from its own extinguish time
    assert counting.last_scanned_at() == NOW
    clock["now"] = "2026-10-14T00:15:00.000Z"
    client.post("/internal/sites/scan")
    assert counting.reads[-1] == "2026-10-13T23:55:00.000Z"  # last scan minus a 5 minute overlap
    clock["now"] = "2026-10-14T06:00:00.000Z"
    client.post("/internal/sites/scan")
    assert counting.reads[-1] == "2026-10-14T00:10:00.000Z"  # last scan minus overlap, however long the gap


def test_window_never_reaches_back_past_the_watch_window(client, counting, clock):
    extinguished(counting, "inc_01", "2026-09-01T00:00:00.000Z")
    clock["now"] = "2026-09-10T00:00:00.000Z"
    client.post("/internal/sites/scan")
    # a stale last-scan time must not drag the read window out further than the watch window
    counting.set_last_scanned_at("2026-01-01T00:00:00.000Z")
    clock["now"] = "2026-09-12T00:00:00.000Z"
    client.post("/internal/sites/scan")
    assert counting.reads[-1] == "2026-09-01T00:00:00.000Z"
    assert counting.reads[-1] >= "2026-08-29T00:00:00.000Z"  # now minus 14 days


def test_activity_before_last_scan_is_not_missed_for_a_new_site(client, counting, clock):
    client.post("/internal/sites/scan")  # no sites yet: records the scan time only
    assert counting.last_scanned_at() == NOW
    extinguished(counting, "inc_new", "2026-10-13T23:00:00.000Z")
    obs(counting, "obs_between", SITE[0], received="2026-10-13T23:30:00.000Z")
    clock["now"] = "2026-10-14T00:15:00.000Z"
    body = client.post("/internal/sites/scan").get_json()
    assert body["alertsCreated"] == 1
    assert counting.collections["sites"]["inc_new"]["alerts"][0]["sourceId"] == "obs_between"


def test_new_activity_after_last_scan_still_alerts(client, counting, clock):
    extinguished(counting, "inc_01", EXT_AT)
    client.post("/internal/sites/scan")
    obs(counting, "obs_next", SITE[0], received="2026-10-14T00:10:00.000Z")
    clock["now"] = "2026-10-14T00:15:00.000Z"
    assert client.post("/internal/sites/scan").get_json()["alertsCreated"] == 1


def test_alerts_are_capped_to_the_newest(client, store, clock):
    client.post("/internal/sites/scan")
    for n in range(MAX_ALERTS + 10):
        obs(store, f"obs_{n:03d}", SITE[0], received=f"2026-10-14T00:05:{n % 60:02d}.000Z")
    clock["now"] = "2026-10-14T00:15:00.000Z"
    body = client.post("/internal/sites/scan").get_json()
    assert body["alertsCreated"] == MAX_ALERTS + 10
    alerts = store.collections["sites"]["inc_01"]["alerts"]
    assert len(alerts) == MAX_ALERTS
    assert alerts[-1]["sourceId"] == f"obs_{MAX_ALERTS + 9:03d}"


def test_extinguish_times_are_read_in_batches_of_thirty():
    queries = []

    class Snap:
        def __init__(self, data):
            self._d = data

        def to_dict(self):
            return dict(self._d)

        id = "x"

    class Query:
        def __init__(self, db, filters):
            self.db, self.filters = db, filters

        def where(self, field, op, value):
            return Query(self.db, self.filters + [(field, op, value)])

        def stream(self):
            self.db.append(self.filters)
            ids = dict((f, v) for f, _, v in self.filters)["targetId"]
            return [Snap({"targetId": i, "action": "incident.extinguish", "at": f"2026-10-13T10:00:{n % 60:02d}Z"})
                    for n, i in enumerate(ids)]

    class Client:
        def collection(self, name):
            assert name == "audit"
            return Query(queries, [])

    store = FirestoreSitesStore(client=Client())
    ids = [f"inc_{n}" for n in range(65)]
    times = store.extinguished_times(ids)
    assert len(queries) == 3  # 30 + 30 + 5, not 65 queries
    assert set(times) == set(ids)
    assert all(("action", "==", "incident.extinguish") in q for q in queries)
    assert all(len(dict((f, v) for f, _, v in q)["targetId"]) <= 30 for q in queries)


def test_new_sites_use_one_batched_audit_read(client, store, monkeypatch):
    for n in range(3):
        extinguished(store, f"inc_x{n}", EXT_AT)
    calls = []
    original = store.extinguished_times
    monkeypatch.setattr(store, "extinguished_times", lambda ids: calls.append(list(ids)) or original(ids))
    client.post("/internal/sites/scan")
    assert len(calls) == 1 and len(calls[0]) == 4  # inc_01 from the fixture plus three more
