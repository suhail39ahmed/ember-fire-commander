"""Firestore access for incidents (database FIRESTORE_DATABASE, default ember-db).

Clients never touch Firestore. Only ember-api and ember-agents write here.
Every supervisor decision is written in one transaction with its audit record.
"""
import os

from google.cloud import firestore

INCIDENTS = "incidents"
CONFLICTS = "conflicts"
TASKS = "tasks"
OBSERVATIONS = "observations"
AUDIT = "audit"

_client = None


def db():
    global _client
    if _client is None:
        # Same client setup as observations/store.py, so both share one Firebase app.
        import firebase_admin
        from firebase_admin import firestore as admin_firestore

        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={
                "projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
            })
        _client = admin_firestore.client(
            database_id=os.getenv("FIRESTORE_DATABASE", "ember-db"),
        )
    return _client


def run_transaction(fn):
    """Run fn(transaction) in a Firestore transaction and return its result.

    Reads inside fn use ref.get(transaction=transaction) so a concurrent
    decision on the same task or incident retries instead of overwriting.
    """
    return firestore.transactional(fn)(db().transaction())


def where(collection, field, op, value):
    query = db().collection(collection).where(
        filter=firestore.FieldFilter(field, op, value)
    )
    return [snap for snap in query.stream()]


IN_QUERY_LIMIT = 30  # Firestore accepts at most 30 values in `in` and `array_contains_any`


def where_any(collection, field, op, values):
    """Run an `in` or `array_contains_any` query over any number of values.

    Firestore takes 30 values per query, so the values go out in chunks. A
    document that matches more than one chunk is returned once.
    """
    values = list(dict.fromkeys(values))
    found = {}
    for start in range(0, len(values), IN_QUERY_LIMIT):
        for snap in where(collection, field, op, values[start:start + IN_QUERY_LIMIT]):
            found[snap.id] = snap
    return list(found.values())


def get_many(collection, doc_ids):
    """Read many documents in one batched call. Returns {id: snapshot} for the ones that exist."""
    doc_ids = list(dict.fromkeys(doc_ids))
    if not doc_ids:
        return {}
    refs = [db().collection(collection).document(doc_id) for doc_id in doc_ids]
    return {snap.id: snap for snap in db().get_all(refs) if snap.exists}
