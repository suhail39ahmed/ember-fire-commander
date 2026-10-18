import copy
import contextlib
import hashlib
import json
import threading
from datetime import datetime, timedelta, timezone

import pytest
from simple_websocket import Client, ConnectionClosed
from werkzeug.serving import make_server
from google.cloud import firestore

from live.shared_transcripts import SharedTranscripts, CallAccessError, PublisherBusy

CALL = 'a' * 64
NOW = datetime.now(timezone.utc)
VOLUNTEER = {'id': 'v', 'role': 'volunteer'}
SUPERVISOR = {'id': 's', 'role': 'supervisor'}


class Ref:
    def __init__(self, database, path):
        self.database, self.path = database, path
    def collection(self, name):
        return Query(self.database, self.path + '/' + name)
    def get(self, transaction=None):
        record = copy.deepcopy(self.database.records.get(self.path))
        return type('Snapshot', (), {'to_dict': lambda _: record})()


class Query:
    def __init__(self, database, path):
        self.database, self.path, self.after, self.maximum = database, path, -1, 100
    def document(self, name):
        return Ref(self.database, self.path + '/' + name)
    def where(self, filter):
        self.after = filter.value
        return self
    def order_by(self, name):
        return self
    def limit(self, maximum):
        self.maximum = maximum
        return self
    def stream(self):
        with self.database.lock:
            rows = [(path, value) for path, value in self.database.records.items()
                    if path.startswith(self.path + '/') and value.get('sequence', -1) > self.after]
            return [Ref(self.database, path).get() for path, _ in sorted(rows, key=lambda item: item[1]['sequence'])[:self.maximum]]


class Transaction:
    def __init__(self, database):
        self.database = database
    def create(self, ref, data):
        assert ref.path not in self.database.records
        self.database.records[ref.path] = copy.deepcopy(data)
    def update(self, ref, data):
        self.database.records[ref.path].update(copy.deepcopy(data))


class Database:
    def __init__(self):
        self.lock = threading.RLock()
        self.records = {f'testCalls/{CALL}': {'nextSequence': 0, 'expiresAt': NOW + timedelta(hours=2)}}
        for user in (VOLUNTEER, SUPERVISOR):
            member = hashlib.sha256(user['id'].encode()).hexdigest()
            self.records[f'testCalls/{CALL}/members/{member}'] = {'speakerId': user['id'] + '-speaker', 'speakerName': user['role'].capitalize()}
    def collection(self, name):
        return Query(self, name)
    def transaction(self):
        return Transaction(self)


@pytest.fixture
def store(monkeypatch):
    database = Database()
    def transactional(function):
        def wrapped(transaction):
            with transaction.database.lock:
                return function(transaction)
        return wrapped
    monkeypatch.setattr(firestore, 'transactional', transactional)
    return SharedTranscripts(database, now=lambda: NOW)


def test_membership_is_required_for_reading_and_publishing(store):
    stranger = {'id': 'stranger'}
    with pytest.raises(CallAccessError):
        store.read(CALL, stranger, 0)
    with pytest.raises(CallAccessError):
        store.claim(CALL, stranger, 'owner')
    with pytest.raises(CallAccessError):
        store.authorize('invalid/call', VOLUNTEER)
    store.database.records[f'testCalls/{CALL}']['expiresAt'] = NOW
    with pytest.raises(CallAccessError):
        store.read(CALL, VOLUNTEER, 0)


def test_product_calls_require_acceptance_matching_role_and_live_heartbeats(store):
    database = store.database
    for path, value in list(database.records.items()):
        database.records[path.replace('testCalls/', 'calls/', 1)] = copy.deepcopy(value)
    call = database.records[f'calls/{CALL}']
    call.update(status='requested', createdAt=NOW, acceptedAt=NOW, supervisorId='s', volunteerId='v',
                speakerIds={'s': 's-speaker', 'v': 'v-speaker'}, lastSeen={})
    for user in (VOLUNTEER, SUPERVISOR):
        key = hashlib.sha256(user['id'].encode()).hexdigest()
        database.records[f'calls/{CALL}/members/{key}']['role'] = user['role']
    product = SharedTranscripts(database, now=lambda: NOW, collection='calls')
    with pytest.raises(CallAccessError):
        product.authorize(CALL, VOLUNTEER)
    call['status'] = 'active'
    product.claim(CALL, VOLUNTEER, 'publisher')
    product.append(CALL, VOLUNTEER, 'publisher', 'phrase', 'Shared speech', True)
    assert product.read(CALL, VOLUNTEER, 0) == product.read(CALL, SUPERVISOR, 0)
    with pytest.raises(CallAccessError):
        product.authorize(CALL, {'id': 's', 'role': 'volunteer'})
    product.now = lambda: NOW + timedelta(seconds=61)
    with pytest.raises(CallAccessError):
        product.read(CALL, VOLUNTEER, 0)
    product.now = lambda: NOW
    call['status'] = 'ended'
    with pytest.raises(CallAccessError):
        product.append(CALL, VOLUNTEER, 'publisher', 'late', 'Do not store', True)
    with pytest.raises(CallAccessError):
        product.read(CALL, SUPERVISOR, 0)


