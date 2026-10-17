"""Fuse one new observation into the incident picture.

Everything here is deterministic code with no I/O, so it can be unit tested
directly. `fuse` returns a `Plan` of writes; the store applies the plan.

Rules (shared contract §1 and §8):
- Nearby observations cluster into one incident with a code-computed
  evidence score.
- A flame versus no-flame disagreement opens a conflict. Observations stay
  separate, the higher severity is kept, the incident is held, and each
  volunteer in the conflict gets a proposed `verify` task.
- A `large_flame` observation or wind at or above the threshold issues
  WITHDRAW immediately: approved `withdraw` tasks plus a `task.withdraw`
  audit with actorId `code`. No approval is needed.
- Wind and a nearby satellite lead are listed as evidence factors worth
  0 points, so the score stays what the reports alone make it.
- Every observation also gets a join record: the incident it went into, how
  many reports were close, and the radius that was used.
- Code only ever raises severity. It never verifies, extinguishes, or lowers.
- A `live` observation's severity comes from the model, so it is not copied
  onto the incident. It can still trigger WITHDRAW, because withdrawing is
  the safe direction.
"""
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from fusion import geo
from fusion.severity import FLAMES, UNKNOWN, higher, highest, rank
from fusion.settings import Settings

CODE_ACTOR = "code"
ACTIVE_STATUSES = ("open", "held", "verified")
VERIFY_INSTRUCTION = "Reports disagree here. Check the spot again and report what you see."

SEVERITY_POINTS = {"none": 0, "unknown": 5, "smoke": 20, "small_flame": 35, "large_flame": 50}
CORROBORATION_POINTS = 15
CORROBORATION_CAP = 30
PHOTO_POINTS = 10
PRECISE_GPS_POINTS = 10
PRECISE_GPS_M = 50
CONFLICT_PENALTY = -20
LEAD_KIND = "firms_hotspot"
LEAD_DISMISSED = "checked_no_fire"


@dataclass
class State:
    """What the store loaded for this intake."""
    incidents: list = field(default_factory=list)
    observations: dict = field(default_factory=dict)
    tasks: list = field(default_factory=list)
    conflicts: list = field(default_factory=list)


@dataclass
class Plan:
    incident: dict = None
    # Where the observation went and how close the other reports were. None when intake was skipped.
    join: dict = None
    incident_is_new: bool = False
    conflict: dict = None
    tasks: list = field(default_factory=list)
    audits: list = field(default_factory=list)
    skipped: bool = False


def fusion_severity(observation):
    """The severity this observation contributes to the incident."""
    if observation.get("source") == "live":
        return UNKNOWN
    return observation.get("severity") or UNKNOWN


def evidence(observations, conflict_open, wind_kmh=None, lead=None):
    """Explainable evidence score: 0-100 plus the factors that produced it.

    This is a count of supporting evidence, not a probability or forecast.
    `wind_kmh` and `lead` (see `nearest_lead`) add a factor each, worth 0 points: they are context for the
    supervisor, and they never move the score or any rule.
    """
    observations = list(observations)
    severity = highest(fusion_severity(o) for o in observations)
    factors = [{
        "factor": "severity",
        "points": SEVERITY_POINTS[severity],
        "detail": f"highest reported severity is {severity}",
    }]

    positive = sorted({
        o["volunteerId"] for o in observations
        if rank(fusion_severity(o)) >= rank("smoke")
    })
    if len(positive) > 1:
        points = min(CORROBORATION_CAP, CORROBORATION_POINTS * (len(positive) - 1))
        factors.append({
            "factor": "corroboration",
            "points": points,
            "detail": f"{len(positive)} volunteers reported smoke or flame",
        })
    if any(o.get("photoPath") for o in observations):
        factors.append({"factor": "photo", "points": PHOTO_POINTS, "detail": "a photo is attached"})
    if any(
        o.get("accuracyM") is not None and o["accuracyM"] <= PRECISE_GPS_M
        for o in observations
    ):
        factors.append({
            "factor": "gps",
            "points": PRECISE_GPS_POINTS,
            "detail": f"a position is accurate to {PRECISE_GPS_M} m or better",
        })
    if wind_kmh is not None:
        factors.append({
            "factor": "wind",
            "points": 0,
            "detail": f"wind is {wind_kmh:g} km/h at the weather station, not at the incident. It adds no points",
        })
    if lead is not None:
        factors.append({
            "factor": "satellite",
            "points": 0,
            "detail": (
                f"an unverified satellite lead was seen {_distance_text(lead['distanceM'])} away at {lead['seenAt']}"
                f"{' (confidence ' + lead['confidence'] + ')' if lead.get('confidence') else ''}. It adds no points"
            ),
        })
    if conflict_open:
        factors.append({
            "factor": "conflict",
            "points": CONFLICT_PENALTY,
            "detail": "reports disagree and are held for verification",
        })
    score = max(0, min(100, sum(f["points"] for f in factors)))
    return score, factors


