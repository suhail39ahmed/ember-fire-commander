"""One push-to-talk session.

Audio and about one camera frame per second are relayed to Gemini Live.
The shared digest is injected when the session opens. A submit_observation
tool call stores one immutable observation from the phone's latest location.
The socket closes about 30 seconds after the reply, on session.stop, or when
a Live-minute cap is reached.
"""
import base64
import json
import logging
from datetime import datetime, timezone

from live.caps import MemoryUsage, MinuteCaps
from live.digest import current_task
from live.notify import notify_observation
from live.seat import parse_signal
from live.store import (
    FirestoreStore,
    MemoryStore,
    observation_from_tool,
    phone_location,
    utc_now_iso,
)

logger = logging.getLogger(__name__)

REPLY_HOLD_SECONDS = 30
FRAME_INTERVAL_SECONDS = 1
AUDIO_GAP_SECONDS = 1

_USAGE = MemoryUsage()


def run_session(user, ws, client=None, store=None, notify=None, usage=None, clock=None, timestamp=None):
    """Relay one accepted socket. client=None opens the real Gemini session on start."""
    if store is None:
        store = FirestoreStore() if _firestore_configured() else MemoryStore()
    caps = MinuteCaps.from_env(usage if usage is not None else _USAGE)
    relay = Relay(
        user=user,
        ws=ws,
        client=client,
        store=store,
        notify=notify or notify_observation,
        caps=caps,
        clock=clock or _monotonic_clock(),
        timestamp=timestamp or utc_now_iso,
    )
    relay.run()


def _firestore_configured():
    import os
    return bool(os.getenv("FIRESTORE_DATABASE", "").strip())


def _monotonic_clock():
    import time
    start = time.monotonic()
    return lambda: time.monotonic() - start


