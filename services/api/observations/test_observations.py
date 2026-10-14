import pytest

import identity
from app import app
from observations.notify import notify_observation
from observations.store import MemoryObservationStore

CHIP_BODY = {
    "source": "chip",
    "capturedAt": "2026-10-13T08:12:00Z",
    "lat": 1.482,
    "lng": 102.115,
    "accuracyM": 18,
    "chip": "api",
    "text": None,
}


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def store(monkeypatch):
    memory = MemoryObservationStore()
    monkeypatch.setattr("observations.routes.get_store", lambda: memory)
    return memory


@pytest.fixture
def signed_in(monkeypatch):
    monkeypatch.setattr(
        identity,
        "verify_id_token",
        lambda token: {"uid": "uid_sari", "name": "Sari", "role": "volunteer"},
    )


def _post(client, body, headers=None):
    return client.post(
        "/observations",
        json=body,
        headers=headers or {"Authorization": "Bearer valid"},
    )


def test_chip_observation_is_stored_and_read_back(client, store, signed_in):
    response = _post(client, CHIP_BODY)
    body = response.get_json()
    assert response.status_code == 201
    assert body["volunteerId"] == "uid_sari"
    assert body["source"] == "chip"
    assert body["chip"] == "api"
    assert body["text"] is None
    assert body["severity"] == "small_flame"
    assert body["photoPath"] is None
    assert body["immutable"] is True
    assert body["capturedAt"] == "2026-10-13T08:12:00Z"
    assert body["receivedAt"].endswith("Z")
    assert store.get(body["id"]) == body
    assert store.audits[0]["action"] == "observation.create"
    assert store.audits[0]["actorId"] == "uid_sari"
    assert store.audits[0]["targetId"] == body["id"]


def test_chip_with_optional_note(client, store, signed_in):
    body = dict(CHIP_BODY, text="  Past the west ditch.  ")
    response = _post(client, body)
    stored = response.get_json()
    assert response.status_code == 201
    assert stored["text"] == "Past the west ditch."
    assert stored["severity"] == "small_flame"
    assert store.get(stored["id"])["text"] == "Past the west ditch."


def test_text_observation(client, store, signed_in):
    response = _post(client, {
        "source": "text",
        "capturedAt": "2026-10-13T08:14:00Z",
        "lat": 1.482,
        "lng": 102.115,
        "accuracyM": 18,
        "chip": None,
        "text": "  Asap tipis di tepi kanal  ",
    })
    stored = response.get_json()
    assert response.status_code == 201
    assert stored["source"] == "text"
    assert stored["chip"] is None
    assert stored["text"] == "Asap tipis di tepi kanal"
    assert stored["severity"] == "unknown"
    assert store.get(stored["id"]) == stored


@pytest.mark.parametrize("chip,severity", [
    ("asap", "smoke"),
    ("api", "small_flame"),
    ("aman", "none"),
    ("butuh_bantuan", "unknown"),
])
def test_chip_severity_is_server_mapped(client, store, signed_in, chip, severity):
    response = _post(client, dict(CHIP_BODY, chip=chip, severity="large_flame"))
    stored = response.get_json()
    assert response.status_code == 201
    assert stored["severity"] == severity
    assert store.get(stored["id"])["severity"] == severity


def test_retry_creates_a_new_observation(client, store, signed_in):
    first = _post(client, CHIP_BODY).get_json()
    second = _post(client, CHIP_BODY).get_json()
    assert first["id"] != second["id"]
    assert store.get(first["id"])["immutable"] is True
    assert store.get(second["id"])["immutable"] is True


def test_volunteer_id_comes_from_the_token(client, store, signed_in):
    response = _post(client, dict(CHIP_BODY, volunteerId="uid_other"))
    assert response.status_code == 201
    assert response.get_json()["volunteerId"] == "uid_sari"


def test_unknown_chip(client, store, signed_in):
    response = _post(client, dict(CHIP_BODY, chip="fire"))
    body = response.get_json()
    assert response.status_code == 400
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["fields"]["chip"] == "use asap, api, aman, or butuh_bantuan"
    assert store.observations == {}


