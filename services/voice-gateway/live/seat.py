"""Update liveSeats when the holder reports signal or the session drops (#102).

Supervisors assign the seat through ember-api. This module only writes signal
and drop events for digest incidents, and frees the seat when the current
holder falls below 3G or disconnects.
"""
SIGNALS = ("2g", "3g", "4g", "wifi", "unknown")
SIGNAL_OK = frozenset({"3g", "4g", "wifi"})
PHOTO_CADENCE_MEDIA = "photo_60s"


def parse_signal(value):
    if isinstance(value, str) and value.lower() in SIGNALS:
        return value.lower()
    return None


def apply_signal(seat, volunteer_id, signal, now, drop_if_weak=True):
    """Merge one volunteer's signal into the seat. Returns (seat, action) or (None, None)."""
    if signal not in SIGNALS:
        return None, None
    seat = dict(seat)
    volunteers = dict(seat.get("volunteers") or {})
    entry = dict(volunteers.get(volunteer_id) or {})
    entry["signal"] = signal
    entry["updatedAt"] = now
    if entry.get("media") not in ("live", "photo_60s", "none"):
        entry["media"] = "none"
    volunteers[volunteer_id] = entry
    seat["volunteers"] = volunteers
    seat["updatedAt"] = now

    if (
        drop_if_weak
        and seat.get("holderId") == volunteer_id
        and signal not in SIGNAL_OK
    ):
        entry["media"] = PHOTO_CADENCE_MEDIA
        volunteers[volunteer_id] = entry
        seat["volunteers"] = volunteers
        seat["status"] = "free"
        seat["holderId"] = None
        seat["lastDrop"] = {
            "volunteerId": volunteer_id,
            "at": now,
            "reason": "signal_below_3g",
            "signal": signal,
        }
        return seat, "live.drop"
    return seat, None


def apply_disconnect(seat, volunteer_id, now, last_signal="unknown"):
    """Free the seat when the holder disconnects. Returns (seat, audit_action|None)."""
    if seat.get("holderId") != volunteer_id:
        return None, None
    seat = dict(seat)
    volunteers = dict(seat.get("volunteers") or {})
    entry = dict(volunteers.get(volunteer_id) or {})
    signal = last_signal if last_signal in SIGNALS else entry.get("signal", "unknown")
    if signal not in SIGNALS:
        signal = "unknown"
    entry["signal"] = signal
    entry["media"] = PHOTO_CADENCE_MEDIA
    entry["updatedAt"] = now
    volunteers[volunteer_id] = entry
    seat["volunteers"] = volunteers
    seat["status"] = "free"
    seat["holderId"] = None
    seat["updatedAt"] = now
    seat["lastDrop"] = {
        "volunteerId": volunteer_id,
        "at": now,
        "reason": "connection_lost",
        "signal": signal,
    }
    return seat, "live.drop"
