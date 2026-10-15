"""Per-user and per-operation Live-minute caps.

Defaults match the Cloud Run settings LIVE_MINUTE_CAP_USER and LIVE_MINUTE_CAP_OP.
Usage is kept per process, so each Cloud Run instance enforces its own count.
"""
import os
import threading


def cap_minutes(name, default):
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return value if value > 0 else default


class MemoryUsage:
    """Seconds already spent, per user and for the whole operation."""

    def __init__(self):
        self.user_seconds = {}
        self.op_seconds = 0
        self._lock = threading.Lock()

    def seconds_for(self, user_id):
        with self._lock:
            return self.user_seconds.get(user_id, 0)

    def total_seconds(self):
        with self._lock:
            return self.op_seconds

    def add(self, user_id, seconds):
        if seconds <= 0:
            return
        with self._lock:
            self.user_seconds[user_id] = self.user_seconds.get(user_id, 0) + seconds
            self.op_seconds += seconds


class MinuteCaps:
    def __init__(self, usage, user_minutes=None, op_minutes=None):
        self.usage = usage
        self.user_limit = (10 if user_minutes is None else user_minutes) * 60
        self.op_limit = (60 if op_minutes is None else op_minutes) * 60

    @classmethod
    def from_env(cls, usage):
        return cls(
            usage,
            cap_minutes("LIVE_MINUTE_CAP_USER", 10),
            cap_minutes("LIVE_MINUTE_CAP_OP", 60),
        )

    def add(self, user_id, seconds):
        self.usage.add(user_id, seconds)

    def remaining(self, user_id):
        user_left = self.user_limit - self.usage.seconds_for(user_id)
        op_left = self.op_limit - self.usage.total_seconds()
        return max(0, min(user_left, op_left))

    def allow(self, user_id):
        return self.remaining(user_id) > 0
