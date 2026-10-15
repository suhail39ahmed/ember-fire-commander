import base64
import json

from live.caps import MemoryUsage
from live.digest import current_task, digest_for
from live.gemini import ScriptedLive
from live.session import run_session
from live.store import MemoryStore

USER = {"id": "uid_sari", "displayName": "Sari", "role": "volunteer"}
AUDIO = base64.b64encode(b"\x01\x02").decode("ascii")
FRAME = base64.b64encode(b"\xff\xd8\xff").decode("ascii")
REPLY = base64.b64encode(b"reply-audio").decode("ascii")


class Clock:
    def __init__(self):
        self.t = 0

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += seconds


class Socket:
    def __init__(self, messages, clock):
        self.messages = list(messages)
        self.clock = clock
        self.sent = []
        self.closed = False

    def send(self, data):
        self.sent.append(json.loads(data))

    def receive(self, timeout=None):
        if self.messages:
            return self.messages.pop(0)
        if timeout is None:
            return None
        self.clock.advance(timeout)
        return None

    def close(self, reason=None, message=None):
        self.closed = True


def _msg(payload):
    return json.dumps(payload)


def _run(messages, store=None, client=None, usage=None, notify=None, monkeypatch=None):
    clock = Clock()
    socket = Socket(messages, clock)
    store = store or MemoryStore()
    notified = []

    def default_notify(observation_id):
        notified.append(observation_id)
        return True

    run_session(
        USER,
        socket,
        client=client or ScriptedLive(),
        store=store,
        notify=notify or default_notify,
        usage=usage if usage is not None else MemoryUsage(),
        clock=clock,
        timestamp=lambda: "2026-10-15T08:00:00Z",
    )
    return socket, store, notified, clock


def test_press_to_talk_writes_phone_gps_and_closes_after_the_reply():
    store = MemoryStore()
    store.observations.append({"id": "obs_old", "volunteerId": "uid_sari"})
    store.incidents.append({
        "id": "inc_01",
        "name": "Canal",
        "area": "Ketapang",
        "status": "open",
        "severity": "smoke",
        "withdraw": None,
        "lat": 1.4,
        "lng": 102.1,
        "observationIds": ["obs_old"],
    })
    live = ScriptedLive(script=[[
        {
            "kind": "tool",
            "name": "submit_observation",
            "id": "c1",
            "args": {"severity": "small_flame", "text": "Api kecil", "lat": 9, "lng": 9},
        },
        {"kind": "audio", "data": REPLY},
        {"kind": "turn_complete"},
    ]])
    socket, store, notified, clock = _run([
        _msg({"type": "session.start"}),
        _msg({
            "type": "location",
            "lat": 1.482,
            "lng": 102.115,
            "accuracyM": 18,
            "capturedAt": "2026-10-13T08:12:00Z",
        }),
        _msg({"type": "audio", "data": AUDIO}),
        _msg({"type": "frame", "data": FRAME, "capturedAt": "2026-10-13T08:12:00Z"}),
        _msg({"type": "frame", "data": FRAME, "capturedAt": "2026-10-13T08:12:00.400Z"}),
        _msg({"type": "frame", "data": FRAME, "capturedAt": "2026-10-13T08:12:01.400Z"}),
    ], store=store, client=live)

    assert live.manual is True
    assert live.activity == ["start", "end"]
    assert live.context["incidents"][0]["id"] == "inc_01"
    assert live.audio == [b"\x01\x02"]
    assert len(live.frames) == 2
    stored = [item for item in store.observations if item.get("source") == "live"]
    assert len(stored) == 1
    assert stored[0]["lat"] == 1.482
    assert stored[0]["lng"] == 102.115
    assert stored[0]["severity"] == "small_flame"
    assert stored[0]["text"] == "Api kecil"
    assert stored[0]["immutable"] is True
    assert stored[0]["chip"] is None
    assert notified == [stored[0]["id"]]
    assert stored[0]["id"] not in store.pending
    kinds = [item["type"] for item in socket.sent]
    assert kinds[:2] == ["session.ready", "digest"]
    assert "observation.created" in kinds
    assert {"type": "audio", "data": REPLY} in socket.sent
    assert socket.sent[-1] == {"type": "session.closed", "reason": "reply_complete"}
    assert clock.t >= 30


def test_no_location_does_not_write_or_notify():
    live = ScriptedLive(script=[[
        {"kind": "tool", "name": "submit_observation", "id": "c1", "args": {"severity": "smoke", "text": "Asap"}},
        {"kind": "turn_complete"},
    ]])
    notified = []
    socket, store, _, _ = _run([
        _msg({"type": "session.start"}),
        _msg({"type": "audio", "data": AUDIO}),
    ], client=live, notify=lambda observation_id: notified.append(observation_id) or False)
    assert store.observations == []
    assert notified == []
    assert live.tools[0][1][1] == {"ok": False}
    assert socket.sent[-1]["reason"] == "reply_complete"


