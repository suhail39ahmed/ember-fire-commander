import contextlib
import json
import threading

import pytest
from simple_websocket import Client, ConnectionClosed
from werkzeug.serving import make_server

import app as gateway_app
from app import app


def test_gateway_route_is_a_websocket_route():
    rules = [r for r in app.url_map.iter_rules() if r.rule == "/"]
    assert len(rules) == 1
    assert rules[0].websocket is True


def test_healthz_stays_a_plain_route():
    rules = [r for r in app.url_map.iter_rules() if r.rule == "/healthz"]
    assert len(rules) == 1
    assert rules[0].websocket is False


def test_public_health_alias_returns_the_same_service_status():
    with app.test_client() as client:
        health = client.get('/health')
        assert health.status_code == 200
        assert health.json == client.get('/healthz').json
        assert health.json['service'] == 'voice-gateway'


@pytest.fixture
def live_server():
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"ws://127.0.0.1:{server.server_port}/"
    server.shutdown()
    thread.join(timeout=5)


def test_real_websocket_upgrade_reaches_the_handler_and_echoes_the_subprotocol(live_server, monkeypatch):
    seen = {}

    def fake_handle_upgrade(ws, headers, session_factory):
        seen["protocol"] = headers.get("Sec-WebSocket-Protocol")
        ws.send(json.dumps({"type": "hello"}))
        ws.close()

    monkeypatch.setattr(gateway_app, "handle_upgrade", fake_handle_upgrade)

    client = Client.connect(live_server, subprotocols=["voice-ticket-abc"])
    try:
        assert client.subprotocol == "voice-ticket-abc"
        assert json.loads(client.receive(timeout=5)) == {"type": "hello"}
    finally:
        with contextlib.suppress(ConnectionClosed):
            client.close()
    assert seen["protocol"] == "voice-ticket-abc"


def test_plain_get_on_the_gateway_route_is_not_an_upgrade():
    with app.test_client() as client:
        assert client.get("/").status_code == 400