def test_publisher_lease_prevents_duplicate_transcription_and_late_writes(store):
    store.claim(CALL, VOLUNTEER, 'first')
    with pytest.raises(PublisherBusy):
        store.claim(CALL, VOLUNTEER, 'second')
    with pytest.raises(CallAccessError):
        store.append(CALL, VOLUNTEER, 'second', 'segment', 'forged', True)
    store.release(CALL, VOLUNTEER, 'second')
    with pytest.raises(PublisherBusy):
        store.claim(CALL, VOLUNTEER, 'second')
    store.release(CALL, VOLUNTEER, 'first')
    store.claim(CALL, VOLUNTEER, 'second')


def test_events_have_one_global_order_and_both_viewers_replay_the_same_history(store):
    store.claim(CALL, VOLUNTEER, 'one')
    store.claim(CALL, SUPERVISOR, 'two')
    first = store.append(CALL, VOLUNTEER, 'one', 'phrase1', 'Hello', False)
    second = store.append(CALL, SUPERVISOR, 'two', 'phrase2', 'I hear you', True)
    third = store.append(CALL, VOLUNTEER, 'one', 'phrase1', 'Hello there', True)
    assert [first['sequence'], second['sequence'], third['sequence']] == [1, 2, 3]
    assert first['speakerId'] == 'v-speaker'
    assert second['speakerId'] == 's-speaker'
    assert first['callId'] == CALL and first['timestamp'].endswith('Z')
    assert store.read(CALL, VOLUNTEER, 0) == store.read(CALL, SUPERVISOR, 0) == [first, second, third]
    assert store.read(CALL, VOLUNTEER, 2) == [third]


def test_simultaneous_speakers_get_unique_sequences(store):
    store.claim(CALL, VOLUNTEER, 'one')
    store.claim(CALL, SUPERVISOR, 'two')
    def write(user, owner):
        for index in range(10):
            store.append(CALL, user, owner, f'{owner}-{index}', str(index), True)
    threads = [threading.Thread(target=write, args=(VOLUNTEER, 'one')), threading.Thread(target=write, args=(SUPERVISOR, 'two'))]
    for thread in threads: thread.start()
    for thread in threads: thread.join()
    assert [event['sequence'] for event in store.read(CALL, SUPERVISOR, 0)] == list(range(1, 21))


def test_two_websocket_viewers_receive_identical_events_without_duplicate_models(store, monkeypatch):
    import auth.upgrade
    import live.transcription
    from app import app
    opened = []
    class Gemini:
        def open(self, context): opened.append(True)
        def _drain(self): return []
        def send_audio(self, audio): return [{'kind': 'transcript', 'text': 'Hello from volunteer', 'finished': True}]
        def close(self): pass
    monkeypatch.setattr(auth.upgrade, 'authenticate_upgrade', lambda headers: {'id': headers.get('X-Test-User')})
    monkeypatch.setattr(live.transcription, 'SharedTranscripts', lambda: store)
    monkeypatch.setattr(live.transcription, 'test_enabled', lambda: True)
    monkeypatch.setattr(live.transcription, 'GeminiLiveClient', lambda **_: Gemini())
    server = make_server('127.0.0.1', 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'ws://127.0.0.1:{server.server_port}/transcription-test'
    sockets = []
    def connect(uid, after=0):
        socket = Client.connect(url, headers={'X-Test-User': uid})
        sockets.append(socket)
        socket.send(json.dumps({'type': 'session.start', 'callId': CALL, 'afterSequence': after}))
        return socket
    def receive(socket, kind):
        while True:
            message = json.loads(socket.receive(timeout=5))
            if message['type'] == kind: return message
    try:
        volunteer, supervisor = connect('v'), connect('s')
        receive(volunteer, 'session.ready'); receive(supervisor, 'session.ready')
        assert not opened  # A viewer does not open Gemini for remote audio.
        volunteer.send(json.dumps({'type': 'audio.start', 'speakerId': 'spoofed'}))
        receive(volunteer, 'audio.ready')
        volunteer.send(json.dumps({'type': 'audio', 'data': 'AQI='}))
        first = receive(volunteer, 'transcript.event')
        assert receive(supervisor, 'transcript.event') == first
        assert first['speakerId'] == 'v-speaker' and first['sequence'] == 1
        duplicate = connect('v'); receive(duplicate, 'session.ready')
        duplicate.send(json.dumps({'type': 'audio.start'}))
        assert receive(duplicate, 'audio.closed')['reason'] == 'publisher_busy'
        assert len(opened) == 1
        replay = connect('s', 0); receive(replay, 'session.ready')
        assert receive(replay, 'transcript.event') == first
        outsider = connect('stranger')
        assert receive(outsider, 'session.closed')['reason'] == 'forbidden'
    finally:
        for socket in sockets:
            with contextlib.suppress(ConnectionClosed): socket.close()
        server.shutdown(); thread.join(timeout=5)
