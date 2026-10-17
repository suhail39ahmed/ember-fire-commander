"""Authenticated change notifications; clients re-read their existing scoped API.

No Firestore document content or credentials travel in the event stream.
"""
import queue
import time

from flask import Blueprint, Response, g
from google.cloud.firestore import FieldFilter

from incidents import store

events_bp = Blueprint("withdraw_events", __name__)


@events_bp.get("/withdraw/events")
def events():
    user = dict(g.user)
    query = store.db().collection(store.INCIDENTS)
    if user["role"] == "volunteer":
        query = query.where(filter=FieldFilter("withdraw.volunteerIds", "array_contains", user["id"]))

    def stream():
        changes = queue.Queue(maxsize=1)

        def changed(*_):
            try:
                changes.put_nowait(True)
            except queue.Full:
                pass

        watch = None
        try:
            watch = query.on_snapshot(changed)
            until = time.monotonic() + 50
            while time.monotonic() < until:
                try:
                    changes.get(timeout=10)
                    yield "data: changed\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
        finally:
            if watch:
                watch.unsubscribe()

    return Response(stream(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
