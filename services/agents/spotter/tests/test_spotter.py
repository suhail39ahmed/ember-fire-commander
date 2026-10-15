import os
import re

import pytest

import spotter.model
import spotter.routes
import spotter.store
from app import app
from spotter.store import MemorySpotterStore
from spotter.summary import is_neutral
from spotter.triage import PhotoRejected, check_photo, clean

FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "smoke-1x1.jpg")
PHOTO = "photos/uid_sari/20261013/" + "a" * 32 + ".jpg"
OTHER = "photos/uid_rizal/20261013/" + "b" * 32 + ".jpg"


class FakeModel:
    name = "gemini-test-flash"

    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    def json(self, prompt, image=None, mime_type=None):
        self.calls.append({"prompt": prompt, "image": image, "mime_type": mime_type})
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture
def store(monkeypatch):
    with open(FIXTURE, "rb") as fh:
        image = fh.read()
    memory = MemorySpotterStore(photos={PHOTO: image, OTHER: image})
    monkeypatch.setattr(spotter.routes, "get_store", lambda: memory)
    return memory


def use_model(monkeypatch, reply):
    fake = FakeModel(reply)
    monkeypatch.setattr(spotter.model, "get_model", lambda: fake)
    return fake


def seed_obs(store, oid, volunteer, path, **extra):
    doc = {
        "volunteerId": volunteer, "source": "photo", "severity": "unknown", "chip": None,
        "text": None, "lat": 1.482, "lng": 102.115, "accuracyM": 18, "photoPath": path,
        "capturedAt": "2026-10-13T08:12:00Z", "immutable": True,
    }
    doc.update(extra)
    store.collections["observations"][oid] = doc


def test_image_fixture_returns_structured_triage(client, store, monkeypatch):
    fake = use_model(monkeypatch, {
        "smokeVisible": True, "flameVisible": "none", "burnScarVisible": True,
        "notes": "Low white smoke over charred ground.", "confidence": "high",
        "severity": "large_flame", "withdraw": True,
    })
    seed_obs(store, "obs_p1", "uid_sari", PHOTO)
    before = dict(store.collections["observations"]["obs_p1"])

    response = client.post("/internal/observations/obs_p1/triage", json={"callerId": "uid_sari"})
    body = response.get_json()
    assert response.status_code == 200
    assert body["status"] == "ok" and body["advisory"] is True
    assert body["model"] == "gemini-test-flash"
    assert body["result"] == {
        "smokeVisible": True, "flameVisible": "none", "burnScarVisible": True,
        "notes": "Low white smoke over charred ground.", "confidence": "high",
    }
    assert "severity" not in body["result"] and "withdraw" not in body["result"]
    assert fake.calls[0]["mime_type"] == "image/jpeg"
    assert fake.calls[0]["image"][:2] == b"\xff\xd8"
    assert store.collections["photo_triage"]["obs_p1"]["result"] == body["result"]
    assert store.collections["observations"]["obs_p1"] == before
    assert store.collections["incidents"] == {}


def test_unauthorized_path_is_rejected_without_reading(client, store, monkeypatch):
    fake = use_model(monkeypatch, {})
    # Sari's observation points at Rizal's photo.
    seed_obs(store, "obs_p2", "uid_sari", OTHER)
    response = client.post("/internal/observations/obs_p2/triage")
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "forbidden"
    assert store.reads == [] and fake.calls == []
    flagged = store.collections["photo_triage"]["obs_p2"]
    assert flagged["status"] == "rejected"
    assert "not owned" in flagged["reason"]


