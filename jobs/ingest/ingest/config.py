"""Settings, read once from the environment."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw not in (None, "") else default


@dataclass(frozen=True)
class Settings:
    project: str = ""
    database: str = "ember-db"
    # FIRMS area query: west,south,east,north. Default covers Sumatra and Kalimantan.
    firms_bbox: str = "95,-6,119,6"
    firms_source: str = "VIIRS_SNPP_NRT"
    firms_days: int = 1
    # Weather point for weather/current. Default is the demo area (docs/demo/scenario-data.json).
    weather_lat: float = -1.849
    weather_lng: float = 110.051
    http_timeout_s: float = 20.0

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            project=os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
            database=os.environ.get("FIRESTORE_DATABASE") or os.environ.get("EMBER_FIRESTORE_DB") or cls.database,
            firms_bbox=os.environ.get("EMBER_FIRMS_BBOX") or cls.firms_bbox,
            firms_source=os.environ.get("EMBER_FIRMS_SOURCE") or cls.firms_source,
            firms_days=int(os.environ.get("EMBER_FIRMS_DAYS") or cls.firms_days),
            weather_lat=_float("EMBER_WEATHER_LAT", cls.weather_lat),
            weather_lng=_float("EMBER_WEATHER_LNG", cls.weather_lng),
            http_timeout_s=_float("EMBER_HTTP_TIMEOUT_S", cls.http_timeout_s),
        )
