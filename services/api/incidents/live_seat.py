"""One live-camera seat per incident (issue #102).

Stored in `liveSeats/{incidentId}`. Supervisors assign the seat (make-live /
retry). The voice-gateway updates signal and records drops for the current
holder. Neither path reopens, verifies, or re-rates the incident.
"""
from identity import AuthError
from incidents import rules, store
from incidents.errors import conflict, not_found, validation

LIVE_SEATS = "liveSeats"

SIGNALS = ("2g", "3g", "4g", "wifi", "unknown")
SIGNAL_OK = frozenset({"3g", "4g", "wifi"})
MEDIA = ("live", "photo_60s", "none")
DROP_REASONS = ("signal_below_3g", "connection_lost")

PHOTO_CADENCE = "every_60s"


def signal_ok(signal):
    return signal in SIGNAL_OK


def empty_seat(incident_id):
    return {
        "incidentId": incident_id,
        "status": "free",
        "holderId": None,
        "updatedAt": None,
        "lastDrop": None,
        "volunteers": {},
    }


def _vol_entry(raw):
    if not isinstance(raw, dict):
        return None
    signal = raw.get("signal") if raw.get("signal") in SIGNALS else "unknown"
    media = raw.get("media") if raw.get("media") in MEDIA else "none"
    entry = {
        "signal": signal,
        "media": media,
        "photoCadence": PHOTO_CADENCE if media == "photo_60s" else None,
        "updatedAt": raw.get("updatedAt") if isinstance(raw.get("updatedAt"), str) else None,
    }
    return entry


def client_seat(seat, names=None):
    """Fields the browser may see. names maps volunteerId → display name."""
    names = names or {}
    incident_id = seat.get("incidentId") or seat.get("id")
    holder_id = seat.get("holderId") if isinstance(seat.get("holderId"), str) else None
    status = "held" if holder_id else "free"
    last = seat.get("lastDrop") if isinstance(seat.get("lastDrop"), dict) else None
    last_drop = None
    if last and isinstance(last.get("volunteerId"), str):
        vid = last["volunteerId"]
        last_drop = {
            "volunteerId": vid,
            "volunteerName": names.get(vid),
            "at": last.get("at") if isinstance(last.get("at"), str) else None,
            "reason": last.get("reason") if last.get("reason") in DROP_REASONS else "connection_lost",
            "signal": last.get("signal") if last.get("signal") in SIGNALS else "unknown",
        }
    volunteers = {}
    raw_vols = seat.get("volunteers") if isinstance(seat.get("volunteers"), dict) else {}
    for vid, raw in raw_vols.items():
        if not isinstance(vid, str):
            continue
        entry = _vol_entry(raw)
        if entry is None:
            continue
        can_retry = (
            entry["media"] == "photo_60s"
            and signal_ok(entry["signal"])
            and status == "free"
        )
        can_make_live = (
            entry["media"] != "live"
            and signal_ok(entry["signal"])
            and status == "free"
            and vid != holder_id
        )
        volunteers[vid] = {
            **entry,
            "canRetry": can_retry,
            "canMakeLive": can_make_live,
        }
    return {
        "incidentId": incident_id,
        "status": status,
        "holderId": holder_id,
        "holderName": names.get(holder_id) if holder_id else None,
        "lastDrop": last_drop,
        "volunteers": volunteers,
    }


def load_seat(incident_id):
    snap = store.db().collection(LIVE_SEATS).document(incident_id).get()
    if not snap.exists:
        return empty_seat(incident_id)
    data = snap.to_dict() or {}
    data["incidentId"] = data.get("incidentId") or snap.id
    data["id"] = snap.id
    return data


def seat_for_response(incident_id, observations):
    """Supervisor GET shape. Builds volunteer names from observations."""
    names = {}
    for obs in observations:
        vid = obs.get("volunteerId")
        name = obs.get("volunteerName")
        if isinstance(vid, str) and isinstance(name, str) and name.strip() and vid not in names:
            names[vid] = name.strip()
    return client_seat(load_seat(incident_id), names)


