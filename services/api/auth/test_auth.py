import pytest
from firebase_admin import auth as firebase_auth

import identity
from app import app
from auth.middleware import verify_app_check_token


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _allow_user(monkeypatch, role="volunteer"):
    monkeypatch.setattr(
        identity,
        "verify_id_token",
        lambda token: {"uid": "uid_sari", "name": "Sari", "role": role},
    )


def _allow_app_check(monkeypatch):
    monkeypatch.setattr(
        "auth.middleware.app_check.verify_token",
        lambda token: {"sub": "app"},
    )


def test_healthz_stays_public(client):
    response = client.get("/healthz")
    assert response.status_code == 200


def test_protected_route_rejects_missing_id_token_before_handler(client, monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    called = {"me": False}
    original = app.view_functions["me"]

    def wrapped():
        called["me"] = True
        return original()

    app.view_functions["me"] = wrapped
    try:
        response = client.get("/me")
    finally:
        app.view_functions["me"] = original
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"
    assert called["me"] is False


def test_missing_app_check_rejected_when_enforced(client, monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    body = response.get_json()
    assert response.status_code == 401
    assert body["error"]["code"] == "unauthorized"
    assert "App Check" in body["error"]["message"]


def test_expired_id_token(client, monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")

    def reject(token):
        raise firebase_auth.ExpiredIdTokenError("expired", None)

    monkeypatch.setattr(identity, "verify_id_token", reject)
    response = client.get(
        "/me",
        headers={"Authorization": "Bearer old", "X-Firebase-AppCheck": "app"},
    )
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"


def test_expired_app_check_token(client, monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)

    def reject(token):
        raise ValueError("The provided App Check token has expired.")

    monkeypatch.setattr("auth.middleware.app_check.verify_token", reject)
    response = client.get(
        "/me",
        headers={"Authorization": "Bearer valid", "X-Firebase-AppCheck": "old"},
    )
    assert response.status_code == 401
    assert "expired" in response.get_json()["error"]["message"]


def test_valid_tokens_reach_me(client, monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)
    _allow_app_check(monkeypatch)
    response = client.get(
        "/me",
        headers={"Authorization": "Bearer valid", "X-Firebase-AppCheck": "fresh"},
    )
    assert response.status_code == 200
    assert response.get_json()["role"] == "volunteer"


def test_log_only_allows_valid_id_token_without_app_check(client, monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "false")
    _allow_user(monkeypatch)
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200
    assert response.get_json()["id"] == "uid_sari"


def test_invalid_app_check_token(client, monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)

    def reject(token):
        raise ValueError("The provided App Check token has an invalid signature.")

    monkeypatch.setattr("auth.middleware.app_check.verify_token", reject)
    response = client.get(
        "/me",
        headers={"Authorization": "Bearer valid", "X-Firebase-AppCheck": "bad"},
    )
    assert response.status_code == 401
    assert response.get_json()["error"]["message"] == "App Check token is invalid"


def test_verify_app_check_token_rejects_blank():
    with pytest.raises(identity.AuthError) as caught:
        verify_app_check_token("")
    assert caught.value.status == 401
