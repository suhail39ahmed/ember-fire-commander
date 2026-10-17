"""Supervisor dashboard read.

The chrome fields are the caller's agency, the server clock, and how many
proposed tasks are waiting. The live banner adds the open, held, and verified
fires: how many there are, when this picture was built, how many people are
already on each fire, whether a withdraw is active, and where and since when.
Season impact and the chart cards are computed from what the other services
already store: incidents, observations, tasks, the audit log, the volunteer
device records, satellite leads, re-inspect alerts, and the latest weather
read. A figure with no stored source (cameras, photo cadence, distance to risk,
the next satellite pass, injuries, the median target) stays null. Nothing here
writes a profile, an incident, or any other record.
"""
import logging
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify

from identity import AuthError
from incidents import rules, store
from sites_routes import reignition_alert

logger = logging.getLogger(__name__)

dashboard_bp = Blueprint("dashboard", __name__)

# Same collection as device tokens. `agency` is optional and unread by every
# other route. Nothing in this repository writes it.
VOLUNTEERS = "volunteers"


def _require_supervisor():
    if g.user["role"] != "supervisor":
        raise AuthError(403, "forbidden", "Only a supervisor can do this")


def _agency(uid):
    """Agency name on the caller's profile, or None when it is not stored.

    A missing document, a non-string, or a blank string is null. That is an
    empty profile, not a failed read.
    """
    snapshot = store.db().collection(VOLUNTEERS).document(uid).get()
    if not snapshot.exists:
        return None
    agency = (snapshot.to_dict() or {}).get("agency")
    if not isinstance(agency, str):
        return None
    agency = agency.strip()
    return agency or None


def _approvals_count():
    """Proposed tasks waiting for a supervisor.

    Tasks have no supervisor id. A proposed task waits for the supervisor
    role, so the count is every task with status `proposed`. The tasks
    themselves stay off this response.
    """
    return sum(1 for _ in store.where(store.TASKS, "status", "==", "proposed"))


def _join_requests_count():
    """Join requests (contract 6.12) still waiting for a supervisor. Counted apart from `approvalsCount`."""
    return sum(1 for _ in store.where(store.JOIN_REQUESTS, "status", "==", "pending"))


LEADS = "leads"
WEATHER = "weather"
LEAD_CHECKED_NO_FIRE = "checked_no_fire"
LEAD_WINDOW_DAYS = 7
MEDIAN_WINDOW_HOURS = 24
MAX_REGIONS = 3

NO_INJURY_SOURCE = "No injury reports are recorded in EMBER"


def _volunteer_ids(values):
    return {v for v in values if isinstance(v, str) and v}


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def _parse_time(value):
    parsed = rules._parse(value) if isinstance(value, str) and value else None
    if parsed is not None and parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _iso(moment):
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _duration_text(seconds):
    """`45 s`, `12 min`, or `1 h 05 min`. Rounded to the nearest unit."""
    seconds = max(0, int(round(seconds)))
    if seconds < 60:
        return f"{seconds} s"
    minutes = int(round(seconds / 60))
    if minutes < 60:
        return f"{minutes} min"
    return f"{minutes // 60} h {minutes % 60:02d} min"


def _median(values):
    ordered = sorted(values)
    if not ordered:
        return None
    mid = len(ordered) // 2
    return ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2


def _plural(count, one, many):
    return f"{count} {one if count == 1 else many}"


def _coordinate_label(lat, lng):
    if isinstance(lat, bool) or isinstance(lng, bool) or not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None
    return f"{abs(lat):.2f}\u00b0{'N' if lat >= 0 else 'S'} {abs(lng):.2f}\u00b0{'E' if lng >= 0 else 'W'}"


def _short_id(incident_id):
    return f"INC-{incident_id[-4:].upper()}"


def _incident_number(incident):
    """The `#<n>` at the end of the stored name, or None."""
    name = _text(incident.get("name"))
    if name and " \u00b7 " in name:
        last = name.rsplit(" \u00b7 ", 1)[1].strip()
    else:
        last = name or ""
    if last.startswith("#") and last[1:].isdigit():
        return last
    return None


def _place_name(incident):
    """The stored area, else the place part of the stored name, else the position as a label."""
    area = _text(incident.get("area"))
    if area:
        return area
    name = _text(incident.get("name"))
    if name:
        head = name.split(" \u00b7 ")[0].strip()
        if head and not (head.startswith("#") and head[1:].isdigit()):
            return head
    return _coordinate_label(incident.get("lat"), incident.get("lng"))


