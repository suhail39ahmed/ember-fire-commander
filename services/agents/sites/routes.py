"""POST /internal/sites/scan: run the re-ignition watch once.

Meant for Cloud Scheduler (OIDC as a service account with run.invoker on
ember-agents). Safe to call repeatedly: sites and alerts are de-duplicated.
"""
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify

from sites.store import get_store
from sites.watch import (
    DEFAULT_RADIUS_M,
    DEFAULT_WATCH_DAYS,
    is_expired,
    remember,
    scan,
    window_start,
)

bp = Blueprint("sites", __name__)


def _now():
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _radius():
    try:
        return float(os.getenv("EMBER_SITE_RADIUS_M", "") or DEFAULT_RADIUS_M)
    except ValueError:
        return DEFAULT_RADIUS_M


def _watch_days():
    try:
        days = int(os.getenv("EMBER_SITE_WATCH_DAYS", "") or DEFAULT_WATCH_DAYS)
    except ValueError:
        return DEFAULT_WATCH_DAYS
    return days if days > 0 else DEFAULT_WATCH_DAYS


@bp.post("/internal/sites/scan")
def run_scan():
    store = get_store()
    now = _now()
    days = _watch_days()
    last_scanned_at = store.last_scanned_at()

    # Sites are only remembered once: an expired site keeps its record, so it is not re-created.
    known = store.site_ids()
    new_incidents = [i for i in store.extinguished_incidents() if i["id"] not in known]
    extinguished = store.extinguished_times([i["id"] for i in new_incidents]) if new_incidents else {}
    fresh = {}
    for incident in new_incidents:
        site = remember(incident, extinguished.get(incident["id"]) or now, _radius(), days)
        fresh[site["id"]] = site

    sites = {s["id"]: s for s in store.active_sites()}
    sites.update(fresh)

    expired = 0
    for site_id, site in list(sites.items()):
        if is_expired(site, now, days):
            store.put("sites", dict(site, status="expired"))
            del sites[site_id]
            expired += 1
    for site in fresh.values():
        if site["id"] in sites:
            store.put("sites", site)

    alerts = 0
    if sites:
        since = min(
            window_start(s, now, None if s["id"] in fresh else last_scanned_at, days)
            for s in sites.values()
        )
        result = scan(
            list(sites.values()), store.observations_since(since), store.leads_since(since), store.new_id, now
        )
        for site in result.sites:
            store.put("sites", site)
        alerts = result.alerts_added
        for audit in result.audits:
            store.put("audit", audit)
    store.set_last_scanned_at(now)
    return jsonify({
        "sitesWatched": len(sites),
        "sitesRemembered": len(fresh),
        "sitesExpired": expired,
        "alertsCreated": alerts,
    }), 200
