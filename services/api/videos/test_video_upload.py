"""Tests for POST /videos/upload-url and the video path helpers."""
from datetime import datetime, timezone

import pytest

import identity
from app import app
from photos import signing
from videos import paths as video_paths, store as video_store


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def saved(monkeypatch):
    records = []

    def save(record):
        records.append(record)
        return f"up_{len(records)}"

    monkeypatch.setattr(video_store, "save_upload", save)
    return records


@pytest.fixture
def signed(monkeypatch):
    calls = []

    def sign(bucket, path, content_type, ttl):
        calls.append((bucket, path, content_type, ttl))
        return f"https://storage.googleapis.com/{bucket}/{path}?X-Goog-Signature=sig"

    monkeypatch.setattr(signing, "sign_put_url", sign)
    return calls


def _as(monkeypatch, role="volunteer", uid="uid_sari"):
    monkeypatch.setattr(
        identity,
        "verify_id_token",
        lambda token: {"uid": uid, "name": "Sari", "role": role},
    )


def _post(client, body):
    return client.post(
        "/videos/upload-url",
        headers={"Authorization": "Bearer valid"},
        json=body,
    )


def test_volunteer_gets_signed_put_url(client, monkeypatch, saved, signed):
    _as(monkeypatch)
    response = _post(client, {"contentType": "video/mp4"})
    body = response.get_json()
    assert response.status_code == 201
    assert body["method"] == "PUT"
    assert body["headers"] == {"Content-Type": "video/mp4"}
    assert video_paths.is_owned_video_path(body["videoPath"], "uid_sari")
    bucket, path, content_type, ttl = signed[0]
    assert bucket == "ember-fire-commander-ember-photos"
    assert path == body["videoPath"]
    assert content_type == "video/mp4"
    assert ttl == 300
    assert body["uploadUrl"].startswith("https://storage.googleapis.com/")


def test_webm_content_type_accepted(client, monkeypatch, saved, signed):
    _as(monkeypatch)
    body = _post(client, {"contentType": "video/webm"}).get_json()
    assert video_paths.is_owned_video_path(body["videoPath"], "uid_sari")
    assert body["videoPath"].endswith(".webm")


def test_phone_mov_video_is_accepted_without_relabelling_it(client, monkeypatch, saved, signed):
    _as(monkeypatch)
    response = _post(client, {"contentType": "video/quicktime"})
    assert response.status_code == 201
    body = response.get_json()
    assert body["videoPath"].endswith(".mov")
    assert video_paths.is_owned_video_path(body["videoPath"], "uid_sari")
    assert body["headers"]["Content-Type"] == "video/quicktime"


def test_stores_object_path_not_url(client, monkeypatch, saved, signed):
    _as(monkeypatch)
    body = _post(client, {"contentType": "video/mp4"}).get_json()
    assert len(saved) == 1
    record = saved[0]
    assert record["videoPath"] == body["videoPath"]
    assert record["volunteerId"] == "uid_sari"
    assert record["expiresAt"] == body["expiresAt"]
    assert not any("http" in str(value) for value in record.values())
    assert "uploadUrl" not in record


def test_supervisor_is_forbidden(client, monkeypatch, saved, signed):
    _as(monkeypatch, role="supervisor", uid="uid_maya")
    response = _post(client, {"contentType": "video/mp4"})
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
    assert signed == [] and saved == []


def test_requires_sign_in(client, saved, signed):
    response = client.post("/videos/upload-url", json={"contentType": "video/mp4"})
    assert response.status_code == 401
    assert signed == []


@pytest.mark.parametrize("body", [None, {}, {"contentType": "video/avi"}, {"contentType": "image/jpeg"}])
def test_rejects_unknown_content_type(client, monkeypatch, saved, signed, body):
    _as(monkeypatch)
    if body is None:
        response = client.post(
            "/videos/upload-url",
            headers={"Authorization": "Bearer valid"},
            data="not json",
        )
    else:
        response = _post(client, body)
    error = response.get_json()["error"]
    assert response.status_code == 400
    assert error["code"] == "validation_error"
    assert "contentType" in error["fields"]
    assert signed == []


def test_path_owner_check_rejects_other_users():
    path = video_paths.new_video_path("uid_sari", "video/mp4")
    assert video_paths.owner_of(path) == "uid_sari"
    assert video_paths.is_owned_video_path(path, "uid_sari")
    assert not video_paths.is_owned_video_path(path, "uid_dedi")
    assert not video_paths.is_owned_video_path(path.replace("uid_sari", "uid_sari/../uid_dedi"), "uid_dedi")
    assert not video_paths.is_owned_video_path("https://storage.googleapis.com/b/" + path, "uid_sari")
    assert not video_paths.is_owned_video_path("", "uid_sari")


def test_paths_are_unique_and_dated():
    now = datetime(2026, 10, 17, 3, 0, tzinfo=timezone.utc)
    first = video_paths.new_video_path("uid_sari", "video/mp4", now)
    second = video_paths.new_video_path("uid_sari", "video/mp4", now)
    assert first != second
    assert first.startswith("videos/uid_sari/20261017/")
    assert first.endswith(".mp4")


def test_unsafe_uid_is_refused():
    with pytest.raises(ValueError):
        video_paths.new_video_path("../uid_dedi", "video/mp4")


def test_video_source_accepted_in_observation(client, monkeypatch, saved, signed):
    """A video observation is accepted when the videoPath was issued to the caller."""
    _as(monkeypatch)
    # Issue a video path first.
    url_response = _post(client, {"contentType": "video/mp4"})
    video_path = url_response.get_json()["videoPath"]

    # Stub store.was_issued so it confirms the path was issued.
    monkeypatch.setattr(video_store, "was_issued", lambda uid, path: uid == "uid_sari" and path == video_path)

    # Stub observation store to avoid Firestore calls.
    from observations import store as obs_store
    stored = {
        "id": "obs_vid_01",
        "volunteerId": "uid_sari",
        "capturedAt": "2026-10-17T03:02:00Z",
        "receivedAt": "2026-10-17T03:02:01Z",
        "source": "video",
        "lat": 1.48,
        "lng": 102.11,
        "accuracyM": 18,
        "chip": None,
        "text": None,
        "severity": "unknown",
        "photoPath": None,
        "videoPath": video_path,
        "immutable": True,
    }

    class FakeStore:
        def create(self, r):
            return stored, True

        def intake_done(self, i):
            pass

        def get_join(self, i):
            return None

    # The route imports get_store by name, so we patch the routes module reference.
    from observations import routes as obs_routes
    monkeypatch.setattr(obs_routes, "get_store", lambda: FakeStore())

    from observations import notify
    monkeypatch.setattr(notify, "notify_observation", lambda oid: True)
    from assist import background
    monkeypatch.setattr(background, "after_store", lambda *a, **kw: None)

    response = client.post(
        "/observations",
        headers={"Authorization": "Bearer valid"},
        json={
            "source": "video",
            "capturedAt": "2026-10-17T03:02:00Z",
            "lat": 1.48,
            "lng": 102.11,
            "accuracyM": 18,
            "videoPath": video_path,
        },
    )
    assert response.status_code in (200, 201), response.get_json()
    data = response.get_json()
    assert data.get("source") == "video"
    assert data.get("videoPath") == video_path
