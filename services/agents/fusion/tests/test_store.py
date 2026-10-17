import threading

from google.cloud import firestore

from fusion.store import FirestoreFusionStore


class Snap:
    def __init__(self, data):
        self._data = data
        self.exists = data is not None

    def to_dict(self):
        return dict(self._data) if self._data is not None else None


class Ref:
    def __init__(self, db, path):
        self.db, self.path = db, path

    def get(self, transaction=None):
        return Snap(self.db.docs.get(self.path))


class Transaction:
    def __init__(self, db):
        self.db = db

    def set(self, ref, data):
        self.db.docs[ref.path] = dict(data)


class Client:
    """Just enough of a Firestore client for a counter transaction and a document read."""

    def __init__(self):
        self.docs = {}
        self.transactions = 0
        self.lock = threading.Lock()

    def collection(self, name):
        client = self

        class Collection:
            def document(self, doc_id):
                return Ref(client, f"{name}/{doc_id}")
        return Collection()

    def transaction(self):
        self.transactions += 1
        return Transaction(self)


def run_serially(client, monkeypatch):
    """Stand in for firestore.transactional: one transaction at a time, as a commit would order them."""
    def transactional(fn):
        def run(transaction):
            with client.lock:
                return fn(transaction)
        return run
    monkeypatch.setattr(firestore, "transactional", transactional)


def test_first_number_is_one(monkeypatch):
    client = Client()
    run_serially(client, monkeypatch)
    store = FirestoreFusionStore(client=client)
    assert store.next_incident_number() == 1
    assert client.docs["counters/incidents"] == {"value": 1}
    assert store.next_incident_number() == 2
    assert client.transactions == 2


def test_counter_continues_from_the_stored_value(monkeypatch):
    client = Client()
    client.docs["counters/incidents"] = {"value": 9}
    run_serially(client, monkeypatch)
    assert FirestoreFusionStore(client=client).next_incident_number() == 10


def test_concurrent_callers_never_share_a_number(monkeypatch):
    client = Client()
    run_serially(client, monkeypatch)
    store = FirestoreFusionStore(client=client)
    numbers = []
    threads = [threading.Thread(target=lambda: numbers.append(store.next_incident_number())) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(numbers) == list(range(1, 21))


def test_volunteer_name_is_read_from_the_volunteer_record():
    client = Client()
    client.docs["volunteers/uid_dedi"] = {"displayName": "Pak Dedi", "fcmTokens": []}
    store = FirestoreFusionStore(client=client)
    assert store.volunteer_name("uid_dedi") == "Pak Dedi"
    assert store.volunteer_name("uid_unknown") is None
    client.docs["volunteers/uid_x"] = {"fcmTokens": []}
    assert store.volunteer_name("uid_x") is None


def test_recent_leads_asks_for_one_range_on_acq_at():
    asked = []

    class Doc:
        id = "lead_1"

        def to_dict(self):
            return {"kind": "firms_hotspot", "acqAt": "2026-10-13T07:10:00.000Z"}

    class Query:
        def stream(self):
            return iter([Doc()])

    class Leads:
        def where(self, field, op, value):
            asked.append((field, op, value))
            return Query()

    class Db:
        def collection(self, name):
            assert name == "leads"
            return Leads()

    leads = FirestoreFusionStore(client=Db()).recent_leads("2026-10-12T00:00:00.000Z")
    assert asked == [("acqAt", ">=", "2026-10-12T00:00:00.000Z")]
    assert leads == [{"kind": "firms_hotspot", "acqAt": "2026-10-13T07:10:00.000Z", "id": "lead_1"}]


def test_apply_writes_the_join_record_with_the_incident():
    from fusion.rules import Plan

    writes = []

    class Batch:
        def set(self, ref, doc):
            writes.append((ref, doc["id"]))

        def commit(self):
            writes.append("commit")

    class Db:
        def batch(self):
            return Batch()

        def collection(self, name):
            return type("C", (), {"document": lambda self, doc_id: (name, doc_id)})()

    plan = Plan(incident={"id": "inc_1"}, join={"id": "obs_1", "incidentId": "inc_1"})
    FirestoreFusionStore(client=Db()).apply(plan)
    assert writes == [(("incidents", "inc_1"), "inc_1"), (("observation_joins", "obs_1"), "obs_1"), "commit"]
