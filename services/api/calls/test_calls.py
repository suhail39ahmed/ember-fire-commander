from datetime import timedelta
from pathlib import PurePosixPath
import threading
from types import SimpleNamespace

import jwt
import pytest
import identity
from app import app
from calls import media, routes, service
from incidents import store
from incidents.fake_firestore import FakeFirestore, FakeRef

AUTH = {'Authorization': 'Bearer test'}
SECRET = 'call-test-secret-long-enough-for-hs256-signing'


@pytest.fixture
def environment(monkeypatch):
    database = FakeFirestore()
    monkeypatch.setattr(FakeRef, 'collection', lambda self, name: self._db.collection(f'{self._collection}/{self.id}/{name}'), raising=False)
    monkeypatch.setattr(FakeRef, 'update', lambda self, data: self._db.data[self._collection][self.id].update(data), raising=False)
    monkeypatch.setattr(store, 'db', lambda: database)
    mutex = threading.Lock()
    def transaction(fn):
        with mutex:
            return database.run_transaction(fn)
    monkeypatch.setattr(store, 'run_transaction', transaction)
    for key, value in {'LIVEKIT_URL': 'wss://test.livekit.cloud', 'LIVEKIT_API_KEY': 'test', 'LIVEKIT_API_SECRET': SECRET}.items():
        monkeypatch.setenv(key, value)
    removed = []
    monkeypatch.setattr(media, 'terminate', lambda call: removed.append(call['id']))
    monkeypatch.setattr(routes, 'deliver_message', lambda *args: {'result': 'sent', 'attempts': 1})
    database.add('incidents', 'inc', {'status': 'open', 'observationIds': ['obs']})
    database.add('observations', 'obs', {'volunteerId': 'v'})
    database.add('volunteers', 'v', {'displayName': 'Sari'})
    actor = {'uid': 's', 'role': 'supervisor', 'name': 'Maya'}
    monkeypatch.setattr(identity, 'verify_id_token', lambda token: actor.copy())
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client, database, actor, removed


def create(client):
    response = client.post('/incidents/inc/calls', json={'volunteerId': 'v'}, headers=AUTH)
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def as_volunteer(actor):
    actor.update(uid='v', role='volunteer', name='Sari')


def test_create_call_with_cloud_run_filesystem_layout(environment, monkeypatch):
    client, _, _, _ = environment
    monkeypatch.setattr(media, 'Path', lambda _: SimpleNamespace(resolve=lambda: PurePosixPath('/app/calls/media.py')))
    call = create(client)
    assert call['status'] == 'requested'
    assert call['notification'] == 'sent'
    assert call['joinCode'].startswith('CALL-')


def test_supervisor_invites_target_accepts_and_role_scoped_tokens(environment):
    client, db, actor, removed = environment
    call = create(client)
    call_id = call['id']
    assert call['status'] == 'requested' and call['notification'] == 'sent'
    assert 'room' not in call and 'speakerIds' not in call
    assert client.post(f'/calls/{call_id}/token', headers=AUTH).status_code == 409
    assert client.post(f'/calls/{call_id}/accept', headers=AUTH).status_code == 409
    actor.update(uid='outsider', role='volunteer')
    for action, method in [('', 'get'), ('/token', 'post'), ('/accept', 'post'), ('/end', 'post'), ('/heartbeat', 'post')]:
        assert getattr(client, method)(f'/calls/{call_id}{action}', headers=AUTH).status_code == 403
    as_volunteer(actor)
    assert client.get('/calls/current', headers=AUTH).get_json()['call']['id'] == call_id
    assert client.post(f'/calls/{call_id}/accept', headers=AUTH).get_json()['status'] == 'connecting'
    for uid, role, sources in [('v', 'volunteer', ['microphone', 'camera']), ('s', 'supervisor', ['microphone'])]:
        actor.update(uid=uid, role=role)
        response = client.post(f'/calls/{call_id}/token', headers=AUTH)
        assert response.status_code == 201
        assert response.get_json()['volunteerSpeakerId'] == db.data['calls'][call_id]['speakerIds']['v']
        claims = jwt.decode(response.get_json()['participantToken'], SECRET, algorithms=['HS256'], issuer='test')
        assert claims['video']['canPublishSources'] == sources
        assert claims['video']['room'] == 'ember-call-' + call_id
        assert claims['exp'] - claims['nbf'] <= 61
        assert not claims['video'].get('roomAdmin')
        client.post(f'/calls/{call_id}/heartbeat', json={'connected': True}, headers=AUTH)
    assert client.get(f'/calls/{call_id}', headers=AUTH).get_json()['status'] == 'active'
    ended = client.post(f'/calls/{call_id}/end', headers=AUTH).get_json()
    assert ended['status'] == 'ended' and ended['mediaClosed']
    assert removed == [call_id]
    assert db.data['liveSeats']['inc']['holderId'] is None
    assert client.post(f'/calls/{call_id}/token', headers=AUTH).status_code == 409
    assert client.post(f'/calls/{call_id}/accept', headers=AUTH).status_code == 409


