from live.seat import apply_disconnect, apply_signal, parse_signal
from live.store import MemoryStore
from live.test_session import USER, _msg, _run


def test_parse_signal():
    assert parse_signal("3G") == "3g"
    assert parse_signal("wifi") == "wifi"
    assert parse_signal("5g") is None


def test_weak_signal_frees_holder_seat():
    seat = {
        "incidentId": "inc_01",
        "status": "held",
        "holderId": "uid_sari",
        "volunteers": {"uid_sari": {"signal": "4g", "media": "live"}},
    }
    updated, action = apply_signal(seat, "uid_sari", "2g", "2026-10-16T14:31:00Z")
    assert action == "live.drop"
    assert updated["status"] == "free"
    assert updated["holderId"] is None
    assert updated["lastDrop"]["reason"] == "signal_below_3g"
    assert updated["volunteers"]["uid_sari"]["media"] == "photo_60s"


def test_strong_signal_does_not_drop():
    seat = {
        "incidentId": "inc_01",
        "status": "held",
        "holderId": "uid_sari",
        "volunteers": {"uid_sari": {"signal": "4g", "media": "live"}},
    }
    updated, action = apply_signal(seat, "uid_sari", "3g", "2026-10-16T14:31:00Z")
    assert action is None
    assert updated["holderId"] == "uid_sari"
    assert updated["volunteers"]["uid_sari"]["signal"] == "3g"


def test_signal_merge_keeps_other_volunteers():
    """Sequential merges must keep every volunteer's row (what a transaction retries with)."""
    seat = {
        "incidentId": "inc_01",
        "status": "free",
        "holderId": None,
        "volunteers": {},
    }
    seat, _ = apply_signal(seat, "uid_sari", "2g", "2026-10-16T14:30:00Z")
    seat, _ = apply_signal(seat, "uid_rizal", "4g", "2026-10-16T14:30:01Z")
    assert seat["volunteers"]["uid_sari"]["signal"] == "2g"
    assert seat["volunteers"]["uid_rizal"]["signal"] == "4g"


def test_disconnect_frees_holder():
    seat = {
        "incidentId": "inc_01",
        "status": "held",
        "holderId": "uid_sari",
        "volunteers": {"uid_sari": {"signal": "4g", "media": "live"}},
    }
    updated, action = apply_disconnect(seat, "uid_sari", "2026-10-16T14:32:00Z", "4g")
    assert action == "live.drop"
    assert updated["lastDrop"]["reason"] == "connection_lost"


def test_location_signal_drops_held_seat_in_session():
    store = MemoryStore()
    store.observations.append({"id": "obs_1", "volunteerId": "uid_sari"})
    store.incidents.append({
        "id": "inc_01",
        "status": "open",
        "severity": "smoke",
        "withdraw": None,
        "lat": 1.0,
        "lng": 2.0,
        "observationIds": ["obs_1"],
    })
    store.live_seats["inc_01"] = {
        "incidentId": "inc_01",
        "status": "held",
        "holderId": "uid_sari",
        "lastDrop": None,
        "volunteers": {"uid_sari": {"signal": "4g", "media": "live"}},
    }
    _run([
        _msg({"type": "location", "lat": 1.0, "lng": 2.0, "capturedAt": "2026-10-16T14:30:00Z", "signal": "2g"}),
        _msg({"type": "session.start"}),
        _msg({"type": "session.stop"}),
    ], store=store)
    seat = store.live_seats["inc_01"]
    assert seat["holderId"] is None
    assert seat["lastDrop"]["reason"] == "signal_below_3g"
    assert any(a["action"] == "live.drop" for a in store.audits)
