import pytest
from firebase_admin import auth

import identity
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _claims(role="volunteer", uid="uid_sari", name="Sari"):
    claims = {"uid": uid, "name": name}
    if role is not None:
        claims["role"] = role
    return claims


def test_healthz_is_public(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_me_returns_volunteer(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    body = response.get_json()
    assert response.status_code == 200
    assert body == {"id": "uid_sari", "displayName": "Sari", "role": "volunteer"}


def test_me_returns_supervisor(client, monkeypatch):
    monkeypatch.setattr(
        identity,
        "verify_id_token",
        lambda token: _claims(role="supervisor", uid="uid_bpbd", name="Dewi"),
    )
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200
    assert response.get_json()["role"] == "supervisor"


def test_me_missing_token(client):
    response = client.get("/me")
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"


def test_me_invalid_token(client, monkeypatch):
    def reject(token):
        raise auth.InvalidIdTokenError("bad")

    monkeypatch.setattr(identity, "verify_id_token", reject)
    response = client.get("/me", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"


def test_me_expired_token(client, monkeypatch):
    def reject(token):
        raise auth.ExpiredIdTokenError("expired", None)

    monkeypatch.setattr(identity, "verify_id_token", reject)
    response = client.get("/me", headers={"Authorization": "Bearer old"})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"


def test_me_missing_role(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims(role=None))
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "role_missing"


def test_me_ignores_role_in_query_and_body(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims(role="volunteer"))
    response = client.get(
        "/me?role=supervisor",
        headers={"Authorization": "Bearer valid"},
        json={"role": "supervisor"},
    )
    assert response.status_code == 200
    assert response.get_json()["role"] == "volunteer"
