import json
import logging
from unittest.mock import Mock

import pytest
from firebase_admin import auth as firebase_auth

import auth.upgrade as upgrade
import auth.ticket as ticket_module
from auth.ticket import TicketError
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


class FakeSocket:
    def __init__(self, messages=None, fail_on_receive=False):
        self.messages = list(messages or [])
        self.sent = []
        self.closed = False
        self.fail_on_receive = fail_on_receive

    def send(self, data):
        self.sent.append(data)

    def receive(self, timeout=None):
        if self.fail_on_receive:
            raise AssertionError("rejected upgrade must not read the session")
        if not self.messages:
            return None
        return self.messages.pop(0)

    def close(self, reason=None, message=None):
        self.closed = True


def _headers(token="valid", app_check="fresh"):
    headers = {}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if app_check is not None:
        headers["X-Firebase-AppCheck"] = app_check
    return headers


def _allow_user(monkeypatch, role="volunteer"):
    monkeypatch.setattr(
        upgrade,
        "verify_id_token",
        lambda token: {"uid": "uid_sari", "name": "Sari", "role": role},
    )


def _allow_app_check(monkeypatch):
    monkeypatch.setattr(upgrade.app_check, "verify_token", lambda token: {"sub": "app"})


def _live_session():
    return Mock(side_effect=AssertionError("Gemini session must not start"))


def _reject(monkeypatch, headers):
    live = _live_session()
    ws = FakeSocket(fail_on_receive=True)
    result = upgrade.handle_upgrade(ws, headers, live)
    assert result is None
    assert ws.closed is True
    assert json.loads(ws.sent[0]) == {
        "type": "session.closed",
        "reason": "unauthorized",
    }
    live.assert_not_called()
    return ws


def test_healthz_stays_public(client, monkeypatch):
    def boom(headers):
        raise AssertionError("healthz must not authenticate")

    monkeypatch.setattr(upgrade, "authenticate_upgrade", boom)
    response = client.get("/healthz")
    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "ok"
    assert body["service"] == "voice-gateway"


def test_socket_route_is_registered():
    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert "/" in rules
    assert "/healthz" in rules


def _recording_factory():
    calls = []

    def factory(user, ws):
        calls.append((user, ws.receive()))

    factory.calls = calls
    return factory


def test_accepted_volunteer_upgrade_hands_off_the_socket(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)
    _allow_app_check(monkeypatch)
    factory = _recording_factory()
    ws = FakeSocket(messages=['{"type":"session.start"}', None])
    user = upgrade.handle_upgrade(ws, _headers(), factory)
    assert user["id"] == "uid_sari"
    assert user["displayName"] == "Sari"
    assert user["role"] == "volunteer"
    assert ws.sent == []
    assert ws.closed is False
    assert factory.calls[0][0]["role"] == "volunteer"
    assert factory.calls[0][1] == '{"type":"session.start"}'


def test_accepted_supervisor_upgrade(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch, role="supervisor")
    _allow_app_check(monkeypatch)
    factory = _recording_factory()
    ws = FakeSocket(messages=[None])
    user = upgrade.handle_upgrade(ws, _headers(), factory)
    assert user["role"] == "supervisor"
    assert ws.sent == []
    assert factory.calls[0][0]["role"] == "supervisor"


