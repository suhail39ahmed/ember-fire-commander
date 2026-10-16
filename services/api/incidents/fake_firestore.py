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
        self._db.doc_reads.append(self._collection)
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
        self._db.queries.append((self._collection, [f.field_path for f in self._filters]))
        for doc_id, data in list(self._db.data[self._collection].items()):
            if all(_matches(data, f) for f in self._filters):
                yield FakeSnapshot(doc_id, data)


MULTI_VALUE_LIMIT = 30  # what Firestore accepts for `in` and `array_contains_any`


def _field(data, path):
    """Read a value by dotted path, such as `withdraw.volunteerIds`."""
    value = data
    for part in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _matches(data, field_filter):
    value = _field(data, field_filter.field_path)
    op = field_filter.op_string
    if op == "==":
        return value == field_filter.value
    if op == ">=":
        return value is not None and value >= field_filter.value
    if op == "array_contains":
        return field_filter.value in (value or [])
    if op in ("in", "array_contains_any"):
        if not field_filter.value or len(field_filter.value) > MULTI_VALUE_LIMIT:
            raise ValueError(f"{op} takes 1 to {MULTI_VALUE_LIMIT} values")
        if op == "in":
            return value in field_filter.value
        return bool(set(value or []) & set(field_filter.value))
    raise NotImplementedError(op)


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
        self.queries = []  # (collection, filtered fields) for every query that was run
        self.batch_reads = []  # (collection, document count) for each get_all call
        self.doc_reads = []  # collection of every single-document get

    def collection(self, name):
        self.data.setdefault(name, {})
        return FakeCollection(self, name)

    def get_all(self, refs):
        refs = list(refs)
        self.batch_reads.append((refs[0]._collection if refs else None, len(refs)))
        snaps = [FakeSnapshot(ref.id, self.data[ref._collection].get(ref.id)) for ref in refs]
        return snaps

    def run_transaction(self, fn):
        transaction = FakeTransaction(self)
        result = fn(transaction)
        transaction.commit()
        return result

    def add(self, collection, doc_id, data):
        self.collection(collection)
        self.data[collection][doc_id] = copy.deepcopy(data)
