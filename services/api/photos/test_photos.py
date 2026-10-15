from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from google.oauth2 import service_account

import identity
from app import app
from photos import signing, store
from photos.paths import is_owned_photo_path, new_photo_path, owner_of


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

    monkeypatch.setattr(store, "save_upload", save)
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
        "/photos/upload-url",
        headers={"Authorization": "Bearer valid"},
        json=body,
    )


def test_volunteer_gets_signed_put_url(client, monkeypatch, saved, signed):
    _as(monkeypatch)
    response = _post(client, {"contentType": "image/jpeg"})
    body = response.get_json()
    assert response.status_code == 201
    assert body["method"] == "PUT"
    assert body["headers"] == {"Content-Type": "image/jpeg"}
    assert is_owned_photo_path(body["photoPath"], "uid_sari")
    bucket, path, content_type, ttl = signed[0]
    assert bucket == "ember-fire-commander-ember-photos"
    assert path == body["photoPath"]
    assert content_type == "image/jpeg"
    assert ttl == 300
    assert body["uploadUrl"].startswith("https://storage.googleapis.com/")


def test_stores_object_path_not_url(client, monkeypatch, saved, signed):
    _as(monkeypatch)
    body = _post(client, {"contentType": "image/webp"}).get_json()
    assert len(saved) == 1
    record = saved[0]
    assert record["photoPath"] == body["photoPath"]
    assert record["volunteerId"] == "uid_sari"
    assert record["expiresAt"] == body["expiresAt"]
    assert not any("http" in str(value) for value in record.values())
    assert "uploadUrl" not in record


def test_bucket_comes_from_env(client, monkeypatch, saved, signed):
    monkeypatch.setenv("PHOTO_BUCKET", "other-bucket")
    _as(monkeypatch)
    _post(client, {"contentType": "image/jpeg"})
    assert signed[0][0] == "other-bucket"


def test_ttl_is_capped(monkeypatch):
    monkeypatch.setenv("PHOTO_UPLOAD_TTL_SECONDS", "86400")
    assert signing.upload_ttl_seconds() == 900
    monkeypatch.setenv("PHOTO_UPLOAD_TTL_SECONDS", "nonsense")
    assert signing.upload_ttl_seconds() == 300


def test_supervisor_is_forbidden(client, monkeypatch, saved, signed):
    _as(monkeypatch, role="supervisor", uid="uid_maya")
    response = _post(client, {"contentType": "image/jpeg"})
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
    assert signed == [] and saved == []


def test_requires_sign_in(client, saved, signed):
    response = client.post("/photos/upload-url", json={"contentType": "image/jpeg"})
    assert response.status_code == 401
    assert signed == []


@pytest.mark.parametrize("body", [None, {}, {"contentType": "image/png"}, {"contentType": "text/html"}])
def test_rejects_unknown_content_type(client, monkeypatch, saved, signed, body):
    _as(monkeypatch)
    if body is None:
        response = client.post(
            "/photos/upload-url",
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
    path = new_photo_path("uid_sari", "image/jpeg")
    assert owner_of(path) == "uid_sari"
    assert is_owned_photo_path(path, "uid_sari")
    assert not is_owned_photo_path(path, "uid_dedi")
    assert not is_owned_photo_path(path.replace("uid_sari", "uid_sari/../uid_dedi"), "uid_dedi")
    assert not is_owned_photo_path("https://storage.googleapis.com/b/" + path, "uid_sari")
    assert not is_owned_photo_path("", "uid_sari")


def test_paths_are_unique_and_dated():
    now = datetime(2026, 10, 17, 3, 0, tzinfo=timezone.utc)
    first = new_photo_path("uid_sari", "image/jpeg", now)
    second = new_photo_path("uid_sari", "image/jpeg", now)
    assert first != second
    assert first.startswith("photos/uid_sari/20261017/")
    assert first.endswith(".jpg")


def test_unsafe_uid_is_refused():
    with pytest.raises(ValueError):
        new_photo_path("../uid_dedi", "image/jpeg")


def _fake_service_account():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    return service_account.Credentials.from_service_account_info({
        "type": "service_account",
        "project_id": "ember-fire-commander",
        "private_key_id": "test",
        "private_key": pem,
        "client_email": "sa-ember-api@ember-fire-commander.iam.gserviceaccount.com",
        "token_uri": "https://oauth2.googleapis.com/token",
    })


def test_signed_url_is_v4_put_bound_to_content_type_and_expiry(monkeypatch):
    credentials = _fake_service_account()
    monkeypatch.setattr(credentials, "refresh", lambda request: None)
    monkeypatch.setattr(signing.google.auth, "default", lambda scopes=None: (credentials, "ember-fire-commander"))
    url = signing.sign_put_url(
        "ember-fire-commander-ember-photos",
        "photos/uid_sari/20261017/abc.jpg",
        "image/jpeg",
        300,
    )
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert parsed.path.endswith("/ember-fire-commander-ember-photos/photos/uid_sari/20261017/abc.jpg")
    assert query["X-Goog-Algorithm"] == ["GOOG4-RSA-SHA256"]
    assert query["X-Goog-Expires"] == ["300"]
    assert "content-type" in query["X-Goog-SignedHeaders"][0]
    assert "X-Goog-Signature" in query


def test_cloud_run_credentials_sign_through_iam(monkeypatch):
    class MetadataCredentials:
        service_account_email = "sa-ember-api@ember-fire-commander.iam.gserviceaccount.com"
        token = "access-token"

        def refresh(self, request):
            pass

    captured = {}

    def generate_signed_url(self, **kwargs):
        captured.update(kwargs)
        return "https://storage.googleapis.com/signed"

    monkeypatch.setattr(signing.google.auth, "default", lambda scopes=None: (MetadataCredentials(), "ember-fire-commander"))
    monkeypatch.setattr(signing.storage.Client, "__init__", lambda self, project=None, credentials=None: None)
    monkeypatch.setattr(signing.storage.Client, "bucket", lambda self, name: signing.storage.Bucket(None, name))
    monkeypatch.setattr(signing.storage.Blob, "generate_signed_url", generate_signed_url)
    signing.sign_put_url("bucket", "photos/uid_sari/20261017/abc.jpg", "image/jpeg", 300)
    assert captured["service_account_email"].startswith("sa-ember-api@")
    assert captured["access_token"] == "access-token"
    assert captured["method"] == "PUT"
    assert captured["version"] == "v4"


class _Query:
    def __init__(self, rows):
        self._rows = rows
        self.filters = []

    def where(self, field, op, value):
        self.filters.append((field, op, value))
        return self

    def limit(self, count):
        return self

    def stream(self):
        rows = self._rows
        for field, _op, value in self.filters:
            rows = [row for row in rows if row.get(field) == value]
        return iter(rows)


class _Db:
    def __init__(self, rows):
        self._rows = rows

    def collection(self, name):
        assert name == store.COLLECTION
        return _Query(self._rows)


def test_was_issued_matches_owner_and_path(monkeypatch):
    path = "photos/uid_sari/20261014/" + "a" * 32 + ".jpg"
    rows = [{"volunteerId": "uid_sari", "photoPath": path}]
    monkeypatch.setattr(store, "_db", lambda: _Db(rows))
    assert store.was_issued("uid_sari", path) is True
    assert store.was_issued("uid_budi", path) is False
    assert store.was_issued("uid_sari", path.replace("a", "b")) is False
