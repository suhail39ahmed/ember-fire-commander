"""The only material the suggestion and Ask answers may use.

Code reads stored fields and nothing else: the incident, its reports, photo
reads, tasks, volunteer names and crews, device facts the phones sent, and the
latest stored weather. Satellite leads, phone numbers and device tokens are
never included. `gaps` is computed here, in code, so an answer can say what is
not stored instead of guessing.
"""

REPORT_LIMIT = 30
TASK_LIMIT = 40
TEXT_LIMIT = 300
WEATHER_KEYS = ("windKmh", "windDirDeg", "gustKmh", "tempC", "humidityPct", "precipMm")
DEVICE_KEYS = ("batteryPct", "network", "language")


def _text(value, limit=TEXT_LIMIT):
    return value.strip()[:limit] if isinstance(value, str) and value.strip() else None


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _device(reports):
    """The newest device facts a volunteer's reports carried, or None."""
    for report in sorted(reports, key=lambda o: o.get("capturedAt") or "", reverse=True):
        device = report.get("device")
        if isinstance(device, dict) and any(device.get(k) is not None for k in DEVICE_KEYS):
            return {k: device.get(k) for k in DEVICE_KEYS if device.get(k) is not None}
    return None


def build(incident, observations, conflict, triages, tasks, volunteers, weather):
    ordered = sorted(observations, key=lambda o: (o.get("capturedAt") or "", o.get("id") or ""))
    shown = ordered[-REPORT_LIMIT:]
    reads = {t.get("observationId") or t.get("id"): t["result"] for t in triages if t.get("status") == "ok" and isinstance(t.get("result"), dict)}

    reports = []
    for o in shown:
        row = {
            "id": o.get("id"),
            "volunteerId": o.get("volunteerId"),
            "volunteerName": _text(o.get("volunteerName"), 80),
            "source": o.get("source"),
            "chip": o.get("chip"),
            "severity": o.get("severity"),
            "text": _text(o.get("text")),
            "capturedAt": o.get("capturedAt"),
            "hasPhoto": bool(o.get("photoPath")),
        }
        read = reads.get(o.get("id"))
        if read:
            row["photoRead"] = {
                "smokeVisible": read.get("smokeVisible"),
                "flameVisible": read.get("flameVisible"),
                "burnScarVisible": read.get("burnScarVisible"),
                "notes": _text(read.get("notes"), 200),
            }
        reports.append(row)

    by_volunteer = {}
    for o in observations:
        if o.get("volunteerId"):
            by_volunteer.setdefault(o["volunteerId"], []).append(o)
    people = []
    for uid in sorted(set(by_volunteer) | {t.get("volunteerId") for t in tasks if t.get("volunteerId")}):
        profile = volunteers.get(uid) or {}
        mine = by_volunteer.get(uid, [])
        named = next((_text(o.get("volunteerName"), 80) for o in reversed(mine) if _text(o.get("volunteerName"), 80)), None)
        people.append({
            "volunteerId": uid,
            "name": named or _text(profile.get("displayName"), 80),
            "crew": _text(profile.get("crewName"), 80),
            "reportCount": len(mine),
            "device": _device(mine),
        })

    task_rows = [
        {
            "type": t.get("type"),
            "status": t.get("status"),
            "volunteerId": t.get("volunteerId"),
            "instruction": _text(t.get("instruction")),
            "sentAt": t.get("sentAt"),
            "heard": bool(t.get("heardAt")),
            "accepted": bool(t.get("acceptedAt")),
            "declined": bool(t.get("declinedAt")),
        }
        for t in sorted(tasks, key=lambda t: t.get("id") or "")[:TASK_LIMIT]
    ]

    stored_weather = None
    if weather:
        numbers = {k: weather[k] for k in WEATHER_KEYS if _number(weather.get(k)) is not None}
        if numbers:
            stored_weather = dict(numbers, observedAt=_text(weather.get("observedAt"), 40),
                                  note="one fixed monitoring point, not measured at the incident")

    withdraw = incident.get("withdraw") if isinstance(incident.get("withdraw"), dict) else None
    factors = [
        {"factor": f.get("factor"), "points": f.get("points"), "detail": _text(f.get("detail"), 200)}
        for f in (incident.get("evidenceFactors") or []) if isinstance(f, dict)
    ]
    photo_reports = [o for o in observations if o.get("source") == "photo"]
    gaps = []
    if not observations:
        gaps.append("no report is stored for this incident")
    if not photo_reports:
        gaps.append("no photo report is stored")
    elif not any(o.get("id") in reads for o in photo_reports):
        gaps.append("no photo has been read yet")
    if stored_weather is None:
        gaps.append("no weather reading is stored")
    if not any(p["device"] for p in people):
        gaps.append("no report carried battery, network or language")
    if not any(p["crew"] for p in people):
        gaps.append("no volunteer has a crew stored")
    gaps.append("volunteer roles, spread and wind shift are not stored")

    return {
        "incident": {
            "id": incident.get("id"),
            "name": _text(incident.get("name"), 120),
            "area": _text(incident.get("area"), 120),
            "status": incident.get("status"),
            "severity": incident.get("severity"),
            "evidenceScore": incident.get("evidenceScore"),
            "evidenceFactors": factors,
            "withdrawActive": bool(withdraw and withdraw.get("active")),
            "reportsDisagree": bool(conflict and conflict.get("status") == "open"),
            "lat": _number(incident.get("lat")),
            "lng": _number(incident.get("lng")),
        },
        "reportCount": len(observations),
        "reportsShown": len(reports),
        "reports": reports,
        "volunteers": people,
        "tasks": task_rows,
        "weather": stored_weather,
        "gaps": gaps,
    }


def focus(facts, volunteer_id):
    """Facts plus the one volunteer the supervisor is looking at, or None when they are not on the incident."""
    person = next((p for p in facts["volunteers"] if p["volunteerId"] == volunteer_id), None)
    if person is None:
        return None
    return dict(facts, focusVolunteer=person)
