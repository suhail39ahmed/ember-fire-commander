"""POST /internal/sites/scan: run the re-ignition watch once.

Meant for Cloud Scheduler (OIDC as a service account with run.invoker on
ember-agents). Safe to call repeatedly: sites and alerts are de-duplicated.
"""
import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify

from sites.store import get_store
from sites.watch import DEFAULT_RADIUS_M, remember, scan

bp = Blueprint("sites", __name__)


def _now():
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"


def _radius():
    try:
        return float(os.getenv("EMBER_SITE_RADIUS_M", "") or DEFAULT_RADIUS_M)
    except ValueError:
        return DEFAULT_RADIUS_M


@bp.post("/internal/sites/scan")
def run_scan():
    store = get_store()
    now = _now()
    watched = {s["id"]: s for s in store.sites()}
    remembered = 0
    for incident in store.extinguished_incidents():
        if incident["id"] in watched:
            continue
        site = remember(incident, store.extinguished_at(incident["id"]) or now, _radius())
        store.put("sites", site)
        watched[site["id"]] = site
        remembered += 1

    sites = list(watched.values())
    alerts = 0
    if sites:
        since = min(s["extinguishedAt"] for s in sites)
        result = scan(sites, store.observations_since(since), store.leads_since(since), store.new_id, now)
        for site in result.sites:
            store.put("sites", site)
            alerts += len(site["alerts"]) - len(watched[site["id"]].get("alerts") or [])
        for audit in result.audits:
            store.put("audit", audit)
    return jsonify({"sitesWatched": len(sites), "sitesRemembered": remembered, "alertsCreated": alerts}), 200
