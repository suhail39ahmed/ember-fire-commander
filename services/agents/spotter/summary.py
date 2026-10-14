"""Bahasa Indonesia and English incident summaries grounded in stored fields.

Code builds the facts. The model only rewords them. Code then checks the
text: if it states a severity, a status change, or a safety decision, the
model text is discarded and a plain template built from the facts is used.
"""
import re

PROMPT = """Write a short neutral summary of a field incident for a supervisor.
Use ONLY the facts in the JSON below. Do not add facts, numbers, or places.
Do not state or suggest a severity, a danger level, whether anyone should act,
withdraw, or be dispatched, or whether the fire is confirmed or out.
Reply with one JSON object: {"en": "<English, max 2 sentences>", "id": "<Bahasa Indonesia, max 2 sentences>"}

FACTS:
"""

# Words that would turn a description into a severity or safety call.
_BLOCKED = [
    r"sever", r"critical", r"danger", r"hazard", r"\bsafe", r"unsafe", r"evacuat",
    r"withdraw", r"dispatch", r"\bapprov", r"confirm", r"\bverified\b", r"extinguish",
    r"large flame", r"small flame", r"large fire", r"\burgent",
    r"bahaya", r"berbahaya", r"\baman\b", r"evakuasi", r"mundur", r"darurat",
    r"parah", r"api besar", r"api kecil", r"dikonfirmasi", r"padam",
]
_BLOCKED_RE = re.compile("|".join(_BLOCKED), re.IGNORECASE)


def facts(incident, observations, conflict, triages):
    """The only material a summary may use. No incident severity on purpose."""
    reports = []
    for o in observations:
        reports.append({
            "source": o.get("source"),
            "chip": o.get("chip"),
            "text": (o.get("text") or "")[:200] or None,
            "capturedAt": o.get("capturedAt"),
            "hasPhoto": bool(o.get("photoPath")),
        })
    photos = [
        {
            "smokeVisible": t["result"]["smokeVisible"],
            "flameVisible": t["result"]["flameVisible"],
            "burnScarVisible": t["result"]["burnScarVisible"],
            "notes": t["result"]["notes"],
        }
        for t in triages if t.get("status") == "ok" and t.get("result")
    ]
    return {
        "incidentId": incident["id"],
        "reportCount": len(observations),
        "volunteerCount": len({o.get("volunteerId") for o in observations}),
        "reportsDisagree": bool(conflict and conflict.get("status") == "open"),
        "reports": reports,
        "photoDescriptions": photos,
    }


def template(f):
    n, v = f["reportCount"], f["volunteerCount"]
    en = f"{n} report(s) from {v} volunteer(s) at this location."
    idn = f"{n} laporan dari {v} relawan di lokasi ini."
    if f["reportsDisagree"]:
        en += " The reports disagree and are waiting for a check."
        idn += " Laporan saling berbeda dan menunggu pengecekan."
    if f["photoDescriptions"]:
        en += f" {len(f['photoDescriptions'])} photo(s) attached."
        idn += f" {len(f['photoDescriptions'])} foto terlampir."
    return {"en": en, "id": idn}


def is_neutral(text):
    return isinstance(text, str) and bool(text.strip()) and not _BLOCKED_RE.search(text)


def summarize(incident, observations, conflict, triages, model, now):
    import json

    f = facts(incident, observations, conflict, triages)
    source = "model"
    try:
        raw = model.json(PROMPT + json.dumps(f, ensure_ascii=False))
        text = {"en": raw.get("en"), "id": raw.get("id")}
        if not (is_neutral(text["en"]) and is_neutral(text["id"])):
            text, source = template(f), "template"
    except Exception:
        text, source = template(f), "template"
    return {
        "id": incident["id"],
        "incidentId": incident["id"],
        "english": text["en"].strip()[:400],
        "bahasa": text["id"].strip()[:400],
        "source": source,
        "advisory": True,
        "model": model.name if source == "model" else None,
        "facts": f,
        "at": now,
    }
