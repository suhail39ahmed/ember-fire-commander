"""Local development calls and private Cloud Run authentication."""
import io
import json

import pytest

from assist import client


@pytest.mark.parametrize("base,local", [
    ("http://localhost:8082", True),
    ("http://127.0.0.1:8082", True),
    ("http://[::1]:8082", True),
    ("https://ember-agents.example.run.app", False),
    ("https://localhost:8082", False),
    ("http://localhost.example.com:8082", False),
    ("http://192.168.1.10:8082", False),
])
def test_agent_calls_authenticate_remote_targets_only(monkeypatch, base, local):
    monkeypatch.setenv("EMBER_AGENTS_URL", base)
    token_calls, requests = [], []
    def token(audience):
        token_calls.append(audience)
        return "service-identity"
    def send(request, timeout):
        requests.append(request)
        return io.BytesIO(b'{"reply":{"en":"Leave now","id":"Pergi sekarang"}}')
    monkeypatch.setattr(client, "cloud_run_token", token)
    monkeypatch.setattr(client.urllib.request, "urlopen", send)
    payload = {"message": "Smoke", "lang": "en", "index": 1}
    result = client.post("/internal/practice", payload)
    assert result["reply"]["en"] == "Leave now"
    assert requests[0].full_url == base + "/internal/practice"
    assert json.loads(requests[0].data) == payload
    assert token_calls == ([] if local else [base])
    assert requests[0].get_header("Authorization") == (None if local else "Bearer service-identity")


def test_missing_agents_url_reports_unavailable(monkeypatch):
    monkeypatch.delenv("EMBER_AGENTS_URL", raising=False)
    with pytest.raises(client.AgentsUnavailable):
        client.post("/internal/practice", {})
