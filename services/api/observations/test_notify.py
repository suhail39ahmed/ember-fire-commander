import base64
import json
import time
import urllib.error
from datetime import datetime, timezone

import pytest

import identity
from app import app
from observations import notify
from observations.store import MemoryObservationStore, pending_record

CHIP_BODY = {
    "source": "chip",
    "capturedAt": "2026-10-13T08:12:00Z",
    "lat": 1.482,
    "lng": 102.115,
    "accuracyM": 18,
    "chip": "api",
    "text": None,
}
NOW = datetime(2026, 10, 14, 12, 0, 0, tzinfo=timezone.utc)


def _jwt(exp):
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
    return f"header.{payload}.signature"


class _Response:
    def read(self):
        return b""

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class Agents:
    """Stands in for ember-agents: records intake calls and can be switched off."""

    def __init__(self, monkeypatch):
        self.up = True
        self.calls = []
        self.timeouts = []
        monkeypatch.setenv("EMBER_AGENTS_URL", "https://agents.example")
        monkeypatch.setattr("observations.notify._id_token", lambda audience: "tok")
        monkeypatch.setattr("observations.notify.urllib.request.urlopen", self.urlopen)

    def urlopen(self, request, timeout=None):
        self.timeouts.append(timeout)
        observation_id = request.full_url.split("/")[-2]
        if not self.up:
            raise urllib.error.URLError("agents is down")
        self.calls.append(observation_id)
        return _Response()


@pytest.fixture
def agents(monkeypatch):
    return Agents(monkeypatch)


@pytest.fixture
def store(monkeypatch):
    memory = MemoryObservationStore()
    monkeypatch.setattr("observations.routes.get_store", lambda: memory)
    return memory


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    monkeypatch.setattr("observations.validate._now", lambda: NOW)


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
        lambda token: {"uid": "uid_sari", "name": "Sari", "role": "volunteer"},
    )


def _report(client, **extra):
    return client.post("/observations", json=dict(CHIP_BODY, **extra), headers={"Authorization": "Bearer valid"})


# --- the call itself -------------------------------------------------------

def test_the_intake_call_has_a_short_timeout(agents):
    assert notify.notify_observation("obs_1") is True
    assert agents.timeouts == [3]


def test_nothing_to_call_counts_as_delivered(monkeypatch):
    monkeypatch.delenv("EMBER_AGENTS_URL", raising=False)
    assert notify.notify_observation("obs_1") is True


def test_a_failed_call_returns_false_and_is_not_raised(agents):
    agents.up = False
    assert notify.notify_observation("obs_1") is False


def test_after_a_failure_agents_is_not_called_until_the_pause_is_over(agents, monkeypatch):
    agents.up = False
    notify.notify_observation("obs_1")
    agents.up = True
    assert notify.notify_observation("obs_2") is False
    assert agents.calls == []
    monkeypatch.setattr(notify, "_paused_until", 0.0)
    assert notify.notify_observation("obs_2") is True
    assert agents.calls == ["obs_2"]


# --- the ID token ----------------------------------------------------------

def test_id_token_is_fetched_once_per_expiry_window(monkeypatch):
    fetched = []
    monkeypatch.setattr(
        notify, "_fetch_id_token",
        lambda audience: fetched.append(audience) or _jwt(int(time.time()) + 3600),
    )
    first = notify._id_token("https://agents.example")
    second = notify._id_token("https://agents.example")
    assert first == second
    assert fetched == ["https://agents.example"]


def test_id_token_is_fetched_again_shortly_before_it_expires(monkeypatch):
    tokens = iter([_jwt(int(time.time()) + 100), _jwt(int(time.time()) + 3600)])
    monkeypatch.setattr(notify, "_fetch_id_token", lambda audience: next(tokens))
    first = notify._id_token("https://agents.example")
    second = notify._id_token("https://agents.example")
    third = notify._id_token("https://agents.example")
    assert first != second
    assert second == third


def test_each_audience_has_its_own_token(monkeypatch):
    monkeypatch.setattr(
        notify, "_fetch_id_token",
        lambda audience: _jwt(int(time.time()) + 3600) + audience,
    )
    assert notify._id_token("https://a.example") != notify._id_token("https://b.example")


def test_a_token_whose_expiry_cannot_be_read_is_not_reused(monkeypatch):
    fetched = []
    monkeypatch.setattr(notify, "_fetch_id_token", lambda audience: fetched.append(1) or "opaque")
    notify._id_token("https://agents.example")
    notify._id_token("https://agents.example")
    assert len(fetched) == 2


