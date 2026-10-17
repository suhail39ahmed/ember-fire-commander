"""Extra supervisor-only parts of GET /incidents/{id} (contract 6.3).

Everything here is read from records the services already store: observations,
tasks, the audit log, notification attempts, volunteer names and the advisory
incident summary. Nothing is guessed. A value with no stored source is None
and a part with nothing to show is an empty list, never a made-up default.
"""
import logging
import math

from incidents import rules, store

logger = logging.getLogger(__name__)

ATTEMPTS = "notificationAttempts"
SUMMARIES = "incident_summaries"
MEMBERS = "incident_members"
PHOTO_TRIAGE = "photo_triage"
SUGGESTIONS = "incident_suggestions"
TRANSLATIONS = "observation_translations"
WEATHER = "weather"
PSI = "psi"
COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
TIMELINE_LIMIT = 100
# Audit rows that belong on an incident's timeline. `observation.create` is left out because the report itself is listed.
TIMELINE_ACTIONS = (
    "conflict.open", "task.approve", "task.reject", "task.edit", "task.instruct", "task.resend", "task.heard", "task.withdraw",
    "withdraw.safe", "incident.verify", "incident.extinguish", "incident.severity.lower",
    "incident.severity.raise", "site.reinspect",
)
SUMMARY_FIELDS = ("english", "bahasa", "source", "at")
DEVICE_KEYS = ("batteryPct", "network", "language")
# Audit rows that belong to a disagreement: decisions on its verify and investigate tasks, and on the incident itself.
CONFLICT_TASK_TYPES = ("verify", "investigate")
CONFLICT_TASK_ACTIONS = ("task.approve", "task.reject", "task.edit", "task.resend", "task.heard")
CONFLICT_INCIDENT_ACTIONS = ("conflict.open", "incident.verify", "incident.extinguish", "incident.severity.lower", "incident.severity.raise")


def distance_m(lat1, lng1, lat2, lng2):
    """Straight-line distance in metres, rounded. None when any coordinate is missing."""
    values = (lat1, lng1, lat2, lng2)
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in values):
        return None
    rad = math.pi / 180
    d_lat, d_lng = (lat2 - lat1) * rad, (lng2 - lng1) * rad
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(d_lng / 2) ** 2
    return round(2 * 6371000 * math.asin(min(1.0, math.sqrt(h))))


def _when(iso):
    parsed = rules._parse(iso) if iso else None
    return parsed.timestamp() if parsed else 0.0


def _latest(times):
    """The latest of some ISO times, ignoring blanks. None when there is none."""
    times = [t for t in times if t]
    return max(times, key=_when) if times else None


def _newest(rows, key):
    """The row with the latest time, then the highest id, so the choice never flickers."""
    return max(rows, key=lambda r: (_when(r.get(key)), r.get("id") or ""), default=None)


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def _profiles(uids):
    """What volunteers/{uid} says about each volunteer: a display name, a crew, and whether a device is registered.

    The phone and the device tokens themselves are never copied out. `push` is only whether one token exists.
    """
    names, push, crews = {}, {}, {}
    for uid, snap in store.get_many(store.VOLUNTEERS, [u for u in uids if u]).items():
        data = snap.to_dict() or {}
        name = _text(data.get("displayName"))
        if name:
            names[uid] = name
        crew = _text(data.get("crewName"))
        if crew:
            crews[uid] = crew
        tokens = data.get("fcmTokens")
        push[uid] = isinstance(tokens, list) and any(isinstance(t, str) and t.strip() for t in tokens)
    return names, push, crews


def _docs(snaps):
    return [(s.to_dict() or {}) | {"id": s.id} for s in snaps]


def _delivery(task_ids):
    """The last push result for each task id: sent, failed or skipped."""
    by_task = {}
    for row in _docs(store.where_any(ATTEMPTS, "targetId", "in", sorted(task_ids))) if task_ids else []:
        by_task.setdefault(row.get("targetId"), []).append(row)
    return {tid: (_newest(rows, "at") or {}).get("result") for tid, rows in by_task.items()}


def _audit_rows(incident_id, task_ids):
    rows = _docs(store.where(store.AUDIT, "targetId", "==", incident_id))
    if task_ids:
        rows += _docs(store.where_any(store.AUDIT, "targetId", "in", sorted(task_ids)))
    return [r for r in rows if r.get("action") in TIMELINE_ACTIONS]


