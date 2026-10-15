"""FirestoreObservationStore against a small in-memory stand-in for the client."""
from datetime import datetime, timezone

import pytest
from google.api_core.exceptions import AlreadyExists

from observations.store import FirestoreObservationStore, assemble_record, observation_id_for
from observations.validate import prepare_observation

BODY = {
    "source": "chip",
    "capturedAt": "2026-10-13T08:12:00Z",
    "lat": 1.482,
    "lng": 102.115,
    "accuracyM": 18,
    "chip": "api",
    "text": None,
}


class FakeSnapshot:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data)


class FakeRef:
    def __init__(self, db, collection, doc_id):
        self.db = db
        self.collection = collection
        self.id = doc_id

    def get(self):
        return FakeSnapshot(self.db.data[self.collection].get(self.id))


class FakeCollection:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def document(self, doc_id=None):
        self.db.counter += 1
        return FakeRef(self.db, self.name, doc_id or f"auto{self.db.counter}")


class FakeBatch:
    def __init__(self, db):
        self.db = db
        self.ops = []

    def create(self, ref, data):
        self.ops.append(("create", ref, dict(data)))

    def set(self, ref, data):
        self.ops.append(("set", ref, dict(data)))

    def commit(self):
        # All or nothing, like Firestore: one existing document fails the whole batch.
        for kind, ref, _ in self.ops:
            if kind == "create" and ref.id in self.db.data[ref.collection]:
                raise AlreadyExists("document exists")
        for _, ref, data in self.ops:
            self.db.data[ref.collection][ref.id] = data


class FakeDb:
    def __init__(self):
        self.data = {"observations": {}, "audit": {}}
        self.counter = 0

    def collection(self, name):
        return FakeCollection(self, name)

    def batch(self):
        return FakeBatch(self)


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    monkeypatch.setattr(
        "observations.validate._now",
        lambda: datetime(2026, 10, 14, tzinfo=timezone.utc),
    )


def _record(uid="uid_sari", client_id=None):
    body = dict(BODY)
    if client_id:
        body["clientId"] = client_id
    return assemble_record(prepare_observation(body), uid, "2026-10-13T08:12:05Z")


def test_client_id_gives_a_stable_document_id():
    db = FakeDb()
    store = FirestoreObservationStore(client=db)
    stored, created = store.create(_record(client_id="item-1"))
    assert created is True
    assert stored["id"] == observation_id_for("uid_sari", "item-1")
    assert list(db.data["observations"]) == [stored["id"]]
    assert len(db.data["audit"]) == 1


def test_replay_returns_the_existing_document_and_writes_no_second_audit_row():
    db = FakeDb()
    store = FirestoreObservationStore(client=db)
    first, _ = store.create(_record(client_id="item-1"))
    again, created = store.create(_record(client_id="item-1"))
    assert created is False
    assert again == first
    assert len(db.data["observations"]) == 1
    assert len(db.data["audit"]) == 1


def test_without_a_client_id_every_write_is_new():
    db = FakeDb()
    store = FirestoreObservationStore(client=db)
    a, created_a = store.create(_record())
    b, created_b = store.create(_record())
    assert created_a and created_b
    assert a["id"] != b["id"]
    assert len(db.data["audit"]) == 2


def test_other_errors_are_not_swallowed():
    class Broken(FakeBatch):
        def commit(self):
            raise RuntimeError("unavailable")

    db = FakeDb()
    db.batch = lambda: Broken(db)
    with pytest.raises(RuntimeError):
        FirestoreObservationStore(client=db).create(_record(client_id="item-1"))