# --- saving a report while agents is down ----------------------------------

def test_report_is_saved_and_queued_when_agents_is_down(client, store, agents):
    agents.up = False
    response = _report(client)
    assert response.status_code == 201
    observation_id = response.get_json()["id"]
    assert list(store.pending) == [observation_id]
    assert store.pending[observation_id]["attempts"] == 1


def test_later_reports_do_not_wait_on_agents_while_it_is_down(client, store, agents):
    agents.up = False
    _report(client)
    attempts_before = len(agents.timeouts)
    for _ in range(3):
        assert _report(client).status_code == 201
    assert len(agents.timeouts) == attempts_before
    assert len(store.pending) == 4


def test_delivered_report_leaves_nothing_queued(client, store, agents):
    response = _report(client)
    assert response.status_code == 201
    assert agents.calls == [response.get_json()["id"]]
    assert store.pending == {}


def test_reports_stored_while_agents_was_down_are_sent_once_it_is_back(client, store, agents, monkeypatch):
    monkeypatch.setattr(notify, "RETRY_AFTER_SECONDS", -60)
    monkeypatch.setattr(notify, "SWEEP_EVERY_SECONDS", 0)
    agents.up = False
    missed = [_report(client).get_json()["id"] for _ in range(2)]
    assert agents.calls == []

    agents.up = True
    monkeypatch.setattr(notify, "_paused_until", 0.0)
    latest = _report(client).get_json()["id"]

    assert sorted(agents.calls) == sorted(missed + [latest])
    assert len(agents.calls) == 3  # one intake call each
    assert store.pending == {}


def test_a_resend_is_limited_to_a_small_batch(client, store, agents, monkeypatch):
    monkeypatch.setattr(notify, "RETRY_AFTER_SECONDS", -60)
    monkeypatch.setattr(notify, "SWEEP_EVERY_SECONDS", 0)
    agents.up = False
    for _ in range(6):
        _report(client)
    agents.up = True
    monkeypatch.setattr(notify, "_paused_until", 0.0)
    _report(client)
    assert len(agents.calls) == 1 + notify.SWEEP_BATCH
    assert len(store.pending) == 6 - notify.SWEEP_BATCH


def test_the_resend_waits_before_trying_the_same_report_again(client, store, agents):
    agents.up = False
    _report(client)
    agents.up = True
    notify._paused_until = 0.0
    _report(client)
    # The first report failed a moment ago, so it is not due yet.
    assert len(agents.calls) == 1
    assert len(store.pending) == 1


def test_the_resend_runs_at_most_every_few_seconds(client, store, agents, monkeypatch):
    monkeypatch.setattr(notify, "RETRY_AFTER_SECONDS", -60)
    agents.up = False
    _report(client)
    agents.up = True
    notify._paused_until = 0.0
    _report(client)  # first sweep: sends the old report
    agents.up = False
    _report(client)
    agents.up = True
    notify._paused_until = 0.0
    calls_before = len(agents.calls)
    _report(client)  # inside the sweep interval: only its own call
    assert len(agents.calls) == calls_before + 1


def test_a_failing_resend_keeps_the_report_queued_and_counts_the_attempt(store, agents, monkeypatch):
    monkeypatch.setattr(notify, "RETRY_AFTER_SECONDS", -60)
    store.pending["obs_1"] = pending_record("obs_1", "2026-10-14T11:00:00.000Z")
    agents.up = False
    notify.resend_pending(store, NOW)
    assert store.pending["obs_1"]["attempts"] == 1
    assert store.pending["obs_1"]["attemptedAt"] == "2026-10-14T12:00:00.000Z"


def test_a_report_is_dropped_from_the_queue_after_too_many_attempts(store, agents, monkeypatch):
    monkeypatch.setattr(notify, "RETRY_AFTER_SECONDS", -60)
    item = pending_record("obs_1", "2026-10-14T11:00:00.000Z")
    item["attempts"] = notify.MAX_ATTEMPTS - 1
    store.pending["obs_1"] = item
    agents.up = False
    notify.resend_pending(store, NOW)
    assert store.pending == {}


def test_an_unexpected_error_in_the_hand_off_does_not_fail_the_report(client, store, monkeypatch):
    def boom(observation_id):
        raise RuntimeError("unexpected")

    monkeypatch.setattr("observations.routes.notify_observation", boom)
    response = _report(client)
    assert response.status_code == 201
    assert response.get_json()["id"] in store.observations
