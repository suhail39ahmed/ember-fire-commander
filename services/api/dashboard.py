"""Supervisor dashboard read.

The chrome fields are the caller's agency, the server clock, and how many
proposed tasks are waiting. The live banner adds the open, held, and verified
fires: how many there are, when this picture was built, how many people are
already on each fire, and whether a withdraw is active. Code, place, cameras,
cadence, distance, and the next satellite pass are null until a stored source
exists. Season impact and the chart cards are on this body too, and every one of
their fields is null until a stored source exists. Nothing here writes a profile
or an incident.
"""
from flask import Blueprint, g, jsonify

from identity import AuthError
from incidents import rules, store

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


def _volunteer_ids(values):
    return {v for v in values if isinstance(v, str) and v}


def _people_on_site(incident_id, incident):
    """Distinct volunteers with an observation or a task on this incident."""
    people = _volunteer_ids(
        (snap.to_dict() or {}).get("volunteerId")
        for snap in store.where(store.TASKS, "incidentId", "==", incident_id)
    )
    obs_ids = incident.get("observationIds")
    obs_ids = list(obs_ids) if isinstance(obs_ids, list) else []
    conflict_id = incident.get("conflictId")
    if isinstance(conflict_id, str) and conflict_id:
        conflict = store.db().collection(store.CONFLICTS).document(conflict_id).get()
        if conflict.exists:
            extra = (conflict.to_dict() or {}).get("observationIds")
            if isinstance(extra, list):
                obs_ids.extend(extra)
    obs_ids = [obs_id for obs_id in dict.fromkeys(obs_ids) if isinstance(obs_id, str) and obs_id]
    people.update(_volunteer_ids(
        (snap.to_dict() or {}).get("volunteerId")
        for snap in store.get_many(store.OBSERVATIONS, obs_ids).values()
    ))
    return len(people)


def _live_fire(incident_id, incident):
    withdraw = incident.get("withdraw")
    withdraw = withdraw if isinstance(withdraw, dict) else {}
    return {
        "id": incident_id,
        "peopleOnSite": _people_on_site(incident_id, incident),
        "withdrawActive": bool(withdraw.get("active")),
        # No stored source yet. The console shows the empty treatment.
        "code": None,
        "placeName": None,
        "liveCameras": None,
        "photoCadence": None,
        "distanceToRisk": None,
        "since": None,
    }


def _live_fires():
    """Open, held, and verified incidents. Extinguished fires stay off the banner."""
    fires = []
    for snap in store.db().collection(store.INCIDENTS).stream():
        incident = snap.to_dict() or {}
        if incident.get("status") not in rules.LIVE_STATUSES:
            continue
        fires.append(_live_fire(snap.id, incident))
    fires.sort(key=lambda fire: fire["id"])
    return fires


def _season_impact():
    """Season-impact card slots. No stored source exists, so every value is null."""
    return {
        "since": None,
        "region": None,
        "crewCount": None,
        "firesContained": None,
        "firesContainedNote": None,
        "falseAlarmsCleared": None,
        "falseAlarmsNote": None,
        "injuries": None,
        "injuriesNote": None,
        "medianTimeToHumanCheck": None,
        "medianTimeNote": None,
        "reignitionsCaught": None,
        "reignitionsNote": None,
    }


def _charts():
    """Chart card slots. No client-safe source exists, so every value is null."""
    return {
        "satelliteNote": None,
        "realFires": None,
        "dismissed": None,
        "medianNote": None,
        "medianToday": None,
        "medianTarget": None,
        "crewNote": None,
        "onSite": None,
        "enRoute": None,
        "ready": None,
        "offline": None,
        "weatherNote": None,
        "airTempC": None,
        "humidity": None,
        "wind": None,
        "rain": None,
    }


@dashboard_bp.route("/dashboard", methods=["GET"])
def dashboard():
    """Chrome, the live banner, season impact, and the chart cards."""
    _require_supervisor()
    now = rules.now_iso()
    return jsonify({
        "agency": _agency(g.user["id"]),
        "serverTime": now,
        "approvalsCount": _approvals_count(),
        "updatedAt": now,
        "nextSatellitePass": None,
        "liveFires": _live_fires(),
        "seasonImpact": _season_impact(),
        "charts": _charts(),
    }), 200
