"""FirestoreObservationStore against a small in-memory stand-in for the client."""
from datetime import datetime, timezone

import pytest
from google.api_core.exceptions import AlreadyExists

from observations.store import (
    MAX_VOLUNTEER_NAME, FirestoreObservationStore, assemble_record, clean_volunteer_name, observation_id_for,
)
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

    def delete(self):
        self.db.data[self.collection].pop(self.id, None)

    def update(self, fields):
        doc = self.db.data[self.collection][self.id]
        for key, value in fields.items():
            doc[key] = doc.get(key, 0) + value.value if isinstance(value, FakeIncrement) else value


class FakeIncrement:
    def __init__(self, value):
        self.value = value


class FakeQuery:
    def __init__(self, docs):
        self.docs = docs

    def where(self, field, op, value):
        assert op == "<="
        return FakeQuery([d for d in self.docs if d[field] <= value])

    def order_by(self, field):
        return FakeQuery(sorted(self.docs, key=lambda d: d[field]))

    def limit(self, count):
        return FakeQuery(self.docs[:count])

    def stream(self):
        return [FakeSnapshot(d) for d in self.docs]


class FakeCollection:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def where(self, field, op, value):
        return FakeQuery(list(self.db.data[self.name].values())).where(field, op, value)

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
        self.data = {"observations": {}, "audit": {}, "intakePending": {}}
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


def test_new_observation_is_queued_for_intake_until_it_is_done():
    db = FakeDb()
    store = FirestoreObservationStore(client=db)
    stored, _ = store.create(_record())
    queued = db.data["intakePending"][stored["id"]]
    assert queued == {
        "id": stored["id"],
        "createdAt": "2026-10-13T08:12:05Z",
        "attemptedAt": "2026-10-13T08:12:05Z",
        "attempts": 0,
    }
    store.intake_done(stored["id"])
    assert db.data["intakePending"] == {}
    store.intake_done(stored["id"])  # deleting twice is fine


def test_replay_does_not_requeue_a_delivered_observation():
    db = FakeDb()
    store = FirestoreObservationStore(client=db)
    stored, _ = store.create(_record(client_id="item-1"))
    store.intake_done(stored["id"])
    store.create(_record(client_id="item-1"))
    assert db.data["intakePending"] == {}


def test_pending_intake_returns_due_items_oldest_first(monkeypatch):
    db = FakeDb()
    store = FirestoreObservationStore(client=db)
    ids = []
    for second in (30, 10, 20):
        record = _record()
        record["receivedAt"] = f"2026-10-13T08:12:{second:02d}Z"
        ids.append(store.create(record)[0]["id"])
    due = store.pending_intake(retry_before="2026-10-13T08:12:25Z", limit=5)
    assert [d["id"] for d in due] == [ids[1], ids[2]]
    assert len(store.pending_intake(retry_before="2026-10-13T09:00:00Z", limit=2)) == 2


def test_intake_failed_counts_the_attempt_and_moves_it_back(monkeypatch):
    import observations.store as store_module

    monkeypatch.setattr("google.cloud.firestore.Increment", FakeIncrement)
    db = FakeDb()
    store = FirestoreObservationStore(client=db)
    stored, _ = store.create(_record())
    store.intake_failed(stored["id"], "2026-10-13T08:20:00.000Z")
    item = db.data["intakePending"][stored["id"]]
    assert item["attempts"] == 1
    assert item["attemptedAt"] == "2026-10-13T08:20:00.000Z"
    assert store_module.PENDING_COLLECTION == "intakePending"


def test_volunteer_name_is_added_only_when_there_is_one():
    prepared = prepare_observation(dict(BODY))
    assert assemble_record(prepared, "uid_sari", "2026-10-13T08:12:05Z", "Sari")["volunteerName"] == "Sari"
    assert "volunteerName" not in assemble_record(prepared, "uid_sari", "2026-10-13T08:12:05Z", None)
    assert "volunteerName" not in assemble_record(prepared, "uid_sari", "2026-10-13T08:12:05Z", "  ")
    assert "volunteerName" not in assemble_record(prepared, "uid_sari", "2026-10-13T08:12:05Z")


def test_volunteer_name_is_one_short_line():
    assert clean_volunteer_name("  Pak\n  Dedi ") == "Pak Dedi"
    assert clean_volunteer_name(None) is None
    assert clean_volunteer_name(7) is None
    assert len(clean_volunteer_name("x" * 500)) == MAX_VOLUNTEER_NAME
