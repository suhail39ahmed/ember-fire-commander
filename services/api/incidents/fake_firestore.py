"""In-memory stand-in for the Firestore calls the incident routes make.

Used by the tests only. Writes made inside a transaction are applied when
it commits, so a rejected decision leaves no partial write behind.
"""
import copy
import itertools


class FakeSnapshot:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = copy.deepcopy(data)
        self.exists = data is not None

    def to_dict(self):
        return copy.deepcopy(self._data)


class FakeRef:
    def __init__(self, db, collection, doc_id):
        self._db = db
        self._collection = collection
        self.id = doc_id

    def get(self, transaction=None):
        return FakeSnapshot(self.id, self._db.data[self._collection].get(self.id))

    def set(self, data):
        self._db.data[self._collection][self.id] = copy.deepcopy(data)


class FakeQuery:
    def __init__(self, db, collection, filters):
        self._db = db
        self._collection = collection
        self._filters = filters

    def where(self, filter):
        return FakeQuery(self._db, self._collection, self._filters + [filter])

    def stream(self):
        for doc_id, data in list(self._db.data[self._collection].items()):
            if all(_matches(data, f) for f in self._filters):
                yield FakeSnapshot(doc_id, data)


def _matches(data, field_filter):
    value = data.get(field_filter.field_path)
    if field_filter.op_string == "==":
        return value == field_filter.value
    if field_filter.op_string == "array_contains":
        return field_filter.value in (value or [])
    raise NotImplementedError(field_filter.op_string)


class FakeCollection(FakeQuery):
    def __init__(self, db, name):
        super().__init__(db, name, [])

    def document(self, doc_id=None):
        if doc_id is None:
            doc_id = f"{self._collection}_{next(self._db.ids)}"
        return FakeRef(self._db, self._collection, doc_id)


class FakeTransaction:
    def __init__(self, db):
        self._db = db
        self._writes = []

    def set(self, ref, data):
        self._writes.append(("set", ref, copy.deepcopy(data)))

    def update(self, ref, changes):
        self._writes.append(("update", ref, copy.deepcopy(changes)))

    def commit(self):
        for kind, ref, data in self._writes:
            docs = self._db.data[ref._collection]
            if kind == "set":
                docs[ref.id] = data
            else:
                if ref.id not in docs:
                    raise KeyError(ref.id)
                docs[ref.id].update(data)
        self._db.commits += 1


class FakeFirestore:
    def __init__(self):
        self.data = {}
        self.ids = itertools.count(1)
        self.commits = 0

    def collection(self, name):
        self.data.setdefault(name, {})
        return FakeCollection(self, name)

    def run_transaction(self, fn):
        transaction = FakeTransaction(self)
        result = fn(transaction)
        transaction.commit()
        return result

    def add(self, collection, doc_id, data):
        self.collection(collection)
        self.data[collection][doc_id] = copy.deepcopy(data)
