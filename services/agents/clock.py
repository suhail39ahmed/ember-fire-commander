"""The one UTC timestamp format the agents service writes: 2026-10-14T00:00:00.000Z."""
from datetime import datetime, timezone


def now_iso():
    now = datetime.now(timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.") + f"{now.microsecond // 1000:03d}Z"
