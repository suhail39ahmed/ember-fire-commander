import asyncio
import base64
import json
from types import SimpleNamespace

from live.caps import MemoryUsage
from live.gemini import GeminiLiveClient, _events_from
from live.transcription import run_transcription
from live.test_shared_transcripts import store, CALL

USER = {"id": "test-user", "role": "volunteer"}


class Client:
    def __init__(self):
        self.opened = False
        self.closed = False
        self.audio = []

    def open(self, context):
        self.opened = True
        assert context == {}

    def close(self):
        self.closed = True

    def _drain(self):
        return []

    def send_audio(self, data):
        self.audio.append(data)
        return [{"kind": "transcript", "text": "Smoke near the road", "finished": False},
                {"kind": "turn_complete"}, {"kind": "audio", "data": "discard"},
                {"kind": "tool", "name": "submit_observation"}]


class Socket:
    def __init__(self, messages):
        self.messages = [json.dumps(message) for message in messages]
        self.sent = []
        self.closed = False
        self.time = 0

    def receive(self, timeout=None):
        self.time += 1.1
        return self.messages.pop(0)

    def send(self, data):
        self.sent.append(json.loads(data))

    def close(self):
        self.closed = True


def test_transcription_relays_input_only_and_never_executes_tools(store):
    client = Client()
    user = {'id': 'v'}
    socket = Socket([{"type": "session.start", 'callId': CALL}, {'type': 'audio.start'}, {"type": "audio", "data": base64.b64encode(b'\x01\x02').decode()}, {"type": "session.stop"}])
    run_transcription(user, socket, client=client, enabled=True, usage=MemoryUsage(), store=store, clock=lambda: socket.time)
    assert client.audio == [b'\x01\x02']
    assert client.closed and socket.closed
    assert [message['type'] for message in socket.sent] == ['session.ready', 'audio.ready', 'transcript.event', 'transcript.event', 'session.closed']
    assert socket.sent[2]['text'] == 'Smoke near the road'
    assert socket.sent[3]['finished'] is True
    assert socket.sent[2]['segmentId'] == socket.sent[3]['segmentId']


def test_disabled_test_does_not_open_gemini():
    client = Client()
    socket = Socket([])
    run_transcription(USER, socket, client=client, enabled=False)
    assert not client.opened
    assert socket.sent == [{"type": "session.closed", "reason": "test_disabled"}]


def test_rejects_invalid_audio_and_closes_resources(store):
    client = Client()
    socket = Socket([{"type": "session.start", 'callId': CALL}, {'type': 'audio.start'}, {"type": "audio", "data": "AA=="}])
    run_transcription({'id': 'v'}, socket, client=client, enabled=True, usage=MemoryUsage(), store=store, clock=lambda: socket.time)
    assert not client.audio
    assert client.closed and socket.closed
    assert socket.sent[-1]['reason'] == 'invalid_audio'


def test_test_has_a_hard_time_limit_and_accounts_usage(store, monkeypatch):
    monkeypatch.setattr('live.transcription.MAX_TEST_SECONDS', 0)
    client = Client()
    socket = Socket([{"type": "session.start", 'callId': CALL}, {'type': 'audio.start'}, {'type': 'session.stop'}])
    usage = MemoryUsage()
    run_transcription({'id': 'v'}, socket, client=client, enabled=True, clock=lambda: socket.time, usage=usage, store=store)
    assert any(message.get('reason') == 'time_limit' for message in socket.sent)
    assert usage.seconds_for('v') >= 0
    assert client.closed


def test_gemini_start_failure_keeps_shared_history_subscription_alive(store):
    class FailingClient(Client):
        def open(self, context):
            raise TimeoutError('Synthetic handshake timeout')
    client = FailingClient()
    socket = Socket([{'type': 'session.start', 'callId': CALL}, {'type': 'audio.start'}, {'type': 'session.stop'}])
    run_transcription({'id': 'v'}, socket, client=client, enabled=True, clock=lambda: socket.time, usage=MemoryUsage(), store=store)
    assert [event['type'] for event in socket.sent] == ['session.ready', 'audio.closed', 'session.closed']
    assert socket.sent[1]['reason'] == 'transcription_unavailable'
    assert socket.sent[-1]['reason'] == 'stopped'
    assert client.closed


def test_extracts_input_transcription_separately_from_model_output():
    message = SimpleNamespace(server_content=SimpleNamespace(input_transcription=SimpleNamespace(text='spoken words', finished=True)))
    assert _events_from(message) == [{"kind": "transcript", "text": "spoken words", "finished": True}]


def test_receive_pump_continues_after_the_first_model_turn():
    class Session:
        count = 0
        async def receive(self):
            self.count += 1
            if self.count > 2:
                raise asyncio.CancelledError()
            yield SimpleNamespace(server_content=SimpleNamespace(input_transcription=SimpleNamespace(text=f'phrase{self.count}', finished=True)))

    client = GeminiLiveClient(transcription_only=True)
    client._session = Session()
    try:
        asyncio.run(client._pump())
    except asyncio.CancelledError:
        pass
    assert [event['text'] for event in client._drain()] == ['phrase1', 'phrase2']


def test_transcription_setup_has_input_transcription_and_no_tools(monkeypatch):
    from google import genai
    captured = {}
    class Connection:
        async def __aenter__(self):
            return SimpleNamespace()
    def connect(**kwargs):
        captured.update(kwargs)
        return Connection()
    monkeypatch.setattr(genai, 'Client', lambda **_: SimpleNamespace(aio=SimpleNamespace(live=SimpleNamespace(connect=connect))))
    client = GeminiLiveClient(transcription_only=True)
    asyncio.run(client._open({}))
    config = captured['config']
    assert config.input_audio_transcription is not None
    assert not config.tools
    assert config.realtime_input_config.automatic_activity_detection.disabled is False
