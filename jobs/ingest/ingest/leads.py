"""NASA FIRMS hotspots -> leads.

A lead is a satellite hint for a person to check. It is never a fire, never an
incident, and never carries a severity. Leads live in their own collection
(`leads`) and nothing in this job touches `incidents`.
"""
from __future__ import annotations

import csv
import hashlib
import io
from datetime import datetime, timezone

FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{source}/{bbox}/{days}"

LEAD_LABEL = "unverified_lead"
LEAD_DISCLAIMER = (
    "Satellite hotspot. A lead for a person to verify, not a confirmed fire. "
    "NASA FIRMS is not for tactical use."
)
_CONFIDENCE = {"l": "low", "n": "nominal", "h": "high"}


class FirmsError(RuntimeError):
    pass


def firms_url(key: str, source: str, bbox: str, days: int) -> str:
    return FIRMS_URL.format(key=key, source=source, bbox=bbox, days=days)


def _num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _confidence(raw: str) -> str:
    raw = (raw or "").strip().lower()
    if raw in _CONFIDENCE:
        return _CONFIDENCE[raw]
    num = _num(raw)  # MODIS reports 0-100
    if num is None:
        return "unknown"
    return "low" if num < 30 else "nominal" if num < 80 else "high"


def _acq_at(date: str, hhmm: str) -> str:
    hhmm = (hhmm or "").strip().zfill(4)
    dt = datetime.strptime(f"{date.strip()} {hhmm}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def lead_id(source: str, lat: float, lng: float, acq_at: str) -> str:
    """Stable id, so re-ingesting the same detection updates one doc."""
    key = f"{source}|{lat:.5f}|{lng:.5f}|{acq_at}"
    return "firms-" + hashlib.sha1(key.encode()).hexdigest()[:16]


def label(doc: dict) -> dict:
    """Stamp the fields every lead must carry, whatever its origin."""
    doc.update(
        kind="firms_hotspot",
        label=LEAD_LABEL,
        needsHumanVerification=True,
        confirmedFire=False,
        disclaimer=LEAD_DISCLAIMER,
    )
    return doc


def parse_firms_csv(text: str, *, source: str) -> list[dict]:
    text = (text or "").strip()
    if not text:
        return []
    first = text.splitlines()[0].lower()
    if "latitude" not in first or "longitude" not in first:
        # FIRMS answers bad keys / quota errors with a plain-text line, not CSV.
        raise FirmsError(f"FIRMS returned no CSV: {text[:200]!r}")
    leads = []
    for row in csv.DictReader(io.StringIO(text)):
        lat, lng = _num(row.get("latitude")), _num(row.get("longitude"))
        if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue
        try:
            acq_at = _acq_at(row.get("acq_date", ""), row.get("acq_time", ""))
        except ValueError:
            continue
        leads.append(label({
            "id": lead_id(source, lat, lng, acq_at),
            "source": "firms",
            "firmsSource": source,
            "satellite": (row.get("satellite") or "").strip() or None,
            "instrument": (row.get("instrument") or "").strip() or None,
            "lat": lat,
            "lng": lng,
            "acqAt": acq_at,
            "confidence": _confidence(row.get("confidence")),
            "frpMw": _num(row.get("frp")),
            "brightnessK": _num(row.get("bright_ti4") or row.get("brightness")),
            "daynight": (row.get("daynight") or "").strip() or None,
        }))
    return leads


def seeded_leads(fixture: dict) -> list[dict]:
    """Hand-seeded demo leads (fixtures/demo_leads.json), labelled like real ones."""
    out = []
    for raw in fixture.get("leads", []):
        doc = {k: raw.get(k) for k in (
            "id", "satellite", "instrument", "lat", "lng", "acqAt",
            "confidence", "frpMw", "brightnessK", "daynight",
        )}
        doc.update(source="seed", firmsSource="hand-seeded", seeded=True)
        out.append(label(doc))
    return out