def test_text_report_rejects_a_chip(client, store, signed_in):
    response = _post(client, dict(CHIP_BODY, source="text", chip="api", text="note"))
    assert response.status_code == 400
    assert "chip" in response.get_json()["error"]["fields"]
    assert store.observations == {}


def test_text_report_requires_text(client, store, signed_in):
    response = _post(client, dict(CHIP_BODY, source="text", chip=None, text="   "))
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"]["text"] == "text is required"


@pytest.mark.parametrize("source", ["live", "photo"])
def test_live_and_photo_are_rejected(client, store, signed_in, source):
    response = _post(client, dict(CHIP_BODY, source=source))
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"]["source"]
    assert store.observations == {}


def test_bad_coordinates(client, store, signed_in):
    response = _post(client, dict(CHIP_BODY, lat=91, lng=-181))
    fields = response.get_json()["error"]["fields"]
    assert response.status_code == 400
    assert "lat" in fields
    assert "lng" in fields
    assert store.observations == {}


def test_negative_accuracy(client, store, signed_in):
    response = _post(client, dict(CHIP_BODY, accuracyM=-1))
    assert response.status_code == 400
    assert "accuracyM" in response.get_json()["error"]["fields"]


def test_missing_required_fields(client, store, signed_in):
    response = _post(client, {"source": "chip"})
    fields = response.get_json()["error"]["fields"]
    assert response.status_code == 400
    assert "capturedAt" in fields
    assert "lat" in fields
    assert "lng" in fields
    assert "chip" in fields


def test_note_length_limit(client, store, signed_in):
    ok = _post(client, dict(CHIP_BODY, text="x" * 280))
    assert ok.status_code == 201
    too_long = _post(client, dict(CHIP_BODY, text="x" * 281))
    assert too_long.status_code == 400
    assert "text" in too_long.get_json()["error"]["fields"]


@pytest.mark.parametrize("method,path", [
    ("put", "/observations"),
    ("patch", "/observations"),
    ("delete", "/observations"),
    ("put", "/observations/obs_01"),
    ("patch", "/observations/obs_01"),
    ("delete", "/observations/obs_01"),
])
def test_edits_are_rejected(client, store, signed_in, method, path):
    response = client.open(path, method=method, headers={"Authorization": "Bearer valid"})
    assert response.status_code == 409
    assert response.get_json()["error"]["code"] == "conflict"
    assert store.observations == {}


def test_missing_token_does_not_write(client, store):
    response = _post(client, CHIP_BODY, headers={})
    assert response.status_code == 401
    assert store.observations == {}


def test_notify_double_is_called_after_write(client, store, signed_in, monkeypatch):
    called = []
    monkeypatch.setattr(
        "observations.routes.notify_observation",
        lambda observation_id: called.append(observation_id),
    )
    response = _post(client, CHIP_BODY)
    assert response.status_code == 201
    assert called == [response.get_json()["id"]]


def test_notify_skips_when_url_unset(monkeypatch):
    monkeypatch.delenv("AGENTS_BASE_URL", raising=False)

    def refuse(*_args, **_kwargs):
        raise AssertionError("agents should not be called")

    monkeypatch.setattr("observations.notify.urllib.request.urlopen", refuse)
    notify_observation("obs_01")


def test_notify_posts_intake_when_url_is_set(monkeypatch):
    monkeypatch.setenv("AGENTS_BASE_URL", "https://agents.example/")
    monkeypatch.setattr("observations.notify._id_token", lambda audience: "tok")
    seen = {}

    class _Response:
        def read(self):
            return b""

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def fake_urlopen(request, timeout=10):
        seen["url"] = request.full_url
        seen["auth"] = request.get_header("Authorization")
        seen["timeout"] = timeout
        return _Response()

    monkeypatch.setattr("observations.notify.urllib.request.urlopen", fake_urlopen)
    notify_observation("abc")
    assert seen["url"] == "https://agents.example/internal/observations/abc/intake"
    assert seen["auth"] == "Bearer tok"
