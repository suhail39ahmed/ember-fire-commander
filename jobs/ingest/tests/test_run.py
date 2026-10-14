import json

from ingest import run
from ingest.config import Settings
from ingest.store import MemoryStore

NOW = "2026-10-14T06:00:00Z"
S = Settings(project="test")


def key(name):
    return "TESTKEY" if name == "FIRMS_MAP_KEY" else None


def test_run_against_recorded_fixtures(fixtures_dir):
    store = MemoryStore()
    report = run.run_once(S, store, fetch=run.fixture_fetcher(fixtures_dir), secret=key, now=NOW, run_id="r1")
    assert report["ok"] is True
    assert report["sources"]["firms"] == {"ok": True, "leads": 4}
    leads = store.collections["leads"]
    assert len(leads) == 4
    for lead in leads.values():
        assert lead["label"] == "unverified_lead" and lead["confirmedFire"] is False
        assert lead["status"] == "to_verify" and lead["firstSeenAt"] == NOW and lead["ingestRunId"] == "r1"
    assert store.collections["weather"]["current"]["windKmh"] == 7.1
    assert store.collections["psi"]["current"]["psi24hMax"] > 0
    assert store.collections["ingestRuns"]["r1"]["ok"] is True
    # leads are stored apart from verified incidents; ingest never writes those
    assert set(store.collections) == {"leads", "weather", "psi", "ingestRuns"}


def test_failures_are_reported_and_keep_previous_data(fixtures_dir):
    store = MemoryStore()
    run.run_once(S, store, fetch=run.fixture_fetcher(fixtures_dir), secret=key, now=NOW, run_id="r1")
    before = json.loads(json.dumps(store.collections))
    store.collections["leads"][next(iter(store.collections["leads"]))]["status"] = "checked_no_fire"
    marked = json.loads(json.dumps(store.collections["leads"]))

    def broken(url, **_):
        raise OSError("network down")
    report = run.run_once(S, store, fetch=broken, secret=key, now="2026-10-14T07:00:00Z", run_id="r2")

    assert report["ok"] is False
    for name in ("firms", "weather", "psi"):
        assert report["sources"][name]["ok"] is False
        assert "network down" in report["sources"][name]["error"]
    assert store.collections["leads"] == marked
    assert store.collections["weather"] == before["weather"]
    assert store.collections["psi"] == before["psi"]
    assert store.collections["ingestRuns"]["r2"]["ok"] is False


def test_one_source_failing_does_not_block_the_others(fixtures_dir):
    good = run.fixture_fetcher(fixtures_dir)

    def weather_down(url, **kw):
        if "open-meteo" in url:
            return "<html>502</html>"
        return good(url, **kw)
    store = MemoryStore({"weather": {"current": {"windKmh": 12.0}}})
    report = run.run_once(S, store, fetch=weather_down, secret=key, now=NOW, run_id="r1")
    assert report["sources"]["firms"]["ok"] and report["sources"]["psi"]["ok"]
    assert report["sources"]["weather"]["ok"] is False
    assert store.collections["weather"]["current"] == {"windKmh": 12.0}


def test_missing_firms_key_fails_only_firms(fixtures_dir):
    store = MemoryStore()
    report = run.run_once(S, store, fetch=run.fixture_fetcher(fixtures_dir), secret=lambda n: None, now=NOW, run_id="r1")
    assert report["sources"]["firms"] == {"ok": False, "error": "FirmsError: FIRMS_MAP_KEY has no value yet"}
    assert report["sources"]["weather"]["ok"] and report["sources"]["psi"]["ok"]
    assert "leads" not in store.collections


def test_map_key_is_redacted_from_errors():
    def leaky(url, **_):
        raise OSError(f"failed {url}")
    report = run.run_once(S, MemoryStore(), fetch=leaky, secret=key, now=NOW, run_id="r1")
    assert "TESTKEY" not in json.dumps(report)


def test_reingest_keeps_human_fields(fixtures_dir):
    store = MemoryStore()
    fetch = run.fixture_fetcher(fixtures_dir)
    run.run_once(S, store, fetch=fetch, secret=key, now=NOW, run_id="r1")
    lead_id = next(iter(store.collections["leads"]))
    store.collections["leads"][lead_id].update(status="checked_no_fire", verifiedBy="vol-1")
    run.run_once(S, store, fetch=fetch, secret=key, now="2026-10-14T07:00:00Z", run_id="r2")
    lead = store.collections["leads"][lead_id]
    assert lead["status"] == "checked_no_fire" and lead["verifiedBy"] == "vol-1"
    assert lead["firstSeenAt"] == NOW and lead["lastSeenAt"] == "2026-10-14T07:00:00Z"
    assert lead["confirmedFire"] is False


def test_seed_demo_leads_are_labelled():
    store = MemoryStore()
    assert run.seed_demo(store, now=NOW) == 2
    for lead in store.collections["leads"].values():
        assert lead["seeded"] is True and lead["source"] == "seed"
        assert lead["label"] == "unverified_lead" and lead["needsHumanVerification"] is True
        assert lead["confirmedFire"] is False and lead["status"] == "to_verify"


def test_cli_dry_run_with_fixtures(fixtures_dir, capsys):
    assert run.main(["--fixtures", str(fixtures_dir), "--dry-run"]) == 0
    first = json.loads(capsys.readouterr().out.splitlines()[0])
    assert first["severity"] == "INFO" and first["ok"] is True
