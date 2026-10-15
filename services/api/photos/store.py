"""Upload records in Firestore (database FIRESTORE_DATABASE, default ember-db).

A record keeps the private object path, never a URL. A photo
observation checks its photoPath against the caller's records with was_issued.
"""
import os

from google.cloud import firestore

COLLECTION = "photoUploads"

_client = None


def _db():
    global _client
    if _client is None:
        _client = firestore.Client(
            project=os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
            database=os.getenv("FIRESTORE_DATABASE", "ember-db"),
        )
    return _client


def save_upload(record):
    """Store one upload record. Returns the record id."""
    ref = _db().collection(COLLECTION).document()
    ref.set(record)
    return ref.id


def was_issued(volunteer_id, photo_path):
    """True when ember-api issued this exact path to this volunteer."""
    query = (
        _db()
        .collection(COLLECTION)
        .where("volunteerId", "==", volunteer_id)
        .where("photoPath", "==", photo_path)
        .limit(1)
    )
    return any(True for _ in query.stream())
