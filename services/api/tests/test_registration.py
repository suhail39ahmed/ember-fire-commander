from types import SimpleNamespace

import pytest

import identity
from app import app
from volunteer_routes import firebase_auth


@pytest.fixture
def registration(monkeypatch):
    claims = {"uid": "new_google_user", "name": "New Volunteer", "firebase": {"sign_in_provider": "google.com"}}
    record = SimpleNamespace(uid="new_google_user", custom_claims={"other": "preserved"}, disabled=False, tokens_valid_after_timestamp=0)
    writes = []
    monkeypatch.setattr(identity, "verify_id_token", lambda token: claims)
    monkeypatch.setattr(firebase_auth, "get_user", lambda uid: record)
    monkeypatch.setattr(firebase_auth, "set_custom_user_claims", lambda uid, value: writes.append((uid, value)))
    with app.test_client() as client:
        yield client, claims, record, writes


def test_google_user_can_opt_in_to_volunteer_registration(registration):
    client, claims, record, writes = registration
    headers = {"Authorization": "Bearer valid"}
    assert client.get("/me", headers=headers).status_code == 403
    response = client.post("/volunteers/register", headers=headers)
    assert response.status_code == 200
    assert response.json["role"] == "volunteer"
    assert response.json["onboardingComplete"] is False
    assert writes == [(record.uid, {"other": "preserved", "role": "volunteer"})]
    claims["role"] = "volunteer"
    record.custom_claims["role"] = "volunteer"
    assert client.post("/volunteers/register", headers=headers).status_code == 200
    assert len(writes) == 1


@pytest.mark.parametrize("token_role,server_role", [("supervisor", "supervisor"), (None, "supervisor"), (None, "unknown")])
def test_registration_never_replaces_an_existing_role(registration, token_role, server_role):
    client, claims, record, writes = registration
    if token_role:
        claims["role"] = token_role
    record.custom_claims["role"] = server_role
    assert client.post("/volunteers/register", headers={"Authorization": "Bearer valid"}).status_code == 403
    assert not writes


def test_registration_requires_google_identity_and_rejects_role_input(registration):
    client, claims, record, writes = registration
    assert client.post("/volunteers/register").status_code == 401
    headers = {"Authorization": "Bearer valid"}
    assert client.post("/volunteers/register", headers=headers, json={"role": "supervisor"}).status_code == 400
    claims["firebase"]["sign_in_provider"] = "password"
    assert client.post("/volunteers/register", headers=headers).status_code == 403
    assert not writes
