import re
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

import identity
from app import app
from incidents import store as incident_store
from voice_ticket import TICKET_TTL_SECONDS, VOICE_TICKETS


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


def _claims(role="volunteer", uid="uid_sari", name="Sari"):
    return {"uid": uid, "name": name, "role": role}


def _auth_headers():
    return {"Authorization": "Bearer valid"}


class FakeCollection:
    def __init__(self):
        self.docs = {}

    def document(self, doc_id):
        ref = MagicMock()
        ref.id = doc_id

        def _set(data):
            self.docs[doc_id] = data

        ref.set.side_effect = _set
        return ref


class FakeStore:
    def __init__(self):
        self._collections = {}

    def collection(self, name):
        self._collections.setdefault(name, FakeCollection())
        return self._collections[name]


def _setup_fake_store(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(incident_store, "_client", store)
    return store


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_volunteer_gets_a_ticket(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims())
    store = _setup_fake_store(monkeypatch)
    response = client.post("/voice/ticket", headers=_auth_headers())
    assert response.status_code == 201
    body = response.get_json()
    assert "ticket" in body and isinstance(body["ticket"], str) and len(body["ticket"]) > 20
    assert "expiresAt" in body and body["expiresAt"].endswith("Z")
    assert VOICE_TICKETS in store._collections
    docs = store._collections[VOICE_TICKETS].docs
    assert len(docs) == 1
    ticket_str = body["ticket"]
    assert ticket_str in docs
    record = docs[ticket_str]
    assert record["uid"] == "uid_sari"
    assert record["role"] == "volunteer"
    assert record["consumed"] is False


def test_supervisor_gets_a_ticket(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims(role="supervisor", uid="uid_bpbd", name="Dewi"))
    store = _setup_fake_store(monkeypatch)
    response = client.post("/voice/ticket", headers=_auth_headers())
    assert response.status_code == 201
    body = response.get_json()
    assert body["ticket"]
    docs = store._collections[VOICE_TICKETS].docs
    record = list(docs.values())[0]
    assert record["role"] == "supervisor"
    assert record["uid"] == "uid_bpbd"


def test_ticket_includes_display_name(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims(name="Sari Putri"))
    store = _setup_fake_store(monkeypatch)
    client.post("/voice/ticket", headers=_auth_headers())
    record = list(store._collections[VOICE_TICKETS].docs.values())[0]
    assert record["displayName"] == "Sari Putri"


def test_ticket_expiry_is_sixty_seconds_from_now(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims())
    store = _setup_fake_store(monkeypatch)
    before = datetime.now(timezone.utc)
    client.post("/voice/ticket", headers=_auth_headers())
    after = datetime.now(timezone.utc)
    record = list(store._collections[VOICE_TICKETS].docs.values())[0]
    expires_at = datetime.fromisoformat(record["expiresAt"].replace("Z", "+00:00"))
    # The stored time is truncated to milliseconds; allow ±1 ms of rounding.
    low = before + timedelta(seconds=TICKET_TTL_SECONDS) - timedelta(milliseconds=1)
    high = after + timedelta(seconds=TICKET_TTL_SECONDS + 1)
    assert low <= expires_at <= high


def test_each_call_produces_a_unique_ticket(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims())
    store = _setup_fake_store(monkeypatch)
    r1 = client.post("/voice/ticket", headers=_auth_headers()).get_json()
    r2 = client.post("/voice/ticket", headers=_auth_headers()).get_json()
    assert r1["ticket"] != r2["ticket"]


def test_ticket_is_url_safe_base64(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims())
    _setup_fake_store(monkeypatch)
    body = client.post("/voice/ticket", headers=_auth_headers()).get_json()
    assert re.match(r'^[A-Za-z0-9_-]+$', body["ticket"])


# ---------------------------------------------------------------------------
# Auth enforcement — ticket route follows the same rules as other protected routes
# ---------------------------------------------------------------------------

def test_unauthenticated_request_is_401(client):
    response = client.post("/voice/ticket")
    assert response.status_code == 401


def test_missing_role_is_403(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims(role=None))
    response = client.post("/voice/ticket", headers=_auth_headers())
    assert response.status_code == 403


def test_unknown_role_is_403(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims(role="admin"))
    response = client.post("/voice/ticket", headers=_auth_headers())
    assert response.status_code == 403


def test_get_not_accepted(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda t: _claims())
    response = client.get("/voice/ticket", headers=_auth_headers())
    assert response.status_code == 405
