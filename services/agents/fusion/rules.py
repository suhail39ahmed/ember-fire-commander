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
- Code only ever raises severity. It never verifies, extinguishes, or lowers.
- A `live` observation's severity comes from the model, so it is not copied
  onto the incident. It can still trigger WITHDRAW, because withdrawing is
  the safe direction.
"""
from dataclasses import dataclass, field

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


def evidence(observations, conflict_open):
    """Explainable evidence score: 0-100 plus the factors that produced it.

    This is a count of supporting evidence, not a probability or forecast.
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
    if conflict_open:
        factors.append({
            "factor": "conflict",
            "points": CONFLICT_PENALTY,
            "detail": "reports disagree and are held for verification",
        })
    score = max(0, min(100, sum(f["points"] for f in factors)))
    return score, factors


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


def fuse(observation, state, new_id, now, wind_kmh=None, settings=None):
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
        }
        for volunteer_id in newly:
            plan.tasks.append({
                "id": new_id("tasks"),
                "incidentId": incident["id"],
                "volunteerId": volunteer_id,
                "type": "withdraw",
                "status": "approved",
                "instruction": instruction,
            })
        if newly or set(merged_reasons) != set(current["reasons"] if active else []):
            plan.audits.append(_audit(new_id, "task.withdraw", incident["id"], now))

    conflict_open = bool(conflict and conflict.get("status") == "open")
    incident["evidenceScore"], incident["evidenceFactors"] = evidence(members, conflict_open)
    plan.incident = incident
    return plan
