"""Remember extinguished sites and raise re-inspection alerts.

Pure code with no I/O. An alert asks a supervisor to look again. It never
reopens, verifies, or changes the severity of the incident.
"""
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

DEFAULT_RADIUS_M = 500.0
DEFAULT_WATCH_DAYS = 14
MAX_ALERTS = 50
SCAN_OVERLAP = timedelta(minutes=5)
ACTIVE_STATUSES = ("watching", "reinspect")
EARTH_RADIUS_M = 6371000.0
CODE_ACTOR = "code"


def distance_m(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def parse_time(value):
    """An ISO-8601 string such as `2026-10-13T10:00:00.000Z` as an aware datetime."""
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def format_time(moment):
    moment = moment.astimezone(timezone.utc)
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def expires_at(extinguished_at, watch_days=DEFAULT_WATCH_DAYS):
    return format_time(parse_time(extinguished_at) + timedelta(days=watch_days))


def site_expires_at(site, watch_days=DEFAULT_WATCH_DAYS):
    """The site's `expiresAt`, worked out from `extinguishedAt` for older records."""
    return site.get("expiresAt") or expires_at(site["extinguishedAt"], watch_days)


def is_expired(site, now, watch_days=DEFAULT_WATCH_DAYS):
    return parse_time(now) >= parse_time(site_expires_at(site, watch_days))


def window_start(site, now, last_scanned_at=None, watch_days=DEFAULT_WATCH_DAYS):
    """Where this site's read window begins: after the last scan, never older than the watch window.

    A site that was only just remembered has not been scanned yet, so its window
    starts when it was extinguished.
    """
    floor = parse_time(now) - timedelta(days=watch_days)
    start = max(floor, parse_time(site["extinguishedAt"]))
    if last_scanned_at:
        start = max(start, parse_time(last_scanned_at) - SCAN_OVERLAP)
    return format_time(start)


def remember(incident, extinguished_at, radius_m=DEFAULT_RADIUS_M, watch_days=DEFAULT_WATCH_DAYS):
    """A `sites` record for an extinguished incident. Id is the incident id."""
    return {
        "id": incident["id"],
        "incidentId": incident["id"],
        "lat": incident["lat"],
        "lng": incident["lng"],
        "radiusM": radius_m,
        "extinguishedAt": extinguished_at,
        "expiresAt": expires_at(extinguished_at, watch_days),
        "observationIds": list(incident.get("observationIds") or []),
        "status": "watching",
        "alerts": [],
    }


def item_time(kind, item):
    if kind == "observation":
        return item.get("receivedAt") or item.get("capturedAt")
    return item.get("firstSeenAt") or item.get("acqAt")


@dataclass
class ScanResult:
    sites: list = field(default_factory=list)
    audits: list = field(default_factory=list)
    alerts_added: int = 0


def scan(sites, observations, leads, new_id, now):
    """Match new observations and FIRMS leads against watched sites.

    An item counts when it is inside the site's radius, arrived after the site
    was extinguished, and has not already been alerted for that site.
    Returns only the sites that changed, plus one audit per new alert. A site keeps
    its newest `MAX_ALERTS` alerts.
    """
    result = ScanResult()
    items = [("observation", o) for o in observations] + [("lead", lead) for lead in leads]
    for site in sites:
        known = {(a["kind"], a["sourceId"]) for a in site.get("alerts") or []}
        added = []
        for kind, item in items:
            if (kind, item["id"]) in known:
                continue
            if kind == "observation" and item["id"] in site.get("observationIds", []):
                continue
            at = item_time(kind, item)
            if not at or at <= site["extinguishedAt"]:
                continue
            d = distance_m(site["lat"], site["lng"], item["lat"], item["lng"])
            if d > site.get("radiusM", DEFAULT_RADIUS_M):
                continue
            added.append({
                "id": new_id("alerts"),
                "kind": kind,
                "sourceId": item["id"],
                "distanceM": round(d),
                "itemAt": at,
                "at": now,
                "message": "New activity near an extinguished site. Re-inspect before any decision.",
            })
            known.add((kind, item["id"]))
        if added:
            result.alerts_added += len(added)
            updated = dict(site)
            updated["alerts"] = (list(site.get("alerts") or []) + added)[-MAX_ALERTS:]
            updated["status"] = "reinspect"
            updated["lastAlertAt"] = now
            result.sites.append(updated)
            result.audits.append({
                "id": new_id("audit"),
                "actorId": CODE_ACTOR,
                "action": "site.reinspect",
                "targetId": site["incidentId"],
                "at": now,
            })
    return result