def test_volunteer_cannot_initiate_or_cancel_and_supervisor_cannot_decline(environment):
    client, db, actor, removed = environment
    call_id = create(client)['id']
    assert client.post(f'/calls/{call_id}/end', json={'reason': 'declined'}, headers=AUTH).status_code == 409
    as_volunteer(actor)
    assert client.post('/incidents/inc/calls', json={'volunteerId': 'v'}, headers=AUTH).status_code == 403
    assert client.post(f'/calls/{call_id}/end', json={'reason': 'cancelled'}, headers=AUTH).status_code == 409
    assert client.post(f'/calls/{call_id}/end', json={'reason': 'declined'}, headers=AUTH).get_json()['status'] == 'declined'


def test_duplicate_request_and_duplicate_acceptance_do_not_create_extra_rooms(environment):
    client, db, actor, removed = environment
    call_id = create(client)['id']
    assert client.post('/incidents/inc/calls', json={'volunteerId': 'v'}, headers=AUTH).status_code == 409
    as_volunteer(actor)
    assert client.post(f'/calls/{call_id}/accept', headers=AUTH).status_code == 200
    assert client.post(f'/calls/{call_id}/accept', headers=AUTH).status_code == 409
    assert len(db.data['calls']) == 1


def test_expiry_stale_push_and_lost_connection_release_seat(environment, monkeypatch):
    client, db, actor, removed = environment
    clock = service.now()
    monkeypatch.setattr(service, 'now', lambda: clock)
    call_id = create(client)['id']
    clock += timedelta(seconds=46)
    as_volunteer(actor)
    assert client.post(f'/calls/{call_id}/accept', headers=AUTH).status_code == 409
    assert client.get(f'/calls/{call_id}', headers=AUTH).get_json()['status'] == 'expired'
    assert client.get('/calls/current', headers=AUTH).get_json()['call'] is None
    actor.update(uid='s', role='supervisor')
    next_id = create(client)['id']
    as_volunteer(actor)
    client.post(f'/calls/{next_id}/accept', headers=AUTH)
    clock += timedelta(seconds=61)
    result = client.get(f'/calls/{next_id}', headers=AUTH).get_json()
    assert result['status'] == 'ended' and result['endReason'] == 'connection_lost'
    assert db.data['liveSeats']['inc']['holderId'] is None


def test_push_failure_keeps_in_app_invitation_and_cleanup_retries(environment, monkeypatch):
    client, db, actor, removed = environment
    def fail(*args):
        raise RuntimeError('offline')
    monkeypatch.setattr(routes, 'deliver_message', fail)
    call = create(client)
    assert call['notification'] == 'failed'
    monkeypatch.setattr(media, 'terminate', fail)
    result = client.post(f"/calls/{call['id']}/end", json={'reason': 'cancelled'}, headers=AUTH).get_json()
    assert result['status'] == 'cancelled' and not result['mediaClosed']
    monkeypatch.setattr(media, 'terminate', lambda call: removed.append(call['id']))
    assert client.get(f"/calls/{call['id']}", headers=AUTH).get_json()['mediaClosed']


def test_unauthenticated_unrelated_and_closed_incident_rejected(environment):
    client, db, actor, removed = environment
    assert client.get('/calls/current').status_code == 401
    assert client.post('/incidents/inc/calls', json={'volunteerId': 'other'}, headers=AUTH).status_code == 400
    db.data['incidents']['inc']['status'] = 'extinguished'
    assert client.post('/incidents/inc/calls', json={'volunteerId': 'v'}, headers=AUTH).status_code == 409


