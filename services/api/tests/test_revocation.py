import time
import types

import pytest
from firebase_admin import auth, exceptions

import identity
from app import app

IAT = 1_760_000_000  # seconds


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def signed_in(monkeypatch):
    monkeypatch.setattr(
        identity,
        "verify_id_token",
        lambda token: {"uid": "uid_sari", "name": "Sari", "role": "volunteer", "iat": IAT},
    )


def _user(disabled=False, valid_after_ms=0):
    return types.SimpleNamespace(disabled=disabled, tokens_valid_after_timestamp=valid_after_ms)


def _lookup(monkeypatch, result):
    calls = []

    def get_user(uid):
        calls.append(uid)
        if isinstance(result, Exception):
            raise result
        if callable(result):
            return result()
        return result

    monkeypatch.setattr(identity.auth, "get_user", get_user)
    return calls


def _write(client):
    # An empty body fails validation with 400, so a 400 means the request got past sign-in.
    return client.post("/observations", json={}, headers={"Authorization": "Bearer valid"})


def test_revoked_token_gets_401_on_a_write(client, monkeypatch):
    _lookup(monkeypatch, _user(valid_after_ms=(IAT + 60) * 1000))
    response = _write(client)
    assert response.status_code == 401
    assert response.get_json()["error"] == {
        "code": "unauthorized",
        "message": "Firebase ID token is revoked",
    }


def test_token_issued_after_the_revocation_is_accepted(client, monkeypatch):
    _lookup(monkeypatch, _user(valid_after_ms=(IAT - 60) * 1000))
    assert _write(client).status_code == 400


def test_token_issued_in_the_same_second_as_the_revocation_is_accepted(client, monkeypatch):
    _lookup(monkeypatch, _user(valid_after_ms=IAT * 1000))
    assert _write(client).status_code == 400


def test_disabled_user_gets_401(client, monkeypatch):
    _lookup(monkeypatch, _user(disabled=True))
    response = _write(client)
    assert response.status_code == 401
    assert response.get_json()["error"]["message"] == "Firebase user is disabled"


def test_deleted_user_gets_401(client, monkeypatch):
    _lookup(monkeypatch, auth.UserNotFoundError("gone"))
    response = _write(client)
    assert response.status_code == 401
    assert response.get_json()["error"]["message"] == "Firebase user no longer exists"


def test_reads_do_not_look_the_user_up(client, monkeypatch):
    calls = _lookup(monkeypatch, _user(valid_after_ms=(IAT + 60) * 1000))
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200
    assert calls == []


@pytest.mark.parametrize("failure", [
    RuntimeError("network down"),
    ConnectionError("reset"),
    exceptions.PermissionDeniedError("missing role"),
])
def test_a_failed_lookup_does_not_block_the_write(client, monkeypatch, failure):
    _lookup(monkeypatch, failure)
    assert _write(client).status_code == 400


def test_failed_lookup_is_paused_so_the_next_writes_skip_it(client, monkeypatch):
    calls = _lookup(monkeypatch, RuntimeError("network down"))
    assert _write(client).status_code == 400
    assert _write(client).status_code == 400
    assert len(calls) == 1


def test_lookup_resumes_after_the_pause(client, monkeypatch):
    calls = _lookup(monkeypatch, RuntimeError("network down"))
    _write(client)
    monkeypatch.setattr(identity, "_paused_until", 0.0)
    _lookup_calls = _lookup(monkeypatch, _user(valid_after_ms=(IAT + 60) * 1000))
    assert _write(client).status_code == 401
    assert len(calls) == 1 and len(_lookup_calls) == 1


def test_slow_lookup_is_given_up_on(client, monkeypatch):
    monkeypatch.setattr(identity, "REVOCATION_TIMEOUT_SECONDS", 0.05)

    def slow():
        time.sleep(0.4)
        return _user(valid_after_ms=(IAT + 60) * 1000)

    _lookup(monkeypatch, slow)
    started = time.monotonic()
    assert _write(client).status_code == 400
    assert time.monotonic() - started < 0.3


def test_revoked_error_from_the_sdk_is_reported_as_revoked(client, monkeypatch):
    def revoked(token):
        raise auth.RevokedIdTokenError("revoked")

    monkeypatch.setattr(identity, "verify_id_token", revoked)
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 401
    assert response.get_json()["error"]["message"] == "Firebase ID token is revoked"