def test_cap_reached_does_not_open_gemini():
    usage = MemoryUsage()
    usage.user_seconds["uid_sari"] = 10 * 60
    live = ScriptedLive()
    socket, _, _, _ = _run([
        _msg({"type": "session.start"}),
        _msg({"type": "session.start"}),
    ], client=live, usage=usage)
    assert live.opened is False
    assert socket.sent == [{"type": "session.closed", "reason": "cap_reached"}]
    assert socket.messages == [_msg({"type": "session.start"})]


def test_operation_cap_stops_the_session(monkeypatch):
    monkeypatch.setenv("LIVE_MINUTE_CAP_OP", "0.01")
    live = ScriptedLive(script=[[{"kind": "turn_complete"}]])
    usage = MemoryUsage()
    socket, _, _, clock = _run([
        _msg({"type": "session.start"}),
        _msg({"type": "audio", "data": AUDIO}),
    ], client=live, usage=usage)
    assert live.activity == ["start"]
    assert live.closed is True
    assert socket.sent[-1] == {"type": "session.closed", "reason": "cap_reached"}
    assert clock.t >= 0.6
    assert usage.total_seconds() >= 0.6


def test_reconnect_after_cap_does_not_open_gemini(monkeypatch):
    monkeypatch.setenv("LIVE_MINUTE_CAP_USER", "0.01")
    usage = MemoryUsage()
    _run([
        _msg({"type": "session.start"}),
        _msg({"type": "audio", "data": AUDIO}),
    ], client=ScriptedLive(), usage=usage)
    second = ScriptedLive()
    socket, _, _, _ = _run([_msg({"type": "session.start"})], client=second, usage=usage)
    assert second.opened is False
    assert socket.sent == [{"type": "session.closed", "reason": "cap_reached"}]


def test_session_stop_closes_without_waiting_for_a_reply():
    live = ScriptedLive()
    socket, _, _, _ = _run([
        _msg({"type": "session.start"}),
        _msg({"type": "audio", "data": AUDIO}),
        _msg({"type": "session.stop"}),
    ], client=live)
    assert live.activity == ["start"]
    assert socket.sent[-1] == {"type": "session.closed", "reason": "idle_timeout"}


def test_get_my_task_prefers_withdraw():
    store = MemoryStore()
    store.tasks.extend([
        {
            "id": "task_i",
            "incidentId": "inc_01",
            "volunteerId": "uid_sari",
            "type": "investigate",
            "status": "approved",
            "instruction": "Look",
        },
        {
            "id": "task_w",
            "incidentId": "inc_01",
            "volunteerId": "uid_sari",
            "type": "withdraw",
            "status": "approved",
            "instruction": "Withdraw upwind.",
        },
    ])
    live = ScriptedLive(script=[[
        {"kind": "tool", "name": "get_my_task", "id": "t1", "args": {}},
        {"kind": "turn_complete"},
    ]])
    _run([
        _msg({"type": "session.start"}),
        _msg({"type": "audio", "data": AUDIO}),
    ], store=store, client=live)
    assert live.tools[0][1][1]["type"] == "withdraw"
    assert live.tools[0][1][1]["instruction"] == "Withdraw upwind."


def test_failed_notify_keeps_the_observation_pending():
    live = ScriptedLive(script=[[
        {"kind": "tool", "name": "submit_observation", "id": "c1", "args": {"severity": "smoke"}},
        {"kind": "turn_complete"},
    ]])
    socket, store, _, _ = _run([
        _msg({"type": "session.start"}),
        _msg({
            "type": "location",
            "lat": 1.482,
            "lng": 102.115,
            "accuracyM": 12,
            "capturedAt": "2026-10-13T08:12:00Z",
        }),
        _msg({"type": "audio", "data": AUDIO}),
    ], client=live, notify=lambda observation_id: False)
    assert len(store.observations) == 1
    assert store.pending
    assert any(item["type"] == "observation.created" for item in socket.sent)


def test_supervisor_digest_has_no_tasks():
    body = digest_for(
        {"id": "uid_maya", "role": "supervisor"},
        [{"id": "inc_01", "status": "open", "name": "Canal"}],
        [{"id": "task_w", "volunteerId": "uid_sari", "status": "approved", "type": "withdraw"}],
        [],
        "2026-10-15T08:00:00Z",
    )
    assert body["myTasks"] == []
    assert body["incidents"][0]["id"] == "inc_01"
    assert current_task([]) is None
