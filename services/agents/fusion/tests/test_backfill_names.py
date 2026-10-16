import importlib.util
import os

import pytest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "scripts", "backfill-incident-names.py")
spec = importlib.util.spec_from_file_location("backfill_incident_names", SCRIPT)
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)


def _store():
    incidents = {
        "inc_bare": {"lat": 1.482, "lng": 102.115, "observationIds": ["o2"]},
        "inc_far": {"lat": 40.0, "lng": 0.5, "observationIds": ["o1"]},
        "inc_named": {"name": "Dumai, Riau · Sari · #7", "area": "Dumai, Riau", "lat": 1.67, "lng": 101.45, "observationIds": []},
        "inc_name_only": {"name": "Pekanbaru, Riau · #5", "lat": 0.5, "lng": 101.4, "observationIds": []},
        "inc_area_only": {"area": "Jambi, Jambi", "lat": -1.61, "lng": 103.61, "observationIds": []},
    }
    observations = {
        "o1": {"id": "o1", "volunteerId": "uid_a", "volunteerName": "Pak Dedi", "capturedAt": "2026-10-16T08:00:00Z"},
        "o2": {"id": "o2", "volunteerId": "uid_b", "capturedAt": "2026-10-16T09:00:00Z"},
    }
    return backfill.MemoryStore(incidents, observations, {"uid_b": {"displayName": "Sari"}}, counter=7)


def test_plan_names_in_report_order_and_never_touches_a_complete_incident():
    store = _store()
    incidents, observations, counter = store.load()
    items = {i["id"]: i for i in backfill.plan(incidents, observations, store.volunteer_name, counter)}
    assert "inc_named" not in items
    assert items["inc_far"]["name"] == "40.00°N 0.50°E · Pak Dedi · #8"
    assert items["inc_bare"]["name"] == "Bengkalis, Riau · Sari · #9"
    assert items["inc_bare"]["area"] == "Bengkalis, Riau"


def test_an_existing_name_keeps_its_name_and_only_gains_an_area():
    store = _store()
    incidents, observations, counter = store.load()
    items = {i["id"]: i for i in backfill.plan(incidents, observations, store.volunteer_name, counter)}
    assert items["inc_name_only"]["name"] is None
    assert items["inc_name_only"]["area"] == "Pekanbaru, Riau"
    assert items["inc_area_only"]["area"] is None
    assert items["inc_area_only"]["name"] == "Jambi, Jambi · #10"


def test_the_reporter_part_is_left_out_when_no_name_exists():
    store = backfill.MemoryStore({"inc": {"lat": 1.0, "lng": 2.0, "observationIds": []}})
    incidents, observations, counter = store.load()
    (item,) = backfill.plan(incidents, observations, store.volunteer_name, counter)
    assert item["name"] == "1.00°N 2.00°E · #1"


def test_dry_run_writes_nothing():
    store = _store()
    lines = []
    count = backfill.run(store, apply=False, out=lines.append)
    assert count == 4
    assert store.counter == 7
    assert "name" not in store.incidents["inc_bare"] and "area" not in store.incidents["inc_bare"]
    assert any("Nothing was written" in line for line in lines)


def test_apply_writes_names_and_never_overwrites():
    store = _store()
    before = dict(store.incidents["inc_named"]), dict(store.incidents["inc_name_only"])
    backfill.run(store, apply=True, out=lambda line: None)
    assert store.incidents["inc_far"]["name"] == "40.00°N 0.50°E · Pak Dedi · #8"
    assert store.incidents["inc_far"]["area"] == "40.00°N 0.50°E"
    assert store.incidents["inc_bare"]["name"] == "Bengkalis, Riau · Sari · #9"
    assert store.counter == 10
    assert store.incidents["inc_named"] == before[0]
    assert store.incidents["inc_name_only"]["name"] == before[1]["name"]
    # A second run finds nothing left to do.
    lines = []
    assert backfill.run(store, apply=True, out=lines.append) == 0
    assert store.counter == 10
    assert "Nothing to do" in lines[0]


def test_an_incident_named_in_the_meantime_is_skipped():
    store = _store()
    incidents, observations, counter = store.load()
    items = backfill.plan(incidents, observations, store.volunteer_name, counter)
    store.incidents["inc_bare"]["name"] = "Bengkalis, Riau · #99"
    store.incidents["inc_bare"]["area"] = "Bengkalis, Riau"
    item = next(i for i in items if i["id"] == "inc_bare")
    before = store.counter
    assert store.write(item) is None
    assert store.counter == before


def test_the_script_needs_apply_to_write(monkeypatch):
    seen = {}
    monkeypatch.setattr(backfill, "FirestoreStore", lambda: "store")
    monkeypatch.setattr(backfill, "run", lambda store, apply, out=print: seen.update(store=store, apply=apply))
    backfill.main([])
    assert seen == {"store": "store", "apply": False}
    backfill.main(["--apply"])
    assert seen["apply"] is True