def _device(reports):
    """Battery, network and language from the newest report (oldest first in `reports`) that carried them."""
    for report in reversed(reports):
        device = report.get("device")
        if isinstance(device, dict) and any(device.get(k) is not None for k in DEVICE_KEYS):
            return {**{k: device.get(k) for k in DEVICE_KEYS}, "at": report.get("capturedAt")}
    return None


def _card(uid, observations, tasks, withdraw, names, push, centre, delivery, safe_marks, crews, roles):
    mine = sorted(
        (o for o in observations if o.get("volunteerId") == uid),
        key=lambda o: (_when(o.get("capturedAt")), o.get("id") or ""),
    )
    last = mine[-1] if mine else None
    named = next((rules.reporter_name(o) for o in reversed(mine) if rules.reporter_name(o)), None)
    card = {
        "volunteerId": uid,
        "name": named or names.get(uid),
        "reportCount": len(mine),
        "firstReportAt": mine[0].get("capturedAt") if mine else None,
        "lastReportAt": last.get("capturedAt") if last else None,
        "lastSeverity": last.get("severity") if last else None,
        "lastLat": last.get("lat") if last else None,
        "lastLng": last.get("lng") if last else None,
        "lastAccuracyM": last.get("accuracyM") if last else None,
        # From the incident's centre, which is the centroid of its reports. Not the flame edge.
        "distanceM": distance_m(centre[0], centre[1], last.get("lat"), last.get("lng")) if last else None,
        # The latest sign of life: their newest report arriving, or their app saying it showed an instruction.
        "lastHeardAt": _latest([last.get("receivedAt") if last else None] + [t.get("heardAt") for t in tasks if t.get("volunteerId") == uid]),
        # Whether a device token is stored for them.
        "pushReady": push.get(uid, False),
        # The crew on their profile, and the team role stored when they joined. Each is None until something stores it.
        "crewName": crews.get(uid),
        "teamRole": roles.get(uid),
        # What their phone said about itself with its newest report that carried it. None when no report did.
        "device": _device(mine),
        "withdraw": None,
    }
    if withdraw.get("active") and uid in (withdraw.get("volunteerIds") or []):
        sent = _newest([t for t in tasks if t.get("volunteerId") == uid and t.get("type") == "withdraw"], "sentAt")
        mark = safe_marks.get(uid)
        safe = uid in (withdraw.get("safeVolunteerIds") or [])
        card["withdraw"] = {
            "sentAt": sent.get("sentAt") if sent else None,
            "heardAt": sent.get("heardAt") if sent else None,
            "sendCount": sent.get("sendCount") if sent else None,
            "delivery": delivery.get(sent["id"]) if sent else None,
            "safe": safe,
            # Who and when come from the audit row written at the time. A mark made before that row carried the volunteer has neither.
            "safeAt": mark.get("at") if safe and mark else None,
            "safeBy": {"id": mark.get("actorId"), "name": _text(mark.get("actorName")) or names.get(mark.get("actorId"))} if safe and mark else None,
        }
    return card


def _audit_entry(row, task_by_id, names):
    """One audit row in the shape the timeline and the conflict context share."""
    task = task_by_id.get(row.get("targetId")) or {}
    return {
        "kind": "audit", "id": row["id"], "at": row.get("at"), "action": row.get("action"),
        "actorId": row.get("actorId"),
        "actorName": None if row.get("actorId") == "code" else _text(row.get("actorName")) or names.get(row.get("actorId")),
        "volunteerId": row.get("subjectId") or task.get("volunteerId"),
        "taskId": row.get("targetId") if task else None,
        "severity": None, "source": None, "chip": None, "text": None,
    }


