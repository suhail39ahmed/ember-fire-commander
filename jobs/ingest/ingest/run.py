"""One ingest pass: FIRMS leads, weather/current, psi/current, plus an ingestRuns report.

Each source runs on its own. A failure is recorded in the run report and the
job exits non-zero, but whatever was stored before (leads, weather, PSI) is
left exactly as it was.

    python -m ingest.run                       # live (Cloud Run job)
    python -m ingest.run --fixtures DIR --dry-run   # recorded fixtures, prints docs
    python -m ingest.run --seed-demo           # write the hand-seeded demo leads only
"""
from __future__ import annotations

import argparse
import json
import logging
import pathlib
import sys
import uuid
from datetime import datetime, timezone
from typing import Callable

from ingest import leads as leads_mod
from ingest import psi as psi_mod
from ingest import weather as weather_mod
from ingest.config import Settings
from ingest.http import get_text
from ingest.secrets import get_secret
from ingest.store import FirestoreStore, MemoryStore

log = logging.getLogger("ember-ingest")
HERE = pathlib.Path(__file__).resolve().parent.parent
DEMO_LEADS = HERE / "fixtures" / "demo_leads.json"


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _err(exc: Exception) -> str:
    text = f"{type(exc).__name__}: {exc}"
    return text[:300]


def run_once(settings: Settings, store, *, fetch: Callable[..., str] = get_text,
             secret: Callable[[str], str | None] | None = None,
             now: str | None = None, run_id: str | None = None) -> dict:
    now = now or _now()
    run_id = run_id or f"{now.replace(':', '').replace('-', '')}-{uuid.uuid4().hex[:6]}"
    secret = secret or (lambda name: get_secret(name, settings.project))
    t = settings.http_timeout_s
    report = {"id": run_id, "startedAt": now, "sources": {}}

    # FIRMS -> leads
    key = None
    try:
        key = secret("FIRMS_MAP_KEY")
        if not key:
            raise leads_mod.FirmsError("FIRMS_MAP_KEY has no value yet")
        text = fetch(leads_mod.firms_url(key, settings.firms_source, settings.firms_bbox, settings.firms_days), timeout=t)
        found = leads_mod.parse_firms_csv(text, source=settings.firms_source)
        report["sources"]["firms"] = {"ok": True, "leads": store.upsert_leads(found, now=now, run_id=run_id)}
    except Exception as exc:
        error = _err(exc)
        if key:
            error = error.replace(key, "***")  # never log the MAP_KEY
        report["sources"]["firms"] = {"ok": False, "error": error}

    # Open-Meteo -> weather/current
    try:
        text = fetch(weather_mod.weather_url(settings.weather_lat, settings.weather_lng), timeout=t)
        doc = weather_mod.parse_open_meteo(text, lat=settings.weather_lat, lng=settings.weather_lng)
        store.put("weather", "current", dict(doc, fetchedAt=now, ingestRunId=run_id))
        report["sources"]["weather"] = {"ok": True, "windKmh": doc["windKmh"]}
    except Exception as exc:
        report["sources"]["weather"] = {"ok": False, "error": _err(exc)}

    # data.gov.sg -> psi/current
    try:
        headers = {}
        api_key = secret("DATA_GOV_SG_API_KEY")  # optional: raises the rate limit
        if api_key:
            headers["x-api-key"] = api_key
        text = fetch(psi_mod.PSI_URL, headers=headers, timeout=t)
        doc = psi_mod.parse_psi(text)
        store.put("psi", "current", dict(doc, fetchedAt=now, ingestRunId=run_id))
        report["sources"]["psi"] = {"ok": True, "psi24hMax": doc["psi24hMax"]}
    except Exception as exc:
        report["sources"]["psi"] = {"ok": False, "error": _err(exc)}

    report["ok"] = all(s["ok"] for s in report["sources"].values())
    report["finishedAt"] = _now()
    try:
        store.put("ingestRuns", run_id, report)
    except Exception as exc:  # the report itself must not hide the outcome
        report["reportError"] = _err(exc)
    return report


def seed_demo(store, *, now: str | None = None) -> int:
    fixture = json.loads(DEMO_LEADS.read_text())
    return store.upsert_leads(leads_mod.seeded_leads(fixture), now=now or _now(), run_id="seed-demo")


def fixture_fetcher(directory: pathlib.Path) -> Callable[..., str]:
    """Answer each source URL from a recorded file. No network."""
    files = {
        "firms.modaps.eosdis.nasa.gov": "firms_viirs_snpp_nrt.csv",
        "api.open-meteo.com": "open_meteo_current.json",
        "api-open.data.gov.sg": "data_gov_sg_psi.json",
    }

    def fetch(url: str, **_):
        for host, name in files.items():
            if host in url:
                return (directory / name).read_text()
        raise RuntimeError(f"no fixture for {url}")
    return fetch


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    p = argparse.ArgumentParser(prog="ingest.run")
    p.add_argument("--fixtures", type=pathlib.Path, help="read recorded responses from this folder")
    p.add_argument("--dry-run", action="store_true", help="keep writes in memory and print them")
    p.add_argument("--seed-demo", action="store_true", help="only write fixtures/demo_leads.json leads")
    args = p.parse_args(argv)

    settings = Settings.from_env()
    store = MemoryStore() if args.dry_run else FirestoreStore(settings.project, settings.database)

    if args.seed_demo:
        n = seed_demo(store)
        print(json.dumps({"seeded": n}))
        if args.dry_run:
            print(json.dumps(store.collections, indent=2, sort_keys=True))
        return 0

    kwargs = {}
    if args.fixtures:
        kwargs = {"fetch": fixture_fetcher(args.fixtures), "secret": lambda name: "FIXTURE" if name == "FIRMS_MAP_KEY" else None}
    report = run_once(settings, store, **kwargs)
    # One JSON line: Cloud Logging parses it; severity drives alerting.
    print(json.dumps({"severity": "INFO" if report["ok"] else "ERROR", "message": "ingest run", **report}))
    if args.dry_run:
        print(json.dumps(store.collections, indent=2, sort_keys=True))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