def _province(area):
    """`Riau` from `Bengkalis, Riau`. Coordinate labels have no province."""
    if not isinstance(area, str) or ", " not in area:
        return None
    return area.rsplit(", ", 1)[1].strip() or None


class _Picture:
    """Everything the cards are computed from, read once per request."""

    def __init__(self, now):
        self.now = now
        self.incidents = {
            snap.id: snap.to_dict() or {}
            for snap in store.db().collection(store.INCIDENTS).stream()
        }
        self.tasks = [(snap.id, snap.to_dict() or {}) for snap in store.db().collection(store.TASKS).stream()]
        self.tasks_by_incident = {}
        for task_id, task in self.tasks:
            incident_id = task.get("incidentId")
            if isinstance(incident_id, str):
                self.tasks_by_incident.setdefault(incident_id, []).append(task)
        self.conflict_obs = self._conflict_observation_ids()
        wanted = []
        for incident_id, incident in self.incidents.items():
            wanted.extend(self._own_observation_ids(incident))
            wanted.extend(self.conflict_obs.get(incident_id, []))
        self.observations = {
            obs_id: snap.to_dict() or {}
            for obs_id, snap in store.get_many(store.OBSERVATIONS, wanted).items()
        }

    @staticmethod
    def _own_observation_ids(incident):
        ids = incident.get("observationIds")
        return [i for i in ids if isinstance(i, str) and i] if isinstance(ids, list) else []

    def _conflict_observation_ids(self):
        out = {}
        ids = {
            incident_id: incident.get("conflictId")
            for incident_id, incident in self.incidents.items()
            if isinstance(incident.get("conflictId"), str) and incident.get("conflictId")
        }
        conflicts = store.get_many(store.CONFLICTS, ids.values())
        for incident_id, conflict_id in ids.items():
            snap = conflicts.get(conflict_id)
            extra = (snap.to_dict() or {}).get("observationIds") if snap else None
            if isinstance(extra, list):
                out[incident_id] = [i for i in extra if isinstance(i, str) and i]
        return out

    def observation_ids(self, incident_id):
        incident = self.incidents[incident_id]
        return list(dict.fromkeys(self._own_observation_ids(incident) + self.conflict_obs.get(incident_id, [])))

    def reporters(self, incident_id):
        """Distinct volunteers with an observation on this incident."""
        return _volunteer_ids(
            self.observations.get(obs_id, {}).get("volunteerId") for obs_id in self.observation_ids(incident_id)
        )

    def people_on_site(self, incident_id):
        tasked = _volunteer_ids(task.get("volunteerId") for task in self.tasks_by_incident.get(incident_id, []))
        return tasked | self.reporters(incident_id)

    def first_report_at(self, incident_id):
        """The earliest stored report time of this incident, or None when no observation can be read."""
        times = []
        for obs_id in self._own_observation_ids(self.incidents[incident_id]):
            obs = self.observations.get(obs_id)
            if obs is None:
                continue
            moment = _parse_time(obs.get("receivedAt")) or _parse_time(obs.get("capturedAt"))
            if moment is not None:
                times.append(moment)
        return min(times) if times else None

    def live_ids(self):
        return sorted(i for i, incident in self.incidents.items() if incident.get("status") in rules.LIVE_STATUSES)


def _live_fire(picture, incident_id):
    incident = picture.incidents[incident_id]
    withdraw = incident.get("withdraw")
    withdraw = withdraw if isinstance(withdraw, dict) else {}
    first = picture.first_report_at(incident_id)
    return {
        "id": incident_id,
        "peopleOnSite": len(picture.people_on_site(incident_id)),
        "withdrawActive": bool(withdraw.get("active")),
        "code": _incident_number(incident) or _short_id(incident_id),
        "placeName": _place_name(incident),
        # No stored source for cameras, photo cadence, or distance to risk.
        "liveCameras": None,
        "photoCadence": None,
        "distanceToRisk": None,
        "since": _iso(first) if first else None,
    }


def _live_fires(picture):
    """Open, held, and verified incidents. Extinguished fires stay off the banner."""
    return [_live_fire(picture, incident_id) for incident_id in picture.live_ids()]


def _verify_times(picture):
    """{incident id: seconds from the first report to the first supervisor verify}. Needs both records."""
    rows = {}
    for snap in store.where(store.AUDIT, "action", "==", "incident.verify"):
        row = snap.to_dict() or {}
        incident_id, at = row.get("targetId"), _parse_time(row.get("at"))
        if incident_id in picture.incidents and at is not None and (incident_id not in rows or at < rows[incident_id]):
            rows[incident_id] = at
    out = {}
    for incident_id, verified_at in rows.items():
        first = picture.first_report_at(incident_id)
        if first is not None and verified_at >= first:
            out[incident_id] = (verified_at, (verified_at - first).total_seconds())
    return out