def test_stale_end_cannot_release_another_calls_seat(environment):
    client, db, actor, removed = environment
    first = create(client)['id']
    client.post(f'/calls/{first}/end', headers=AUTH)
    second = create(client)['id']
    client.post(f'/calls/{first}/end', headers=AUTH)
    assert db.data['liveSeats']['inc']['callId'] == second


def test_code_allows_other_volunteer_with_real_identity_and_same_room(environment):
    client, db, actor, removed = environment
    call = create(client)
    code, call_id = call['joinCode'], call['id']
    assert client.post('/calls/join-code', json={'code': code}, headers=AUTH).status_code == 403
    assert client.post('/calls/join-code', json={'code': code}).status_code == 401
    actor.update(uid='tester', role='volunteer', name='Test Volunteer')
    joined = client.post('/calls/join-code', json={'code': f' {code.lower()} '}, headers=AUTH)
    assert joined.status_code == 200, joined.get_json()
    result = joined.get_json()
    assert result['id'] == call_id and result['status'] == 'connecting'
    assert result['volunteerId'] == 'tester' and result['volunteerName'] == 'Test Volunteer'
    assert result['requestedVolunteerId'] == 'v'
    assert client.get('/calls/current', headers=AUTH).get_json()['call']['id'] == call_id
    credentials = client.post(f'/calls/{call_id}/token', headers=AUTH).get_json()
    claims = jwt.decode(credentials['participantToken'], SECRET, algorithms=['HS256'])
    member = db.data[f'calls/{call_id}/members'][service.member_key('tester')]
    assert credentials['volunteerSpeakerId'] == member['speakerId']
    assert claims['sub'] == member['speakerId'] and claims['name'] == 'Test Volunteer'
    assert claims['video']['room'] == 'ember-call-' + call_id
    assert set(db.data['calls'][call_id]['speakerIds']) == {'s', 'tester'}
    assert db.data['liveSeats']['inc']['holderId'] == 'tester'
    assert client.post('/calls/join-code', json={'code': code}, headers=AUTH).status_code == 200
    as_volunteer(actor)
    assert client.get('/calls/current', headers=AUTH).get_json()['call'] is None
    assert client.post(f'/calls/{call_id}/token', headers=AUTH).status_code == 403
    assert client.post(f'/calls/{call_id}/accept', headers=AUTH).status_code == 403
    assert client.post('/calls/join-code', json={'code': code}, headers=AUTH).status_code == 409
    actor.update(uid='s', role='supervisor')
    assert client.get(f'/calls/{call_id}', headers=AUTH).get_json()['volunteerId'] == 'tester'
    client.post(f'/calls/{call_id}/end', headers=AUTH)
    actor.update(uid='tester', role='volunteer')
    assert client.post('/calls/join-code', json={'code': code}, headers=AUTH).status_code == 409


def test_code_expiry_invalid_code_and_concurrent_claims(environment, monkeypatch):
    client, db, actor, removed = environment
    from concurrent.futures import ThreadPoolExecutor
    from incidents.errors import ApiError
    call = create(client)
    def claim(uid):
        try:
            return service.join_by_code(call['id'], {'id': uid, 'role': 'volunteer', 'displayName': uid})['volunteerId']
        except ApiError as error:
            return error.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(claim, ['tester1', 'tester2']))
    assert results.count(409) == 1
    winner = next(value for value in results if value != 409)
    assert db.data['calls'][call['id']]['volunteerId'] == winner
    client.post(f"/calls/{call['id']}/end", headers=AUTH)
    next_call = create(client)
    clock = service.now() + timedelta(seconds=46)
    monkeypatch.setattr(service, 'now', lambda: clock)
    actor.update(uid='tester3', role='volunteer')
    assert client.post('/calls/join-code', json={'code': 'bad'}, headers=AUTH).status_code == 400
    assert client.post('/calls/join-code', json={'code': 'CALL-0000-0000'}, headers=AUTH).status_code == 404
    assert client.post('/calls/join-code', json={'code': next_call['joinCode']}, headers=AUTH).status_code == 409
    assert db.data['calls'][next_call['id']]['status'] == 'expired'
