"""Persist an immutable observation and its audit record."""
import os
import uuid
from datetime import datetime, timezone


def utc_now_iso():
    now = datetime.now(timezone.utc)
    text = now.strftime("%Y-%m-%dT%H:%M:%S")
    if now.microsecond:
        text += f".{now.microsecond // 1000:03d}"
    return text + "Z"


def assemble_record(prepared, volunteer_id, received_at):
    return {
        "volunteerId": volunteer_id,
        "capturedAt": prepared["capturedAt"],
        "receivedAt": received_at,
        "source": prepared["source"],
        "lat": prepared["lat"],
        "lng": prepared["lng"],
        "accuracyM": prepared["accuracyM"],
        "chip": prepared["chip"],
        "text": prepared["text"],
        "severity": prepared["severity"],
        "photoPath": None,
        "immutable": True,
    }


class MemoryObservationStore:
    """In-memory stand-in used by tests. Reads return the stored record."""

    def __init__(self):
        self.observations = {}
        self.audits = []

    def create(self, record):
        stored = dict(record)
        stored["id"] = uuid.uuid4().hex
        audit = {
            "id": uuid.uuid4().hex,
            "actorId": stored["volunteerId"],
            "action": "observation.create",
            "targetId": stored["id"],
            "at": stored["receivedAt"],
        }
        self.observations[stored["id"]] = dict(stored)
        self.audits.append(audit)
        return dict(stored)

    def get(self, observation_id):
        found = self.observations.get(observation_id)
        return dict(found) if found else None


class FirestoreObservationStore:
    """Write observations and audit rows to FIRESTORE_DATABASE."""

    def __init__(self, client=None):
        self._client = client

    def _db(self):
        if self._client is None:
            import firebase_admin
            from firebase_admin import firestore

            if not firebase_admin._apps:
                firebase_admin.initialize_app(options={
                    "projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
                })
            self._client = firestore.client(
                database_id=os.environ["FIRESTORE_DATABASE"],
            )
        return self._client

    def create(self, record):
        db = self._db()
        obs_ref = db.collection("observations").document()
        audit_ref = db.collection("audit").document()
        stored = dict(record)
        stored["id"] = obs_ref.id
        audit = {
            "id": audit_ref.id,
            "actorId": stored["volunteerId"],
            "action": "observation.create",
            "targetId": stored["id"],
            "at": stored["receivedAt"],
        }
        batch = db.batch()
        batch.set(obs_ref, stored)
        batch.set(audit_ref, audit)
        batch.commit()
        return stored

    def get(self, observation_id):
        snapshot = self._db().collection("observations").document(observation_id).get()
        if not snapshot.exists:
            return None
        return snapshot.to_dict()


_store = None


def get_store():
    global _store
    if _store is None:
        _store = FirestoreObservationStore()
    return _store