def _distance_text(metres):
    return f"{metres} m" if metres < 1000 else f"{metres / 1000:.1f} km"


def _parse(iso):
    try:
        parsed = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def lead_window_start(now, settings):
    """The earliest `acqAt` that still counts as recent, as the ISO text a store can compare with."""
    moment = _parse(now) or datetime.now(timezone.utc)
    start = moment - timedelta(hours=settings.satellite_window_hours)
    return start.strftime("%Y-%m-%dT%H:%M:%S.") + f"{start.microsecond // 1000:03d}Z"


def nearest_lead(leads, lat, lng, now, settings):
    """The closest satellite lead within the radius and the window that nobody has dismissed, or None.

    A lead is a hotspot a person still has to check. This only reports that one is near. It never confirms a fire.
    """
    moment = _parse(now)
    best = None
    for lead in leads or []:
        if lead.get("kind", LEAD_KIND) != LEAD_KIND or lead.get("status") == LEAD_DISMISSED:
            continue
        seen = _parse(lead.get("acqAt"))
        if seen is None or moment is None or not 0 <= (moment - seen).total_seconds() <= settings.satellite_window_hours * 3600:
            continue
        if not all(isinstance(lead.get(k), (int, float)) and not isinstance(lead.get(k), bool) for k in ("lat", "lng")):
            continue
        distance = round(geo.distance_m(lat, lng, lead["lat"], lead["lng"]))
        if distance <= settings.satellite_radius_m and (best is None or distance < best["distanceM"]):
            confidence = lead.get("confidence")
            best = {
                "distanceM": distance,
                "seenAt": seen.astimezone(timezone.utc).strftime("%H:%M UTC"),
                "confidence": confidence if isinstance(confidence, str) and confidence and confidence != "unknown" else None,
            }
    return best


def _join_record(observation, incident, state, is_new, settings, now):
    """Where the observation went, from the reports already on the incident (or, for a new one, on any live incident)."""
    if is_new:
        pool = [
            state.observations[i] for other in state.incidents if other.get("status") in ACTIVE_STATUSES
            for i in other.get("observationIds") or [] if i in state.observations
        ]
    else:
        pool = [state.observations[i] for i in incident["observationIds"] if i in state.observations and i != observation["id"]]
    distances = sorted(
        round(geo.distance_m(observation["lat"], observation["lng"], m["lat"], m["lng"]))
        for m in pool if m.get("id") != observation["id"]
    )
    return {
        "id": observation["id"],
        "observationId": observation["id"],
        "incidentId": incident["id"],
        "joined": not is_new,
        "nearbyCount": sum(1 for d in distances if d <= settings.cluster_radius_m),
        "nearestM": distances[0] if distances else None,
        "radiusM": settings.cluster_radius_m,
        "at": now,
    }


def _nearest_incident(observation, state, settings):
    best, best_d = None, None
    for incident in state.incidents:
        if incident.get("status") not in ACTIVE_STATUSES:
            continue
        members = [
            state.observations[i] for i in incident.get("observationIds") or []
            if i in state.observations
        ]
        points = [(m["lat"], m["lng"]) for m in members] or [(incident["lat"], incident["lng"])]
        d = min(geo.distance_m(observation["lat"], observation["lng"], p[0], p[1]) for p in points)
        if d <= settings.cluster_radius_m and (best_d is None or d < best_d):
            best, best_d = incident, d
    return best


def _conflicting(observations):
    """Observations on each side of a flame versus no-flame disagreement."""
    nones = [o for o in observations if fusion_severity(o) == "none"]
    flames = [o for o in observations if fusion_severity(o) in FLAMES]
    if nones and flames:
        return nones + flames
    return []


def _audit(new_id, action, target_id, now):
    return {
        "id": new_id("audit"),
        "actorId": CODE_ACTOR,
        "action": action,
        "targetId": target_id,
        "at": now,
    }


def _wind_reason(wind_kmh, settings):
    if wind_kmh is None or wind_kmh < settings.wind_withdraw_kmh:
        return None
    return f"wind {wind_kmh:g} km/h at or above {settings.wind_withdraw_kmh:g} km/h"