def test_missing_id_token_closes_before_gemini(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _reject(monkeypatch, _headers(token=None))


def test_non_bearer_token_closes_before_gemini(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _reject(monkeypatch, {"Authorization": "Basic abc", "X-Firebase-AppCheck": "fresh"})


def test_invalid_id_token_closes_before_gemini(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")

    def reject(token):
        raise firebase_auth.InvalidIdTokenError("bad", None)

    monkeypatch.setattr(upgrade, "verify_id_token", reject)
    _reject(monkeypatch, _headers())


def test_expired_id_token_closes_before_gemini(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")

    def reject(token):
        raise firebase_auth.ExpiredIdTokenError("expired", None)

    monkeypatch.setattr(upgrade, "verify_id_token", reject)
    _reject(monkeypatch, _headers())


def test_revoked_id_token_closes_before_gemini(monkeypatch, caplog):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")

    def reject(token):
        raise firebase_auth.RevokedIdTokenError("revoked")

    monkeypatch.setattr(upgrade, "verify_id_token", reject)
    caplog.set_level(logging.INFO, logger="auth.upgrade")
    _reject(monkeypatch, _headers())
    assert "Firebase ID token is revoked" in caplog.text


def test_missing_role_closes_before_gemini(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch, role=None)
    _allow_app_check(monkeypatch)
    _reject(monkeypatch, _headers())


def test_unknown_role_closes_before_gemini(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch, role="admin")
    _allow_app_check(monkeypatch)
    _reject(monkeypatch, _headers())


def test_missing_app_check_rejected_when_enforced(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)
    _reject(monkeypatch, _headers(app_check=None))


def test_invalid_app_check_rejected_when_enforced(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)

    def reject(token):
        raise ValueError("The provided App Check token has an invalid signature.")

    monkeypatch.setattr(upgrade.app_check, "verify_token", reject)
    _reject(monkeypatch, _headers())


def test_expired_app_check_rejected_when_enforced(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)

    def reject(token):
        raise ValueError("The provided App Check token has expired.")

    monkeypatch.setattr(upgrade.app_check, "verify_token", reject)
    _reject(monkeypatch, _headers())


def test_log_only_allows_missing_app_check(monkeypatch, caplog):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "false")
    _allow_user(monkeypatch)
    factory = _recording_factory()
    caplog.set_level(logging.WARNING, logger="auth.upgrade")
    user = upgrade.handle_upgrade(FakeSocket(messages=[None]), _headers(app_check=None), factory)
    assert user["id"] == "uid_sari"
    assert user["role"] == "volunteer"
    assert "App Check not enforced" in caplog.text
    assert factory.calls[0][0]["id"] == "uid_sari"


class _RouteSocket:
    mode = "simple"

    def __init__(self, environ, **kwargs):
        self.sent = []
        self.closed = False
        self.fail_on_receive = False
        _RouteSocket.last = self

    def send(self, data):
        self.sent.append(data)

    def receive(self, timeout=None):
        if self.fail_on_receive:
            raise AssertionError("rejected upgrade must not read the session")
        return None

    def close(self, reason=None, message=None):
        self.closed = True


def _patch_route_socket(monkeypatch, fail_on_receive=False):
    def build(environ, **kwargs):
        socket = _RouteSocket(environ, **kwargs)
        socket.fail_on_receive = fail_on_receive
        return socket

    monkeypatch.setattr("flask_sock.Server", build)


def _run_gateway(headers=None):
    with app.test_request_context("/", headers=headers or {}):
        app.view_functions["gateway"]()


def test_route_rejects_missing_token_before_gemini(monkeypatch):
    def boom(user, ws):
        raise AssertionError("Gemini must not start")

    monkeypatch.setattr("app.start_gemini_session", boom)
    _patch_route_socket(monkeypatch, fail_on_receive=True)
    _run_gateway()
    assert _RouteSocket.last.closed is True
    assert json.loads(_RouteSocket.last.sent[0]) == {
        "type": "session.closed",
        "reason": "unauthorized",
    }


def test_route_accepts_volunteer_without_starting_live(monkeypatch):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    _allow_user(monkeypatch)
    _allow_app_check(monkeypatch)
    _patch_route_socket(monkeypatch)
    _run_gateway(_headers())
    assert _RouteSocket.last.sent == []


def test_log_only_allows_invalid_app_check(monkeypatch, caplog):
    monkeypatch.setenv("APP_CHECK_ENFORCE", "false")
    _allow_user(monkeypatch)

    def reject(token):
        raise ValueError("invalid")

    monkeypatch.setattr(upgrade.app_check, "verify_token", reject)
    factory = _recording_factory()
    caplog.set_level(logging.WARNING, logger="auth.upgrade")
    user = upgrade.handle_upgrade(FakeSocket(messages=[None]), _headers(), factory)
    assert user["role"] == "volunteer"
    assert "App Check token is invalid" in caplog.text
    assert len(factory.calls) == 1


# ---------------------------------------------------------------------------
# Browser ticket path
# ---------------------------------------------------------------------------

def _ticket_headers(ticket="ticket_abc"):
    return {"Sec-WebSocket-Protocol": ticket}


def _allow_ticket(monkeypatch, role="volunteer", uid="uid_sari", name="Sari"):
    user = {"id": uid, "displayName": name, "role": role}
    monkeypatch.setattr(upgrade, "verify_and_consume", lambda tok, db_client=None: user)


def test_browser_ticket_accepted_and_hands_off_socket(monkeypatch):
    _allow_ticket(monkeypatch)
    factory = _recording_factory()
    ws = FakeSocket(messages=['{"type":"session.start"}', None])
    user = upgrade.handle_upgrade(ws, _ticket_headers(), factory)
    assert user["id"] == "uid_sari"
    assert user["role"] == "volunteer"
    assert ws.sent == []
    assert factory.calls[0][0]["role"] == "volunteer"


def test_browser_ticket_supervisor_accepted(monkeypatch):
    _allow_ticket(monkeypatch, role="supervisor", uid="uid_bpbd", name="Dewi")
    factory = _recording_factory()
    ws = FakeSocket(messages=[None])
    user = upgrade.handle_upgrade(ws, _ticket_headers(), factory)
    assert user["role"] == "supervisor"
    assert factory.calls[0][0]["id"] == "uid_bpbd"


def test_invalid_ticket_closes_before_gemini(monkeypatch):
    monkeypatch.setattr(upgrade, "verify_and_consume", lambda tok, db_client=None: (_ for _ in ()).throw(TicketError("expired")))
    _reject(monkeypatch, _ticket_headers())


def test_unknown_ticket_closes_before_gemini(monkeypatch):
    monkeypatch.setattr(upgrade, "verify_and_consume", lambda tok, db_client=None: (_ for _ in ()).throw(TicketError("not found")))
    _reject(monkeypatch, _ticket_headers())


def test_browser_path_does_not_check_app_check_headers(monkeypatch):
    """A browser ticket upgrade succeeds even when no App Check header is sent."""
    _allow_ticket(monkeypatch)
    monkeypatch.setenv("APP_CHECK_ENFORCE", "true")
    app_check_called = []
    monkeypatch.setattr(upgrade, "verify_app_check_token", lambda tok: app_check_called.append(tok))
    factory = _recording_factory()
    upgrade.handle_upgrade(FakeSocket(messages=[None]), _ticket_headers(), factory)
    assert not app_check_called


def test_sec_ws_protocol_takes_first_non_empty_value(monkeypatch):
    tokens = []
    monkeypatch.setattr(upgrade, "verify_and_consume", lambda tok, db_client=None: tokens.append(tok) or {"id": "u", "displayName": "", "role": "volunteer"})
    factory = _recording_factory()
    headers = {"Sec-WebSocket-Protocol": " , tok_first , tok_second"}
    upgrade.handle_upgrade(FakeSocket(messages=[None]), headers, factory)
    assert tokens == ["tok_first"]


def test_route_accepts_browser_ticket(monkeypatch):
    _allow_ticket(monkeypatch)
    _patch_route_socket(monkeypatch)
    _run_gateway(_ticket_headers())
    assert _RouteSocket.last.sent == []


def test_route_rejects_invalid_browser_ticket(monkeypatch):
    monkeypatch.setattr(upgrade, "verify_and_consume", lambda tok, db_client=None: (_ for _ in ()).throw(TicketError("bad")))
    _patch_route_socket(monkeypatch, fail_on_receive=True)
    _run_gateway(_ticket_headers())
    assert _RouteSocket.last.closed is True
    assert json.loads(_RouteSocket.last.sent[0]) == {"type": "session.closed", "reason": "unauthorized"}
