"""data.gov.sg PSI -> psi/current (cross-border haze context only)."""
from __future__ import annotations

import json

PSI_URL = "https://api-open.data.gov.sg/v2/real-time/api/psi"


class PsiError(RuntimeError):
    pass


def _ints(d: dict | None) -> dict:
    return {k: v for k, v in (d or {}).items() if isinstance(v, (int, float)) and not isinstance(v, bool)}


def parse_psi(text: str) -> dict:
    try:
        body = json.loads(text)
    except ValueError as exc:
        raise PsiError(f"data.gov.sg returned non-JSON: {exc}") from exc
    if body.get("code") not in (0, None):
        raise PsiError(f"data.gov.sg error: {body.get('errorMsg') or body.get('code')}")
    items = (body.get("data") or {}).get("items") or []
    if not items:
        raise PsiError("data.gov.sg PSI response has no items")
    item = items[-1]
    readings = item.get("readings") or {}
    psi24 = _ints(readings.get("psi_twenty_four_hourly"))
    if not psi24:
        raise PsiError("data.gov.sg PSI response has no psi_twenty_four_hourly")
    return {
        "id": "current",
        "source": "data.gov.sg",
        "observedAt": item.get("timestamp"),
        "updatedAt": item.get("updatedTimestamp"),
        "psi24h": psi24,
        "psi24hMax": max(psi24.values()),
        "pm25_24h": _ints(readings.get("pm25_twenty_four_hourly")),
    }