def fuse(observation, state, new_id, now, wind_kmh=None, settings=None, leads=None):
    settings = settings or Settings()
    plan = Plan()

    for incident in state.incidents:
        if observation["id"] in (incident.get("observationIds") or []):
            plan.skipped = True
            return plan

    incident = _nearest_incident(observation, state, settings)
    if incident is None:
        plan.incident_is_new = True
        incident = {
            "id": new_id("incidents"),
            "status": "open",
            "severity": UNKNOWN,
            "evidenceScore": 0,
            "conflictId": None,
            "withdraw": None,
            "lat": observation["lat"],
            "lng": observation["lng"],
            "observationIds": [],
        }
    else:
        incident = dict(incident)
        incident["observationIds"] = list(incident.get("observationIds") or [])
    previous_severity = incident.get("severity") or UNKNOWN
    plan.join = _join_record(observation, incident, state, plan.incident_is_new, settings, now)

    incident["observationIds"].append(observation["id"])
    members = [
        state.observations[i] for i in incident["observationIds"]
        if i in state.observations
    ]
    if observation not in members:
        members.append(observation)
    incident["lat"], incident["lng"] = geo.centroid((m["lat"], m["lng"]) for m in members)

    severity = higher(previous_severity, highest(fusion_severity(m) for m in members))
    incident["severity"] = severity
    if not plan.incident_is_new and rank(severity) > rank(previous_severity):
        plan.audits.append(_audit(new_id, "incident.severity.raise", incident["id"], now))

    tasks_here = [t for t in state.tasks if t.get("incidentId") == incident["id"]]

    conflict = None
    for existing in state.conflicts:
        if existing.get("incidentId") == incident["id"] and existing.get("status") == "open":
            conflict = dict(existing)
    side_by_side = _conflicting(members)
    if side_by_side:
        if conflict is None:
            plan.audits.append(_audit(new_id, "conflict.open", incident["id"], now))
            conflict = {
                "id": new_id("conflicts"),
                "incidentId": incident["id"],
                "observationIds": [],
                "higherSeverity": UNKNOWN,
                "status": "open",
                "dispatchHeld": True,
            }
        ids = list(conflict["observationIds"])
        for o in side_by_side:
            if o["id"] not in ids:
                ids.append(o["id"])
        conflict["observationIds"] = ids
        conflict["higherSeverity"] = higher(
            conflict["higherSeverity"], highest(fusion_severity(o) for o in side_by_side)
        )
        plan.conflict = conflict
        incident["conflictId"] = conflict["id"]
        if incident["status"] == "open":
            incident["status"] = "held"

        verified_already = {t["volunteerId"] for t in tasks_here if t.get("type") == "verify"}
        for volunteer_id in sorted({o["volunteerId"] for o in side_by_side}):
            if volunteer_id in verified_already:
                continue
            plan.tasks.append({
                "id": new_id("tasks"),
                "incidentId": incident["id"],
                "volunteerId": volunteer_id,
                "type": "verify",
                "status": "proposed",
                "instruction": VERIFY_INSTRUCTION,
            })

    reasons = []
    if observation.get("severity") == "large_flame":
        reasons.append("large flame reported")
    wind = _wind_reason(wind_kmh, settings)
    if wind:
        reasons.append(wind)
    current = incident.get("withdraw") or None
    active = bool(current and current.get("active"))
    if reasons or active:
        on_incident = {m["volunteerId"] for m in members}
        on_incident |= {t["volunteerId"] for t in tasks_here + plan.tasks}
        already = set(current["volunteerIds"]) if active else set()
        newly = sorted(on_incident - already)
        merged_reasons = list(current["reasons"]) if active else []
        for r in reasons:
            if r not in merged_reasons:
                merged_reasons.append(r)
        instruction = current["instruction"] if active else settings.withdraw_instruction
        incident["withdraw"] = {
            "active": True,
            "instruction": instruction,
            "reasons": merged_reasons,
            "volunteerIds": sorted(already | set(newly)),
            # Who sent it and when stay as first written. Volunteers a supervisor marked safe stay marked.
            "source": current.get("source", "code") if active else "code",
            "sentAt": current.get("sentAt", now) if active else now,
            "safeVolunteerIds": list(current.get("safeVolunteerIds") or []) if active else [],
        }
        for volunteer_id in newly:
            plan.tasks.append({
                "id": new_id("tasks"),
                "incidentId": incident["id"],
                "volunteerId": volunteer_id,
                "type": "withdraw",
                "status": "approved",
                "instruction": instruction,
                "sentAt": now,
                "sendCount": 1,
            })
        if newly or set(merged_reasons) != set(current["reasons"] if active else []):
            plan.audits.append(_audit(new_id, "task.withdraw", incident["id"], now))

    conflict_open = bool(conflict and conflict.get("status") == "open")
    lead = nearest_lead(leads, incident["lat"], incident["lng"], now, settings)
    incident["evidenceScore"], incident["evidenceFactors"] = evidence(members, conflict_open, wind_kmh=wind_kmh, lead=lead)
    plan.incident = incident
    return plan