def _known_volunteers(picture):
    """(everyone seen on a report, a task, or a registered device, those with a device)."""
    tokens = set()
    for snap in store.db().collection(VOLUNTEERS).stream():
        values = (snap.to_dict() or {}).get("fcmTokens")
        if isinstance(values, list) and any(isinstance(v, str) and v for v in values):
            tokens.add(snap.id)
    seen = set(tokens)
    for obs in picture.observations.values():
        seen |= _volunteer_ids([obs.get("volunteerId")])
    for _, task in picture.tasks:
        seen |= _volunteer_ids([task.get("volunteerId")])
    return seen, tokens


def _season_impact(picture, verified):
    out = {
        "since": None, "region": None, "crewCount": None,
        "firesContained": None, "firesContainedNote": None,
        "falseAlarmsCleared": None, "falseAlarmsNote": None,
        "injuries": None, "injuriesNote": NO_INJURY_SOURCE,
        "medianTimeToHumanCheck": None, "medianTimeNote": None,
        "reignitionsCaught": None, "reignitionsNote": None,
    }
    total = len(picture.incidents)
    firsts = [m for m in (picture.first_report_at(i) for i in picture.incidents) if m is not None]
    if firsts:
        out["since"] = _iso(min(firsts))
    provinces = {}
    for incident in picture.incidents.values():
        province = _province(_text(incident.get("area")))
        if province:
            provinces[province] = provinces.get(province, 0) + 1
    if provinces:
        ranked = sorted(provinces, key=lambda p: (-provinces[p], p))
        out["region"] = ", ".join(ranked[:MAX_REGIONS])
    seen, _ = _known_volunteers(picture)
    out["crewCount"] = len(seen)
    contained = sum(1 for incident in picture.incidents.values() if incident.get("status") == "extinguished")
    out["firesContained"] = contained
    out["firesContainedNote"] = f"Extinguished by a supervisor, of {_plural(total, 'incident', 'incidents')}"
    out["falseAlarmsCleared"] = len(store.where(LEADS, "status", "==", LEAD_CHECKED_NO_FIRE))
    out["falseAlarmsNote"] = "Satellite leads a person checked and found no fire"
    if verified:
        out["medianTimeToHumanCheck"] = _duration_text(_median([seconds for _, seconds in verified.values()]))
        out["medianTimeNote"] = (
            f"First report to supervisor verification, {_plural(len(verified), 'incident', 'incidents')}"
        )
    alerts = [snap.to_dict() or {} for snap in store.where(store.AUDIT, "action", "==", "site.reinspect")]
    sites = {row.get("targetId") for row in alerts if row.get("targetId")}
    out["reignitionsCaught"] = len(sites)
    out["reignitionsNote"] = (
        f"{_plural(len(alerts), 'alert', 'alerts')} near {_plural(len(sites), 'extinguished site', 'extinguished sites')}"
        ". A person still has to look"
    )
    return out


def _satellite_chart(now):
    since = _iso(now - timedelta(days=LEAD_WINDOW_DAYS))
    leads = [snap.to_dict() or {} for snap in store.where(LEADS, "firstSeenAt", ">=", since)]
    dismissed = sum(1 for lead in leads if lead.get("status") == LEAD_CHECKED_NO_FIRE)
    real = sum(1 for lead in leads if _text(lead.get("incidentId")))
    word = _plural(len(leads), "satellite lead", "satellite leads")
    return {
        "satelliteNote": f"{word} in the last {LEAD_WINDOW_DAYS} days. Real = linked to an incident",
        "realFires": real,
        "dismissed": dismissed,
    }


def _median_chart(now, verified):
    cutoff = now - timedelta(hours=MEDIAN_WINDOW_HOURS)
    recent = [seconds for at, seconds in verified.values() if at >= cutoff]
    if not recent:
        return {"medianNote": f"No incident verified in the last {MEDIAN_WINDOW_HOURS} hours",
                "medianToday": None, "medianTarget": None}
    return {
        "medianNote": f"Last {MEDIAN_WINDOW_HOURS} hours, {_plural(len(recent), 'incident', 'incidents')}",
        "medianToday": _duration_text(_median(recent)),
        # No target is stored anywhere.
        "medianTarget": None,
    }


