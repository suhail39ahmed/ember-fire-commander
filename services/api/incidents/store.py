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