def test_caller_must_own_path_too(client, store, monkeypatch):
    use_model(monkeypatch, {})
    seed_obs(store, "obs_p3", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_p3/triage", json={"callerId": "uid_rizal"})
    assert response.status_code == 403
    assert store.reads == []


@pytest.mark.parametrize("path", [
    None, "", "gs://bucket/photos/uid_sari/x.jpg", "https://storage.googleapis.com/x.jpg",
    "photos/uid_sari/../uid_rizal/20261013/" + "a" * 32 + ".jpg",
    "photos/uid_sari/20261013/" + "a" * 32 + ".png",
])
def test_bad_paths_are_rejected(path):
    with pytest.raises(PhotoRejected):
        check_photo({"volunteerId": "uid_sari", "photoPath": path})


def test_clean_defaults_bad_values():
    assert clean({"flameVisible": "inferno", "confidence": 9, "notes": 3}) == {
        "smokeVisible": False, "flameVisible": "unclear", "burnScarVisible": False,
        "notes": "", "confidence": "low",
    }
    assert clean("not json")["flameVisible"] == "unclear"


def test_unknown_observation_is_404(client, store, monkeypatch):
    use_model(monkeypatch, {})
    assert client.post("/internal/observations/nope/triage").status_code == 404


def seed_incident(store):
    store.collections["incidents"]["inc_01"] = {
        "status": "held", "severity": "small_flame", "evidenceScore": 64,
        "conflictId": "con_01", "withdraw": None, "lat": 1.482, "lng": 102.115,
        "observationIds": ["obs_01", "obs_02"],
    }
    store.collections["conflicts"]["con_01"] = {"incidentId": "inc_01", "status": "open"}
    seed_obs(store, "obs_01", "uid_sari", PHOTO, chip="api", source="chip")
    seed_obs(store, "obs_02", "uid_rizal", None, chip="aman", source="chip")


def test_summary_is_grounded_and_bilingual(client, store, monkeypatch):
    fake = use_model(monkeypatch, {
        "en": "Two volunteers sent reports here and they disagree.",
        "id": "Dua relawan mengirim laporan di sini dan laporannya berbeda.",
    })
    seed_incident(store)
    before = dict(store.collections["incidents"]["inc_01"])
    response = client.post("/internal/incidents/inc_01/summary")
    body = response.get_json()
    assert response.status_code == 200
    assert body["source"] == "model" and body["advisory"] is True
    assert body["english"].startswith("Two volunteers")
    assert body["bahasa"].startswith("Dua relawan")
    assert body["facts"]["reportCount"] == 2
    assert body["facts"]["reportsDisagree"] is True
    assert "severity" not in body["facts"] and "evidenceScore" not in body["facts"]
    assert "small_flame" not in fake.calls[0]["prompt"].split("FACTS:")[1]
    assert store.collections["incidents"]["inc_01"] == before
    assert "inc_01" in store.collections["incident_summaries"]


@pytest.mark.parametrize("reply", [
    {"en": "This is a severe fire. Withdraw now.", "id": "Api besar, mundur."},
    {"en": "Reports here.", "id": "Lokasi ini berbahaya."},
    {"en": "", "id": ""},
    RuntimeError("model unavailable"),
])
def test_summary_falls_back_when_model_decides(client, store, monkeypatch, reply):
    use_model(monkeypatch, reply)
    seed_incident(store)
    body = client.post("/internal/incidents/inc_01/summary").get_json()
    assert body["source"] == "template" and body["model"] is None
    assert body["english"] == (
        "2 report(s) from 2 volunteer(s) at this location. "
        "The reports disagree and are waiting for a check."
    )
    assert is_neutral(body["english"]) and is_neutral(body["bahasa"])


def test_model_name_is_configurable(monkeypatch):
    monkeypatch.setenv("EMBER_FLASH_MODEL", "gemini-2.0-flash-001")
    assert spotter.model.model_name() == "gemini-2.0-flash-001"
    monkeypatch.delenv("EMBER_FLASH_MODEL")
    assert spotter.model.model_name() == spotter.model.DEFAULT_MODEL


def test_flash_model_uses_vertex_json_mode():
    class Resp:
        text = '{"en": "x", "id": "y"}'

    class Models:
        def __init__(self):
            self.kwargs = None

        def generate_content(self, **kwargs):
            self.kwargs = kwargs
            return Resp()

    class Client:
        models = Models()

    fake = Client()
    flash = spotter.model.FlashModel(client=fake, name="gemini-test")
    assert flash.json("hi", image=b"\xff\xd8", mime_type="image/jpeg") == {"en": "x", "id": "y"}
    assert fake.models.kwargs["model"] == "gemini-test"
    assert fake.models.kwargs["config"].response_mime_type == "application/json"


# Failure handling for photo triage (model, storage, size, timeouts).

class FakeBlob:
    def __init__(self, data=None, size=None):
        self.data = data
        self.size = size
        self.downloads = 0
        self.timeouts = []

    def reload(self, timeout=None):
        from google.api_core.exceptions import NotFound

        self.timeouts.append(timeout)
        if self.data is None:
            raise NotFound("no such object")

    def download_as_bytes(self, timeout=None):
        from google.api_core.exceptions import NotFound

        self.timeouts.append(timeout)
        self.downloads += 1
        if self.data is None:
            raise NotFound("no such object")
        return self.data


class FakeStorage:
    def __init__(self, blob):
        self.blob_obj = blob
        self.asked = []

    def bucket(self, name):
        self.asked.append(name)
        return self

    def blob(self, path):
        self.asked.append(path)
        return self.blob_obj


def assert_error_record(store, oid, error):
    saved = store.collections["photo_triage"][oid]
    assert saved["status"] == "error"
    assert saved["error"] == error
    assert saved["result"] is None
    assert saved["advisory"] is True
    return saved


def test_model_exception_stores_an_error_record(client, store, monkeypatch):
    use_model(monkeypatch, RuntimeError("503 Vertex unavailable"))
    seed_obs(store, "obs_e1", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_e1/triage")
    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "triage_failed"
    assert response.get_json()["error"]["message"] == "model call failed"
    saved = assert_error_record(store, "obs_e1", "model call failed")
    assert saved["observationId"] == "obs_e1" and saved["photoPath"] == PHOTO
    assert "Vertex" not in str(saved)


def test_model_timeout_stores_an_error_record(client, store, monkeypatch):
    use_model(monkeypatch, TimeoutError("deadline exceeded"))
    seed_obs(store, "obs_e2", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_e2/triage")
    assert response.status_code == 502
    assert_error_record(store, "obs_e2", "model call failed")


@pytest.mark.parametrize("reply", [
    ValueError("Expecting value: line 1 column 1"),
    spotter.model.ModelError("model did not return JSON"),
    "not a json object",
    ["a", "list"],
    None,
])
def test_invalid_model_output_stores_an_error_record(client, store, monkeypatch, reply):
    use_model(monkeypatch, reply)
    seed_obs(store, "obs_e3", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_e3/triage")
    assert response.status_code == 502
    assert_error_record(store, "obs_e3", "model returned invalid output")


def test_missing_object_stores_an_error_record(client, store, monkeypatch):
    fake = use_model(monkeypatch, {})
    seed_obs(store, "obs_e4", "uid_sari", "photos/uid_sari/20261013/" + "c" * 32 + ".jpg")
    response = client.post("/internal/observations/obs_e4/triage")
    assert response.status_code == 502
    assert response.get_json()["error"]["message"] == "photo not found in storage"
    assert_error_record(store, "obs_e4", "photo not found in storage")
    assert fake.calls == [] and store.reads == []


def test_unreadable_object_stores_an_error_record(client, store, monkeypatch):
    fake = use_model(monkeypatch, {})

    def boom(path):
        raise OSError("connection reset")

    monkeypatch.setattr(store, "read_photo", boom)
    seed_obs(store, "obs_e5", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_e5/triage")
    assert response.status_code == 502
    assert_error_record(store, "obs_e5", "photo could not be read from storage")
    assert fake.calls == []


def test_oversized_photo_is_rejected_without_a_download(client, store, monkeypatch):
    fake = use_model(monkeypatch, {})
    store.photos[PHOTO] = b"\xff\xd8" + b"0" * (8 * 1024 * 1024)
    seed_obs(store, "obs_e6", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_e6/triage")
    assert response.status_code == 413
    assert response.get_json()["error"]["code"] == "photo_too_large"
    assert store.reads == [] and fake.calls == []
    saved = store.collections["photo_triage"]["obs_e6"]
    assert saved["status"] == "rejected" and "8 MB" in saved["reason"]


def test_photo_at_the_limit_is_still_read(client, store, monkeypatch):
    use_model(monkeypatch, {"flameVisible": "none", "confidence": "low"})
    store.photos[PHOTO] = b"\xff\xd8" + b"0" * (8 * 1024 * 1024 - 2)
    seed_obs(store, "obs_e7", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_e7/triage")
    assert response.status_code == 200
    assert store.reads == [PHOTO]


def test_firestore_store_checks_size_from_metadata_only():
    blob = FakeBlob(data=b"x" * 10, size=9 * 1024 * 1024)
    storage = FakeStorage(blob)
    store = spotter.store.FirestoreSpotterStore(storage_client=storage)
    assert store.photo_size(PHOTO) == 9 * 1024 * 1024
    assert blob.downloads == 0
    assert blob.timeouts == [spotter.store.STORAGE_TIMEOUT_SECONDS]


def test_firestore_store_maps_not_found_to_photo_missing():
    storage = FakeStorage(FakeBlob(data=None))
    store = spotter.store.FirestoreSpotterStore(storage_client=storage)
    with pytest.raises(spotter.store.PhotoMissing):
        store.photo_size(PHOTO)
    with pytest.raises(spotter.store.PhotoMissing):
        store.read_photo(PHOTO)


def test_firestore_store_download_has_a_timeout():
    blob = FakeBlob(data=b"abc", size=3)
    store = spotter.store.FirestoreSpotterStore(storage_client=FakeStorage(blob))
    assert store.read_photo(PHOTO) == b"abc"
    assert blob.timeouts == [spotter.store.STORAGE_TIMEOUT_SECONDS]


def test_missing_object_through_the_real_store_wiring(client, monkeypatch):
    use_model(monkeypatch, {})
    memory = MemorySpotterStore()
    storage = FakeStorage(FakeBlob(data=None))
    firestore_store = spotter.store.FirestoreSpotterStore(storage_client=storage)
    memory.photo_size = firestore_store.photo_size
    memory.read_photo = firestore_store.read_photo
    monkeypatch.setattr(spotter.routes, "get_store", lambda: memory)
    seed_obs(memory, "obs_e8", "uid_sari", PHOTO)
    response = client.post("/internal/observations/obs_e8/triage")
    assert response.status_code == 502
    assert_error_record(memory, "obs_e8", "photo not found in storage")


class FakeGenaiResponse:
    def __init__(self, text):
        self.text = text


class FakeGenaiClient:
    def __init__(self, text):
        self.models = self
        self.text = text

    def generate_content(self, **kwargs):
        return FakeGenaiResponse(self.text)


@pytest.mark.parametrize("text", ["{not json", "", None, "[1, 2]", "42"])
def test_flash_model_raises_model_error_on_bad_output(text):
    model = spotter.model.FlashModel(client=FakeGenaiClient(text))
    with pytest.raises(spotter.model.ModelError):
        model.json("describe")


def test_flash_model_parses_a_json_object():
    model = spotter.model.FlashModel(client=FakeGenaiClient('{"a": 1}'))
    assert model.json("describe") == {"a": 1}


def test_flash_model_client_has_a_finite_timeout(monkeypatch):
    from google import genai

    seen = {}

    class Recorder:
        def __init__(self, **kwargs):
            seen.update(kwargs)

    monkeypatch.setattr(genai, "Client", Recorder)
    monkeypatch.delenv("EMBER_FLASH_TIMEOUT_SECONDS", raising=False)
    spotter.model.FlashModel()._sdk()
    assert seen["http_options"].timeout == 30000

    seen.clear()
    monkeypatch.setenv("EMBER_FLASH_TIMEOUT_SECONDS", "12")
    spotter.model.FlashModel()._sdk()
    assert seen["http_options"].timeout == 12000


@pytest.mark.parametrize("value", ["", "abc", "0", "-5"])
def test_flash_timeout_falls_back_to_the_default(monkeypatch, value):
    monkeypatch.setenv("EMBER_FLASH_TIMEOUT_SECONDS", value)
    assert spotter.model.timeout_seconds() == spotter.model.DEFAULT_TIMEOUT_SECONDS


def test_gunicorn_has_a_finite_worker_timeout():
    dockerfile = os.path.join(os.path.dirname(__file__), "..", "..", "Dockerfile")
    with open(dockerfile) as fh:
        text = fh.read()
    match = re.search(r"--timeout\s+(\d+)", text)
    assert match is not None and int(match.group(1)) > 0


def test_summary_still_falls_back_when_the_model_returns_bad_output(client, store, monkeypatch):
    use_model(monkeypatch, spotter.model.ModelError("model did not return JSON"))
    seed_incident(store)
    response = client.post("/internal/incidents/inc_01/summary")
    assert response.status_code == 200
    assert response.get_json()["source"] == "template"
