"""Remember extinguished sites and raise re-inspection alerts.

Pure code with no I/O. An alert asks a supervisor to look again. It never
reopens, verifies, or changes the severity of the incident.
"""
import math
from dataclasses import dataclass, field

DEFAULT_RADIUS_M = 500.0
EARTH_RADIUS_M = 6371000.0
CODE_ACTOR = "code"


def distance_m(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))


def remember(incident, extinguished_at, radius_m=DEFAULT_RADIUS_M):
    """A `sites` record for an extinguished incident. Id is the incident id."""
    return {
        "id": incident["id"],
        "incidentId": incident["id"],
        "lat": incident["lat"],
        "lng": incident["lng"],
        "radiusM": radius_m,
        "extinguishedAt": extinguished_at,
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


def scan(sites, observations, leads, new_id, now):
    """Match new observations and FIRMS leads against watched sites.

    An item counts when it is inside the site's radius, arrived after the site
    was extinguished, and has not already been alerted for that site.
    Returns only the sites that changed, plus one audit per new alert.
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
            updated = dict(site)
            updated["alerts"] = list(site.get("alerts") or []) + added
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