def _require_supervisor():
    from flask import g
    if g.user["role"] != "supervisor":
        raise AuthError(403, "forbidden", "Only a supervisor can do this")


def _volunteer_on_incident(incident_id, volunteer_id):
    incident = store.db().collection(store.INCIDENTS).document(incident_id).get()
    if not incident.exists:
        raise not_found("incident")
    data = incident.to_dict() or {}
    for snap in store.where(store.TASKS, "volunteerId", "==", volunteer_id):
        if (snap.to_dict() or {}).get("incidentId") == incident_id:
            return data
    withdraw = data.get("withdraw") or {}
    if withdraw.get("active") and volunteer_id in (withdraw.get("volunteerIds") or []):
        return data
    obs_ids = list(data.get("observationIds") or [])
    if data.get("conflictId"):
        conflict = store.db().collection(store.CONFLICTS).document(data["conflictId"]).get()
        if conflict.exists:
            obs_ids += (conflict.to_dict() or {}).get("observationIds") or []
    for oid in obs_ids:
        obs = store.db().collection(store.OBSERVATIONS).document(oid).get()
        if obs.exists and (obs.to_dict() or {}).get("volunteerId") == volunteer_id:
            return data
    raise validation("volunteerId", "volunteer is not on this incident")


def _assign(incident_id, volunteer_id, action):
    """Make-live or retry: hold the seat for volunteer_id when signal is good."""
    _require_supervisor()
    if not isinstance(volunteer_id, str) or not volunteer_id.strip():
        raise validation("volunteerId", "a volunteer id is required")
    volunteer_id = volunteer_id.strip()
    _volunteer_on_incident(incident_id, volunteer_id)

    now = rules.now_iso()

    def run(transaction):
        from flask import g
        ref = store.db().collection(LIVE_SEATS).document(incident_id)
        snap = ref.get(transaction=transaction)
        seat = snap.to_dict() if snap.exists else empty_seat(incident_id)
        volunteers = dict(seat.get("volunteers") or {})
        entry = dict(volunteers.get(volunteer_id) or {})
        signal = entry.get("signal") if entry.get("signal") in SIGNALS else "unknown"
        if not signal_ok(signal):
            raise conflict(
                "Signal is below 3G. Retry when the volunteer has 3G or better."
            )
        if seat.get("holderId") and seat.get("holderId") != volunteer_id:
            raise conflict("The live seat is already held")
        if action == "live.retry" and entry.get("media") != "photo_60s":
            raise conflict("Retry is only for a volunteer who dropped to photo cadence")

        # Free any previous holder entry (same volunteer re-taking is fine).
        previous = seat.get("holderId")
        if previous and previous != volunteer_id:
            prev = dict(volunteers.get(previous) or {})
            prev["media"] = "photo_60s"
            prev["updatedAt"] = now
            volunteers[previous] = prev

        entry["signal"] = signal
        entry["media"] = "live"
        entry["updatedAt"] = now
        volunteers[volunteer_id] = entry
        updated = {
            "incidentId": incident_id,
            "status": "held",
            "holderId": volunteer_id,
            "updatedAt": now,
            "lastDrop": seat.get("lastDrop"),
            "volunteers": volunteers,
        }
        transaction.set(ref, updated)
        audit_ref = store.db().collection(store.AUDIT).document()
        transaction.set(
            audit_ref,
            rules.audit_record(audit_ref.id, g.user["id"], action, incident_id),
        )
        return updated, audit_ref.id

    seat, audit_id = store.run_transaction(run)
    return seat, audit_id


def make_live(incident_id, volunteer_id):
    return _assign(incident_id, volunteer_id, "live.make")


def retry_live(incident_id, volunteer_id):
    return _assign(incident_id, volunteer_id, "live.retry")
