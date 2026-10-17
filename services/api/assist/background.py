"""Best-effort model work for a report that was just stored.

A photo report is sent to agents for the advisory photo read (`photo_triage`),
and a report with text is sent for its English translation. Both run on a
background thread after the report is stored, so they never delay or fail it.
A failure is logged and leaves no record; a supervisor can ask again for a
translation from the incident (see routes.py). Set EMBER_ASSIST_BACKGROUND=off
to turn the calls off.

Cloud Run bills CPU only during requests (`cpu_idle = true`), so the thread
may be slowed until the next request reaches the instance.
"""
import logging
import os
import threading

from assist import client

logger = logging.getLogger(__name__)


def enabled():
    return bool(client.agents_url()) and os.getenv("EMBER_ASSIST_BACKGROUND", "").strip().lower() != "off"


def jobs_for(record, uid):
    """The agents calls a stored report needs: [(path, body, timeout)]."""
    observation_id = record["id"]
    jobs = []
    if record.get("source") == "photo" and record.get("photoPath"):
        jobs.append((f"/internal/observations/{observation_id}/triage", {"callerId": uid}, client.TRIAGE_TIMEOUT_SECONDS))
    if isinstance(record.get("text"), str) and record["text"].strip():
        jobs.append((f"/internal/observations/{observation_id}/translate", None, client.ASSIST_TIMEOUT_SECONDS))
    return jobs


def _run(jobs):
    for path, body, timeout in jobs:
        try:
            client.post(path, body, timeout=timeout)
        except Exception:
            logger.warning("assist call %s failed", path, exc_info=True)


def _spawn(fn):
    threading.Thread(target=fn, daemon=True, name="assist-after-store").start()


def after_store(record, uid):
    """Start the model work for a newly stored report. Never raises."""
    try:
        if not enabled():
            return
        jobs = jobs_for(record, uid)
        if jobs:
            _spawn(lambda: _run(jobs))
    except Exception:
        logger.warning("assist hand-off failed for observation %s", record.get("id"), exc_info=True)
