from datetime import datetime, timedelta, timezone

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


NOW = datetime(2026, 10, 14, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """Fix the clock so the sample timestamps stay inside the capturedAt window."""
    monkeypatch.setattr("observations.validate._now", lambda: NOW)


def _iso(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%SZ")


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
    if headers is None:
        headers = {"Authorization": "Bearer valid"}
    return client.post("/observations", json=body, headers=headers)


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


@pytest.mark.parametrize("task_type,owner,status,expected", [
    ("instruct", "uid_sari", "approved", 201),
    ("investigate", "uid_sari", "approved", 201),
    ("instruct", "uid_other", "approved", 400),
    ("instruct", "uid_sari", "proposed", 400),
    ("withdraw", "uid_sari", "approved", 400),
])
def test_assigned_task_report_link_is_validated(client, store, signed_in, monkeypatch, task_type, owner, status, expected):
    from incidents import store as incident_store
    from incidents.fake_firestore import FakeFirestore
    fake = FakeFirestore()
    fake.add("tasks", "task_progress", {"type": task_type, "volunteerId": owner, "status": status})
    monkeypatch.setattr(incident_store, "db", lambda: fake)
    response = _post(client, dict(CHIP_BODY, taskId="task_progress"))
    assert response.status_code == expected
    if expected == 201:
        assert store.get(response.get_json()["id"])["checkTaskId"] == "task_progress"
        assert "checkTaskId" not in response.get_json()


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


def test_live_is_rejected(client, store, signed_in):
    response = _post(client, dict(CHIP_BODY, source="live"))
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"]["source"]
    assert store.observations == {}


OWN_PATH = "photos/uid_sari/20261014/" + "a" * 32 + ".jpg"
OTHER_PATH = "photos/uid_budi/20261014/" + "b" * 32 + ".jpg"

PHOTO_BODY = {
    "source": "photo",
    "capturedAt": "2026-10-14T08:12:00Z",
    "lat": 1.482,
    "lng": 102.115,
    "accuracyM": 18,
    "chip": None,
    "text": None,
    "photoPath": OWN_PATH,
}


@pytest.fixture
def issued(monkeypatch):
    """Paths ember-api issued, as (volunteerId, photoPath) pairs."""
    pairs = {("uid_sari", OWN_PATH), ("uid_budi", OTHER_PATH)}
    monkeypatch.setattr(
        "photos.store.was_issued",
        lambda volunteer_id, path: (volunteer_id, path) in pairs,
    )
    return pairs


def test_photo_observation_keeps_its_photo_path(client, store, signed_in, issued):
    response = _post(client, PHOTO_BODY)
    body = response.get_json()
    assert response.status_code == 201
    assert body["source"] == "photo"
    assert body["volunteerId"] == "uid_sari"
    assert body["photoPath"] == OWN_PATH
    assert body["chip"] is None
    assert body["severity"] == "unknown"
    assert body["immutable"] is True
    assert store.get(body["id"]) == body
    assert store.audits[0]["action"] == "observation.create"


def test_photo_observation_with_note(client, store, signed_in, issued):
    response = _post(client, dict(PHOTO_BODY, text="  Smoke past the ditch  "))
    body = response.get_json()
    assert response.status_code == 201
    assert body["text"] == "Smoke past the ditch"
    assert body["photoPath"] == OWN_PATH


def test_photo_path_of_another_volunteer_is_refused(client, store, signed_in, issued):
    response = _post(client, dict(PHOTO_BODY, photoPath=OTHER_PATH))
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
    assert store.observations == {}


def test_photo_path_that_was_not_issued_is_refused(client, store, signed_in, issued):
    unissued = "photos/uid_sari/20261014/" + "c" * 32 + ".jpg"
    response = _post(client, dict(PHOTO_BODY, photoPath=unissued))
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
    assert store.observations == {}


@pytest.mark.parametrize("missing", [{}, {"photoPath": None}, {"photoPath": ""}])
def test_photo_report_requires_a_path(client, store, signed_in, issued, missing):
    body = {k: v for k, v in PHOTO_BODY.items() if k != "photoPath"}
    body.update(missing)
    response = _post(client, body)
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"]["photoPath"] == (
        "photoPath is required for a photo report"
    )
    assert store.observations == {}


@pytest.mark.parametrize("path", [
    "https://storage.googleapis.com/bucket/photos/uid_sari/20261014/" + "a" * 32 + ".jpg",
    "photos/uid_sari/../uid_budi/20261014/" + "a" * 32 + ".jpg",
    "photos/uid_sari/20261014/short.jpg",
    "photos/uid_sari/20261014/" + "a" * 32 + ".png",
    "uploads/uid_sari/20261014/" + "a" * 32 + ".jpg",
    12345,
])
def test_photo_report_rejects_a_malformed_path(client, store, signed_in, issued, path):
    response = _post(client, dict(PHOTO_BODY, photoPath=path))
    assert response.status_code == 400
    assert "photoPath" in response.get_json()["error"]["fields"]
    assert store.observations == {}


def test_photo_report_rejects_a_chip(client, store, signed_in, issued):
    response = _post(client, dict(PHOTO_BODY, chip="api"))
    assert response.status_code == 400
    assert "chip" in response.get_json()["error"]["fields"]
    assert store.observations == {}


def test_photo_path_is_ignored_on_chip_and_text_reports(client, store, signed_in):
    chip = _post(client, dict(CHIP_BODY, photoPath=OWN_PATH)).get_json()
    text = _post(client, {
        "source": "text",
        "capturedAt": "2026-10-13T08:14:00Z",
        "lat": 1.482,
        "lng": 102.115,
        "chip": None,
        "text": "smoke",
        "photoPath": OWN_PATH,
    }).get_json()
    assert chip["photoPath"] is None
    assert text["photoPath"] is None


def test_photo_report_needs_a_token(client, store, issued):
    response = _post(client, PHOTO_BODY, headers={})
    assert response.status_code == 401
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
    monkeypatch.delenv("EMBER_AGENTS_URL", raising=False)

    def refuse(*_args, **_kwargs):
        raise AssertionError("agents should not be called")

    monkeypatch.setattr("observations.notify.urllib.request.urlopen", refuse)
    notify_observation("obs_01")


def test_notify_posts_intake_when_url_is_set(monkeypatch):
    monkeypatch.setenv("EMBER_AGENTS_URL", "https://agents.example/")
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


@pytest.mark.parametrize("offset", [
    timedelta(minutes=5),
    timedelta(0),
    -timedelta(days=7),
    -timedelta(days=3),
])
def test_captured_at_inside_the_window_is_stored(client, store, signed_in, offset):
    response = _post(client, dict(CHIP_BODY, capturedAt=_iso(NOW + offset)))
    assert response.status_code == 201
    assert response.get_json()["capturedAt"] == _iso(NOW + offset)


@pytest.mark.parametrize("offset,message", [
    (timedelta(minutes=5, seconds=1), "capturedAt must not be more than 5 minutes in the future"),
    (timedelta(days=2), "capturedAt must not be more than 5 minutes in the future"),
    (-timedelta(days=7, seconds=1), "capturedAt must be within the last 7 days"),
    (-timedelta(days=60), "capturedAt must be within the last 7 days"),
])
def test_captured_at_outside_the_window_is_rejected(client, store, signed_in, offset, message):
    response = _post(client, dict(CHIP_BODY, capturedAt=_iso(NOW + offset)))
    body = response.get_json()
    assert response.status_code == 400
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["fields"]["capturedAt"] == message
    assert store.observations == {}


def test_future_captured_at_is_rejected_for_photo_and_text_reports(client, store, signed_in):
    future = _iso(NOW + timedelta(hours=1))
    text = _post(client, dict(CHIP_BODY, source="text", chip=None, text="note", capturedAt=future))
    assert text.status_code == 400
    assert "capturedAt" in text.get_json()["error"]["fields"]


def test_supervisor_can_file_a_report(client, store, monkeypatch):
    # Decided in #67: kept on purpose. A supervisor reporting from the field
    # is attributed to their own uid and gets no extra rights from doing so.
    monkeypatch.setattr(
        identity,
        "verify_id_token",
        lambda token: {"uid": "uid_bpbd", "name": "Dewi", "role": "supervisor"},
    )
    response = _post(client, CHIP_BODY)
    assert response.status_code == 201
    assert response.get_json()["volunteerId"] == "uid_bpbd"


def test_reporter_display_name_is_stored_with_the_report(client, store, signed_in):
    response = _post(client, CHIP_BODY)
    assert response.get_json()["volunteerName"] == "Sari"
    assert store.observations[response.get_json()["id"]]["volunteerName"] == "Sari"


def test_report_without_a_display_name_has_no_volunteer_name(client, store, monkeypatch):
    monkeypatch.setattr(
        identity, "verify_id_token", lambda token: {"uid": "uid_x", "role": "volunteer"}
    )
    response = _post(client, CHIP_BODY)
    assert response.status_code == 201
    assert "volunteerName" not in response.get_json()


def test_replaying_a_client_id_returns_the_stored_report(client, store, signed_in):
    body = dict(CHIP_BODY, clientId="outbox-item-1")
    first = _post(client, body)
    second = _post(client, body)
    assert first.status_code == 201
    assert second.status_code == 200
    assert second.get_json() == first.get_json()
    assert second.get_json()["clientId"] == "outbox-item-1"
    assert len(store.observations) == 1
    assert len(store.audits) == 1


def test_replay_does_not_notify_agents_again(client, store, signed_in, monkeypatch):
    called = []
    monkeypatch.setattr(
        "observations.routes.notify_observation",
        lambda observation_id: called.append(observation_id),
    )
    body = dict(CHIP_BODY, clientId="outbox-item-2")
    _post(client, body)
    _post(client, body)
    assert len(called) == 1


def test_replay_returns_the_first_report_even_if_the_body_differs(client, store, signed_in):
    first = _post(client, dict(CHIP_BODY, clientId="outbox-item-3", chip="asap")).get_json()
    second = _post(client, dict(CHIP_BODY, clientId="outbox-item-3", chip="api"))
    assert second.status_code == 200
    assert second.get_json()["id"] == first["id"]
    assert second.get_json()["chip"] == "asap"


def test_same_client_id_from_two_volunteers_is_two_reports(client, store, monkeypatch):
    body = dict(CHIP_BODY, clientId="shared-id")
    for uid in ("uid_sari", "uid_dedi"):
        monkeypatch.setattr(
            identity, "verify_id_token",
            lambda token, uid=uid: {"uid": uid, "name": uid, "role": "volunteer"},
        )
        assert _post(client, body).status_code == 201
    assert len(store.observations) == 2
    assert len(store.audits) == 2


def test_distinct_client_ids_are_distinct_reports(client, store, signed_in):
    assert _post(client, dict(CHIP_BODY, clientId="a")).status_code == 201
    assert _post(client, dict(CHIP_BODY, clientId="b")).status_code == 201
    assert len(store.observations) == 2


def test_report_without_a_client_id_is_unchanged(client, store, signed_in):
    response = _post(client, CHIP_BODY)
    assert response.status_code == 201
    assert "clientId" not in response.get_json()


@pytest.mark.parametrize("value", ["", " ", "a b", "x" * 129, 12, True, ["a"], "id/with/slash"])
def test_invalid_client_id_is_rejected(client, store, signed_in, value):
    response = _post(client, dict(CHIP_BODY, clientId=value))
    assert response.status_code == 400
    assert "clientId" in response.get_json()["error"]["fields"]
    assert store.observations == {}


def test_null_client_id_is_the_same_as_none(client, store, signed_in):
    assert _post(client, dict(CHIP_BODY, clientId=None)).status_code == 201
