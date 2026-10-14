"""Open-Meteo current weather -> weather/current.

`windKmh` (km/h) is the field the agents WITHDRAW rule reads
(services/agents/fusion/store.py, threshold EMBER_WIND_WITHDRAW_KMH).
"""
from __future__ import annotations

import json
from urllib.parse import urlencode

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
_CURRENT = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m"


class WeatherError(RuntimeError):
    pass


def weather_url(lat: float, lng: float) -> str:
    return OPEN_METEO_URL + "?" + urlencode({
        "latitude": lat,
        "longitude": lng,
        "current": _CURRENT,
        "wind_speed_unit": "kmh",
        "timezone": "UTC",
    })


def _f(cur: dict, key: str):
    v = cur.get(key)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def parse_open_meteo(text: str, *, lat: float, lng: float) -> dict:
    try:
        body = json.loads(text)
    except ValueError as exc:
        raise WeatherError(f"Open-Meteo returned non-JSON: {exc}") from exc
    if body.get("error"):
        raise WeatherError(f"Open-Meteo error: {body.get('reason')}")
    cur = body.get("current") or {}
    unit = (body.get("current_units") or {}).get("wind_speed_10m")
    if unit and unit != "km/h":
        raise WeatherError(f"unexpected wind unit {unit!r}")
    wind = _f(cur, "wind_speed_10m")
    if wind is None or wind < 0:
        raise WeatherError("Open-Meteo response has no usable wind_speed_10m")
    time = cur.get("time")
    return {
        "id": "current",
        "source": "open-meteo",
        "lat": lat,
        "lng": lng,
        "observedAt": f"{time}:00Z" if time and len(time) == 16 else time,
        "windKmh": wind,
        "windDirDeg": _f(cur, "wind_direction_10m"),
        "gustKmh": _f(cur, "wind_gusts_10m"),
        "tempC": _f(cur, "temperature_2m"),
        "humidityPct": _f(cur, "relative_humidity_2m"),
        "precipMm": _f(cur, "precipitation"),
    }
