"""Tunable thresholds for the fusion rules, read from the environment."""
import os
from dataclasses import dataclass


def _float(name, default):
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    cluster_radius_m: float = 300.0
    wind_withdraw_kmh: float = 40.0
    # A satellite lead this close to an incident, seen this recently, is listed beside its evidence (it adds no points).
    satellite_radius_m: float = 2000.0
    satellite_window_hours: float = 24.0
    withdraw_instruction: str = "Withdraw upwind. Do not engage."

    @classmethod
    def from_env(cls):
        return cls(
            cluster_radius_m=_float("EMBER_CLUSTER_RADIUS_M", cls.cluster_radius_m),
            wind_withdraw_kmh=_float("EMBER_WIND_WITHDRAW_KMH", cls.wind_withdraw_kmh),
            satellite_radius_m=_float("EMBER_SATELLITE_RADIUS_M", cls.satellite_radius_m),
            satellite_window_hours=_float("EMBER_SATELLITE_WINDOW_H", cls.satellite_window_hours),
        )
