from datetime import datetime, timezone
import hashlib

import jwt
import pytest

import identity
import livekit_test
from app import app

SECRET = "test-only-livekit-secret-at-least-32-characters"
HEADERS = {"Authorization": "Bearer test"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("EMBER_LIVEKIT_TEST_ENABLED", "true")
    monkeypatch.setenv("LIVEKIT_URL", "wss://test.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", "test-api-key")
    monkeypatch.setenv("LIVEKIT_API_SECRET", SECRET)
    monkeypatch.setattr(livekit_test, "dotenv_values", lambda _: {})
    monkeypatch.setattr(livekit_test, 'register_call', lambda room, user, speaker: hashlib.sha256(room.encode()).hexdigest())
    monkeypatch.setattr(identity, "verify_id_token", lambda _: {"uid": "firebase-uid", "role": "volunteer"})
    monkeypatch.setattr(identity, "check_not_revoked", lambda _: None)
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.mark.parametrize("role", ["volunteer", "supervisor"])
def test_both_roles_get_room_scoped_two_way_media_tokens(client, monkeypatch, role):
    monkeypatch.setattr(identity, "verify_id_token", lambda _: {"uid": "firebase-uid", "role": role})
    before = datetime.now(timezone.utc).timestamp()
    response = client.post("/livekit/test-token", json={"roomCode": "Test-12345", "role": "admin", "identity": "spoofed"}, headers=HEADERS)
    assert response.status_code == 201
    assert response.headers["Cache-Control"] == "no-store"
    body = response.get_json()
    assert body["serverUrl"] == "wss://test.livekit.cloud"
    assert body['callId'] == hashlib.sha256(b'ember-test-test-12345').hexdigest()
    assert SECRET not in response.get_data(as_text=True)
    claims = jwt.decode(body["participantToken"], SECRET, algorithms=["HS256"], issuer="test-api-key")
    assert claims["name"] == role.capitalize()
    assert claims["sub"] not in ("firebase-uid", "spoofed")
    assert body['speakerId'] == claims['sub']
    assert before + 295 <= claims["exp"] <= before + 305
    grant = claims["video"]
    assert grant["room"] == "ember-test-test-12345"
    assert grant["roomJoin"] is True
    assert grant["canPublish"] is True
    assert grant["canSubscribe"] is True
    assert grant["canPublishData"] is False
    assert grant["canPublishSources"] == ["camera", "microphone"]
    assert not grant.get("roomAdmin")
    assert not grant.get("roomCreate")


def test_requires_authentication(client):
    assert client.post("/livekit/test-token", json={"roomCode": "test-12345"}).status_code == 401


def test_rejects_other_roles(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda _: {"uid": "uid", "role": "admin"})
    assert client.post("/livekit/test-token", json={"roomCode": "test-12345"}, headers=HEADERS).status_code == 403


@pytest.mark.parametrize("value", [None, [], {}, {"roomCode": "short"}, {"roomCode": "test/../room"}, {"roomCode": "a" * 49}, {"roomCode": 123}])
def test_rejects_invalid_room_codes(client, value):
    assert client.post("/livekit/test-token", json=value, headers=HEADERS).status_code == 400


def test_disabled_by_default(client, monkeypatch):
    monkeypatch.delenv("EMBER_LIVEKIT_TEST_ENABLED")
    assert client.post("/livekit/test-token", json={"roomCode": "test-12345"}, headers=HEADERS).status_code == 404


@pytest.mark.parametrize("key,value", [("LIVEKIT_API_SECRET", ""), ("LIVEKIT_API_KEY", ""), ("LIVEKIT_URL", "https://test.livekit.cloud")])
def test_incomplete_server_config_returns_actionable_error(client, monkeypatch, key, value):
    monkeypatch.setenv(key, value)
    response = client.post("/livekit/test-token", json={"roomCode": "test-12345"}, headers=HEADERS)
    assert response.status_code == 503
    assert "Configure LIVEKIT_URL" in response.get_json()["error"]["message"]


def test_can_read_staging_keys_from_root_dotenv(client, monkeypatch):
    settings = {"EMBER_LIVEKIT_TEST_ENABLED": "true", "LIVEKIT_URL": "wss://staging.livekit.cloud", "LIVEKIT_API_KEY": "staging", "LIVEKIT_API_SECRET": SECRET}
    for key in settings:
        monkeypatch.delenv(key)
    monkeypatch.setattr(livekit_test, "dotenv_values", lambda _: settings)
    response = client.post("/livekit/test-token", json={"roomCode": "test-12345"}, headers=HEADERS)
    assert response.status_code == 201
    assert response.get_json()["serverUrl"] == settings["LIVEKIT_URL"]


def test_injected_environment_wins_over_dotenv(client, monkeypatch):
    monkeypatch.setattr(livekit_test, "dotenv_values", lambda _: {"EMBER_LIVEKIT_TEST_ENABLED": "false", "LIVEKIT_API_SECRET": "wrong"})
    response = client.post("/livekit/test-token", json={"roomCode": "test-12345"}, headers=HEADERS)
    assert response.status_code == 201
    jwt.decode(response.get_json()["participantToken"], SECRET, algorithms=["HS256"])


def test_registers_authenticated_membership_and_ignores_claimed_speaker(client, monkeypatch):
    seen = []
    monkeypatch.setattr(livekit_test, 'register_call', lambda room, user, speaker: seen.append((room, user, speaker)) or 'call')
    response = client.post('/livekit/test-token', json={'roomCode': 'test-12345', 'speakerId': 'forged'}, headers=HEADERS)
    assert response.status_code == 201
    assert seen[0][0] == 'ember-test-test-12345'
    assert seen[0][1]['id'] == 'firebase-uid'
    assert seen[0][2] == response.get_json()['speakerId'] != 'forged'


def test_expired_call_requires_a_new_code(client, monkeypatch):
    def expired(*args):
        raise ValueError('This test call has expired. Start with a new test code.')
    monkeypatch.setattr(livekit_test, 'register_call', expired)
    assert client.post('/livekit/test-token', json={'roomCode': 'test-12345'}, headers=HEADERS).status_code == 409