def _conflict_context(incident_id, data, observations, conflict_body, tasks, audit, names, task_by_id):
    """What a supervisor needs beside the two sides of a disagreement. None when the incident has no conflict.

    `otherObservations` are the reports the incident holds that are on neither side (smoke or unknown),
    which `observations` leaves out while a conflict exists. `audit` is the recorded decisions on the
    conflict's verify and investigate tasks and on the incident, with the `conflict.open` row code wrote when the
    disagreement began (an older conflict has none). `allObservations` is every report of the incident, the two
    sides included.
    """
    if not conflict_body:
        return None
    sides = set(conflict_body.get("observationIds") or [])
    mine = set(data.get("observationIds") or [])
    others = sorted(
        (o for o in observations if o.get("id") in mine and o.get("id") not in sides),
        key=lambda o: (_when(o.get("capturedAt")), o.get("id") or ""),
    )
    def record_of(o):
        record = rules.pick(o, rules.OBSERVATION_FIELDS)
        name = rules.reporter_name(o)
        if name:
            record["volunteerName"] = name
        return record

    records = [record_of(o) for o in others]
    # Every report the incident holds or the conflict lists, the two sides included, oldest first.
    every = sorted(
        (o for o in observations if o.get("id") in mine or o.get("id") in sides),
        key=lambda o: (_when(o.get("capturedAt")), o.get("id") or ""),
    )
    task_ids = {t["id"] for t in tasks if t.get("type") in CONFLICT_TASK_TYPES}
    rows = [
        r for r in audit
        if (r.get("action") in CONFLICT_INCIDENT_ACTIONS and r.get("targetId") == incident_id)
        or (r.get("action") in CONFLICT_TASK_ACTIONS and r.get("targetId") in task_ids)
    ]
    entries = [_audit_entry(r, task_by_id, names) for r in rows]
    entries.sort(key=lambda e: (_when(e["at"]), e["id"]))
    return {"otherObservations": records, "allObservations": [record_of(o) for o in every], "audit": entries[-TIMELINE_LIMIT:]}


def _team_roles(incident_id):
    """{volunteer id: team role} from the join rows that have one. Empty when nothing stored a role."""
    roles = {}
    for snap in store.where(MEMBERS, "incidentId", "==", incident_id):
        row = snap.to_dict() or {}
        role = _text(row.get("teamRole"))
        if role and isinstance(row.get("volunteerId"), str):
            roles[row["volunteerId"]] = role
    return roles