class Relay:
    def __init__(self, user, ws, client, store, notify, caps, clock, timestamp):
        self.user = user
        self.ws = ws
        self.client = client
        self.store = store
        self.notify = notify
        self.caps = caps
        self.clock = clock
        self.timestamp = timestamp
        self.location = None
        self.live = False
        self.reply_at = None
        self.started_at = None
        self.last_audio_at = None
        self.last_frame_at = None
        self.last_frame_clock = None
        self.turn_ended = False
        self.closed_reason = None
        self.last_signal = None

    def run(self):
        while self.closed_reason is None:
            timeout = self._timeout()
            message = self.ws.receive(timeout=timeout)
            if message is None:
                if timeout is None:
                    break
                self._on_timer()
                continue
            self._handle(message)
        self._finish()

    def _timeout(self):
        if not self.live:
            return None
        now = self.clock()
        waits = []
        if self.reply_at is not None:
            waits.append(REPLY_HOLD_SECONDS - (now - self.reply_at))
        elif self.last_audio_at is not None and not self.turn_ended:
            waits.append(AUDIO_GAP_SECONDS - (now - self.last_audio_at))
        if self.started_at is not None:
            waits.append(self.caps.remaining(self.user["id"]) - (now - self.started_at))
        if not waits:
            return None
        return max(0, min(waits))

    def _on_timer(self):
        if self._over_cap():
            self._close("cap_reached")
            return
        if self.reply_at is not None and self.clock() - self.reply_at >= REPLY_HOLD_SECONDS:
            self._close("reply_complete")
            return
        if (
            self.live
            and not self.turn_ended
            and self.last_audio_at is not None
            and self.clock() - self.last_audio_at >= AUDIO_GAP_SECONDS
        ):
            self.turn_ended = True
            self._apply(self.client.end_activity())

    def _over_cap(self):
        if self.started_at is None:
            return not self.caps.allow(self.user["id"])
        return self.clock() - self.started_at >= self.caps.remaining(self.user["id"])

    def _handle(self, raw):
        try:
            message = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            return
        if not isinstance(message, dict):
            return
        kind = message.get("type")
        if kind == "location":
            found = phone_location(message)
            if found is not None:
                self.location = found
            signal = parse_signal(message.get("signal"))
            if signal is not None:
                self.last_signal = signal
                report = getattr(self.store, "report_signal", None)
                if report is not None:
                    report(self.user, signal, self.timestamp())
            return
        if kind == "session.start":
            self._start()
            return
        if not self.live:
            return
        if kind == "audio":
            self._audio(message.get("data"))
        elif kind == "frame":
            self._frame(message)
        elif kind == "session.stop":
            self._close("idle_timeout")

    def _start(self):
        if self.live:
            return
        if not self.caps.allow(self.user["id"]):
            self._close("cap_reached")
            return
        digest = self.store.digest(self.user, self.timestamp())
        client = self._ensure_client()
        client.open(digest)
        self.live = True
        self.started_at = self.clock()
        self._send({"type": "session.ready"})
        self._send({"type": "digest", "digest": digest})

    def _ensure_client(self):
        if self.client is None:
            from live.gemini import GeminiLiveClient
            self.client = GeminiLiveClient()
        return self.client

    def _audio(self, data):
        raw = _b64(data)
        if raw is None:
            return
        self.last_audio_at = self.clock()
        self._apply(self.client.send_audio(raw))

    def _frame(self, message):
        raw = _b64(message.get("data"))
        if raw is None:
            return
        when = _parse_time(message.get("capturedAt"))
        if when is not None:
            if self.last_frame_at is not None and when - self.last_frame_at < FRAME_INTERVAL_SECONDS:
                return
            self.last_frame_at = when
        else:
            now = self.clock()
            if self.last_frame_clock is not None and now - self.last_frame_clock < FRAME_INTERVAL_SECONDS:
                return
            self.last_frame_clock = now
        self._apply(self.client.send_frame(raw))

    def _apply(self, events):
        pending = list(events or [])
        while pending:
            event = pending.pop(0)
            kind = event.get("kind")
            if kind == "audio":
                self._send({"type": "audio", "data": event.get("data")})
                self.reply_at = self.clock()
            elif kind == "turn_complete":
                self.reply_at = self.clock()
            elif kind == "tool":
                result = self._tool(event.get("name"), event.get("args") or {})
                more = self.client.respond_tool(event.get("name"), (event.get("id"), result))
                pending = list(more or []) + pending

    def _tool(self, name, args):
        if name == "submit_observation":
            return self._submit(args)
        if name == "get_common_picture":
            return self.store.digest(self.user, self.timestamp())
        if name == "get_my_task":
            digest = self.store.digest(self.user, self.timestamp())
            return current_task(digest["myTasks"])
        return None

    def _submit(self, args):
        record = observation_from_tool(self.user, self.location, args, self.timestamp())
        if record is None:
            return {"ok": False}
        stored = self.store.create(record)
        if self.notify(stored["id"]):
            self.store.intake_done(stored["id"])
        self._send({"type": "observation.created", "observationId": stored["id"]})
        return {"ok": True, "observationId": stored["id"]}

    def _close(self, reason):
        if self.closed_reason is not None:
            return
        self.closed_reason = reason
        self._send({"type": "session.closed", "reason": reason})
        if self.client is not None and self.live:
            try:
                self.client.close()
            except Exception:
                logger.exception("closing Gemini Live failed")
        close = getattr(self.ws, "close", None)
        if close is not None:
            close()

    def _finish(self):
        if self.started_at is not None:
            self.caps.add(self.user["id"], self.clock() - self.started_at)
        disconnect = getattr(self.store, "holder_disconnect", None)
        if disconnect is not None and self.live:
            try:
                disconnect(self.user, self.timestamp(), self.last_signal)
            except Exception:
                logger.exception("live seat disconnect update failed")
        if self.client is not None and self.live and self.closed_reason is None:
            try:
                self.client.close()
            except Exception:
                logger.exception("closing Gemini Live failed")

    def _send(self, payload):
        self.ws.send(json.dumps(payload))


def _b64(data):
    if not isinstance(data, str) or not data:
        return None
    try:
        return base64.b64decode(data, validate=True)
    except (ValueError, TypeError):
        return None


def _parse_time(value):
    if not isinstance(value, str) or not value:
        return None
    text = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()