def _crew_chart(picture):
    live = picture.live_ids()
    on_site = set()
    for incident_id in live:
        on_site |= picture.reporters(incident_id)
    sent = set()
    for incident_id in live:
        for task in picture.tasks_by_incident.get(incident_id, []):
            if task.get("status") == "approved" and task.get("type") != "withdraw":
                sent |= _volunteer_ids([task.get("volunteerId")])
    en_route = sent - on_site
    seen, tokens = _known_volunteers(picture)
    busy = on_site | en_route
    return {
        "crewNote": "On site = reported from a live fire. En route = sent a task, no report yet. Offline = no device registered",
        "onSite": len(on_site),
        "enRoute": len(en_route),
        "ready": len(tokens - busy),
        "offline": len(seen - tokens - busy),
    }


COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _weather_chart():
    snap = store.db().collection(WEATHER).document("current").get()
    if not snap.exists:
        return {}
    data = snap.to_dict() or {}
    out = {}
    temp, humidity = _number(data.get("tempC")), _number(data.get("humidityPct"))
    wind, rain = _number(data.get("windKmh")), _number(data.get("precipMm"))
    direction = _number(data.get("windDirDeg"))
    if temp is not None:
        out["airTempC"] = round(temp, 1)
    if humidity is not None:
        out["humidity"] = f"{round(humidity)}%"
    if wind is not None:
        out["windKmh"] = round(wind, 1)
        if direction is not None:
            out["windDirDeg"] = round(direction % 360, 1)
        text = f"{round(wind)} km/h"
        if direction is not None:
            text += f" {COMPASS[int(((direction % 360) + 22.5) // 45) % 8]}"
        out["wind"] = text
    if rain is not None:
        out["rain"] = f"{rain:.1f} mm"
    observed = _parse_time(data.get("observedAt"))
    source = "Open-Meteo, fixed monitoring point"
    out["weatherNote"] = f"{source}, read {observed.strftime('%H:%M')} UTC" if observed else source
    return out


def _guard(name, build, fallback):
    """A source that cannot be read leaves its cards null. It never fails the whole dashboard."""
    try:
        return build()
    except Exception:  # noqa: BLE001 - one unreadable collection must not hide the others
        logger.exception("dashboard %s could not be built", name)
        return fallback


_SEASON_KEYS = (
    "since", "region", "crewCount", "firesContained", "firesContainedNote", "falseAlarmsCleared",
    "falseAlarmsNote", "injuries", "injuriesNote", "medianTimeToHumanCheck", "medianTimeNote",
    "reignitionsCaught", "reignitionsNote",
)
_CHART_KEYS = (
    "satelliteNote", "realFires", "dismissed", "medianNote", "medianToday", "medianTarget",
    "crewNote", "onSite", "enRoute", "ready", "offline", "weatherNote", "airTempC", "humidity", "wind", "windKmh", "windDirDeg", "rain",
)


def _fill(keys, *parts):
    out = {key: None for key in keys}
    for part in parts:
        out.update(part)
    return out


@dashboard_bp.route("/dashboard", methods=["GET"])
def dashboard():
    """Chrome, live banner, season impact, charts, and a re-ignition alert when one is open."""
    _require_supervisor()
    now = rules.now_iso()
    moment = _parse_time(now) or datetime.now(timezone.utc)
    picture = _guard("incidents", lambda: _Picture(moment), None)
    verified = _guard("verify times", lambda: _verify_times(picture), {}) if picture else {}
    if picture is None:
        fires, season, charts = [], _fill(_SEASON_KEYS), _fill(_CHART_KEYS)
    else:
        fires = _guard("live fires", lambda: _live_fires(picture), [])
        season = _fill(_SEASON_KEYS, _guard("season impact", lambda: _season_impact(picture, verified), {}))
        charts = _fill(
            _CHART_KEYS,
            _guard("satellite chart", lambda: _satellite_chart(moment), {}),
            _guard("median chart", lambda: _median_chart(moment, verified), {}),
            _guard("crew chart", lambda: _crew_chart(picture), {}),
            _guard("weather chart", _weather_chart, {}),
        )
    return jsonify({
        "agency": _agency(g.user["id"]),
        "serverTime": now,
        "approvalsCount": _approvals_count(),
        "joinRequestsCount": _join_requests_count(),
        "updatedAt": now,
        "nextSatellitePass": None,
        "liveFires": fires,
        "seasonImpact": season,
        "charts": charts,
        "reignitionAlert": reignition_alert(),
    }), 200