def _header(incident_id, data, observations, tasks):
    """Code, place, when it opened, who is on site and what opened it, from the incident and its reports.

    `openedAt` and `source` come from the earliest of the incident's own reports (by `receivedAt`). Both are
    None when none can be read. A satellite lead is never a source here: leads stay internal.
    """
    own = set(data.get("observationIds") or [])
    mine = [o for o in observations if o.get("id") in own]
    first = min(mine, key=lambda o: (_when(o.get("receivedAt") or o.get("capturedAt")), o.get("id") or ""), default=None)
    people = {o.get("volunteerId") for o in observations} | {t.get("volunteerId") for t in tasks}
    people.discard(None)
    return {
        "code": rules.incident_code(data, incident_id),
        "placeName": rules.place_name(data),
        "openedAt": (first.get("receivedAt") or first.get("capturedAt")) if first else None,
        "peopleOnSite": len(people),
        "source": first.get("source") if first else None,
    }


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _conditions():
    """The latest stored weather and air reads, as the ingest job wrote them. Each part is None when not stored.

    Both come from one fixed monitoring point or one national feed, not from the incident, and the answer says so.
    Nothing here is a forecast or a plume.
    """
    weather = air = None
    snap = store.db().collection(WEATHER).document("current").get()
    if snap.exists:
        raw = snap.to_dict() or {}
        direction = _number(raw.get("windDirDeg"))
        weather = {
            "observedAt": _text(raw.get("observedAt")),
            "windKmh": _number(raw.get("windKmh")),
            "windDirDeg": round(direction % 360, 1) if direction is not None else None,
            "windFrom": COMPASS[int(((direction % 360) + 22.5) // 45) % 8] if direction is not None else None,
            "gustKmh": _number(raw.get("gustKmh")),
            "tempC": _number(raw.get("tempC")),
            "humidityPct": _number(raw.get("humidityPct")),
            "rainMm": _number(raw.get("precipMm")),
            "source": _text(raw.get("source")),
        }
    snap = store.db().collection(PSI).document("current").get()
    if snap.exists:
        raw = snap.to_dict() or {}
        pm25 = [v for v in (raw.get("pm25_24h") or {}).values() if _number(v) is not None] if isinstance(raw.get("pm25_24h"), dict) else []
        air = {
            "observedAt": _text(raw.get("observedAt")),
            "psi24hMax": _number(raw.get("psi24hMax")),
            "pm25Max": max(pm25) if pm25 else None,
            "source": _text(raw.get("source")),
        }
    return {"weather": weather, "air": air}


def _photo_reads(observations):
    """{observation id: what the advisory photo read said}, for photo reports that were read successfully.

    The read describes the picture. It is advisory, it states no severity, and it is never an incident fact.
    """
    ids = [o["id"] for o in observations if o.get("source") == "photo"]
    reads = {}
    for oid, snap in store.get_many(PHOTO_TRIAGE, ids).items():
        raw = snap.to_dict() or {}
        result = raw.get("result")
        if raw.get("status") != "ok" or not isinstance(result, dict):
            continue
        reads[oid] = {
            "smokeVisible": result.get("smokeVisible") if isinstance(result.get("smokeVisible"), bool) else None,
            "flameVisible": _text(result.get("flameVisible")),
            "burnScarVisible": result.get("burnScarVisible") if isinstance(result.get("burnScarVisible"), bool) else None,
            "notes": _text(result.get("notes")),
            "at": _text(raw.get("at")),
        }
    return reads


def _suggestions(incident_id):
    """The last suggestions agents stored for the incident, or None. Advisory text only."""
    snap = store.db().collection(SUGGESTIONS).document(incident_id).get()
    if not snap.exists:
        return None
    raw = snap.to_dict() or {}
    items = [
        {"text": _text(i.get("text")), "rationale": _text(i.get("rationale"))}
        for i in (raw.get("suggestions") or []) if isinstance(i, dict) and _text(i.get("text"))
    ]
    return {
        "items": items,
        "source": _text(raw.get("source")),
        "generatedAt": _text(raw.get("generatedAt")),
    }


def _translations(observations):
    """{observation id: stored English translation} for reports that have text. `{}` when none was stored."""
    ids = [o["id"] for o in observations if _text(o.get("text"))]
    out = {}
    for oid, snap in store.get_many(TRANSLATIONS, ids).items():
        raw = snap.to_dict() or {}
        english = _text(raw.get("english"))
        if english:
            out[oid] = {"english": english, "sourceLanguage": _text(raw.get("sourceLanguage")), "at": _text(raw.get("at"))}
    return out


def _guard(name, build, fallback):
    """A source that cannot be read leaves its part empty. It never fails the whole incident read."""
    try:
        return build()
    except Exception:  # noqa: BLE001 - one unreadable collection must not hide the incident
        logger.exception("incident detail %s could not be read", name)
        return fallback


def build(incident_id, data, observations, conflict_body, tasks):
    """The supervisor-only extras for one incident.

    `observations` are the incident's own and its conflict's observation records (`id` set), every one the
    incident knows, not only the two sides of a disagreement. `tasks` are all the incident's tasks.
    """
    withdraw = data.get("withdraw") or {}
    task_ids = {t["id"] for t in tasks}
    audit = _audit_rows(incident_id, task_ids)
    uids = {o.get("volunteerId") for o in observations} | {t.get("volunteerId") for t in tasks}
    uids |= set(withdraw.get("volunteerIds") or []) if withdraw.get("active") else set()
    uids |= {r.get("actorId") for r in audit} | {r.get("subjectId") for r in audit}
    uids.discard(None)
    names, push, crews = _profiles(uids)

    withdraw_task_ids = {t["id"] for t in tasks if t.get("type") == "withdraw"}
    safe_marks = {}
    for row in audit:
        if row.get("action") == "withdraw.safe" and row.get("subjectId"):
            current = safe_marks.get(row["subjectId"])
            if current is None or _when(row.get("at")) >= _when(current.get("at")):
                safe_marks[row["subjectId"]] = row
    delivery = _delivery(withdraw_task_ids)

    roles = _team_roles(incident_id)
    centre = (data.get("lat"), data.get("lng"))
    people = {o.get("volunteerId") for o in observations} | {t.get("volunteerId") for t in tasks}
    if withdraw.get("active"):
        people |= set(withdraw.get("volunteerIds") or [])
    people.discard(None)
    cards = [_card(uid, observations, tasks, withdraw, names, push, centre, delivery, safe_marks, crews, roles) for uid in sorted(people)]
    cards.sort(key=lambda c: (-_when(c["lastReportAt"]), c["volunteerId"]))

    task_by_id = {t["id"]: t for t in tasks}
    entries = []
    for o in observations:
        entries.append({
            "kind": "report", "id": o["id"], "at": o.get("capturedAt"), "action": None,
            "actorId": o.get("volunteerId"), "actorName": rules.reporter_name(o) or names.get(o.get("volunteerId")),
            "volunteerId": o.get("volunteerId"), "taskId": None,
            "severity": o.get("severity"), "source": o.get("source"), "chip": o.get("chip"), "text": o.get("text"),
        })
    entries += [_audit_entry(row, task_by_id, names) for row in audit]
    entries.sort(key=lambda e: (_when(e["at"]), e["id"]))
    timeline = entries[-TIMELINE_LIMIT:]

    summary = None
    snap = store.db().collection(SUMMARIES).document(incident_id).get()
    if snap.exists:
        raw = snap.to_dict() or {}
        if _text(raw.get("english")) or _text(raw.get("bahasa")):
            summary = rules.pick(raw, SUMMARY_FIELDS)
    return {
        "volunteers": cards, "timeline": timeline, "summary": summary,
        "conflictContext": _conflict_context(incident_id, data, observations, conflict_body, tasks, audit, names, task_by_id),
        # Only a value stored on the incident itself. Nothing writes it yet, so it is None today.
        "agencyInCharge": _text(data.get("agency")),
        "header": _header(incident_id, data, observations, tasks),
        "conditions": _guard("conditions", _conditions, {"weather": None, "air": None}),
        "photoReads": _guard("photo reads", lambda: _photo_reads(observations), {}),
        "suggestions": _guard("suggestions", lambda: _suggestions(incident_id), None),
        "translations": _guard("translations", lambda: _translations(observations), {}),
    }


HELP_CHIP = "butuh_bantuan"


def list_extras(snapshots):
    """Counts and flags for the supervisor's incident list, from stored records. {incident id: extras}.

    `reportCount` is every observation the incident holds. `volunteerCount` is the distinct volunteers who
    reported. `needsHelp` is true when any of those reports is the "butuh bantuan" chip. `verifiedBy` is the
    name on the newest `incident.verify` audit row of a verified incident, and None when no name was stored.
    `verified` says whether such a row exists, so a missing name is not read as a missing verification.
    """
    incidents = {snap.id: snap.to_dict() or {} for snap in snapshots}
    wanted = []
    for data in incidents.values():
        ids = data.get("observationIds")
        wanted += [i for i in ids if isinstance(i, str) and i] if isinstance(ids, list) else []
    found = {oid: snap.to_dict() or {} for oid, snap in store.get_many(store.OBSERVATIONS, wanted).items()}

    verified_ids = [i for i, data in incidents.items() if data.get("status") == "verified"]
    verify_rows = {}
    if verified_ids:
        for row in _docs(store.where_any(store.AUDIT, "targetId", "in", sorted(verified_ids))):
            if row.get("action") != "incident.verify":
                continue
            current = verify_rows.get(row.get("targetId"))
            if current is None or (_when(row.get("at")), row["id"]) >= (_when(current.get("at")), current["id"]):
                verify_rows[row.get("targetId")] = row
    actor_ids = [r.get("actorId") for r in verify_rows.values() if not _text(r.get("actorName"))]
    names, _, _ = _profiles(actor_ids)

    out = {}
    for incident_id, data in incidents.items():
        reports = [found[i] for i in (data.get("observationIds") or []) if isinstance(i, str) and i in found]
        row = verify_rows.get(incident_id)
        out[incident_id] = {
            "reportCount": len(reports),
            "volunteerCount": len({o.get("volunteerId") for o in reports if o.get("volunteerId")}),
            "needsHelp": any(o.get("chip") == HELP_CHIP for o in reports),
            "verified": row is not None,
            "verifiedBy": (_text(row.get("actorName")) or names.get(row.get("actorId"))) if row else None,
        }
    return out


def volunteer_names(incidents, volunteer_ids):
    """{volunteer id: display name} for people with a task. The name on one of their reports on those incidents, else the volunteer record."""
    wanted = {v for v in volunteer_ids if v}
    names = {}
    report_ids = []
    for data in incidents.values():
        ids = data.get("observationIds")
        report_ids += [i for i in ids if isinstance(i, str) and i] if isinstance(ids, list) else []
    for snap in store.get_many(store.OBSERVATIONS, report_ids).values():
        data = snap.to_dict() or {}
        name = rules.reporter_name(data)
        if name and data.get("volunteerId") in wanted:
            names[data["volunteerId"]] = name
    profile_names, _, _ = _profiles([v for v in wanted if v not in names])
    return names | profile_names
