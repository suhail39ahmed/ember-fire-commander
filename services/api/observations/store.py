"""Persist an immutable observation and its audit record."""
import hashlib
import os
import uuid
from datetime import datetime, timezone

from google.api_core.exceptions import AlreadyExists


def utc_now_iso():
    now = datetime.now(timezone.utc)
    text = now.strftime("%Y-%m-%dT%H:%M:%S")
    if now.microsecond:
        text += f".{now.microsecond // 1000:03d}"
    return text + "Z"


def observation_id_for(volunteer_id, client_id):
    """Stable document id for one volunteer's clientId, so a replay lands on the same document."""
    return hashlib.sha256(f"{volunteer_id}:{client_id}".encode()).hexdigest()


PENDING_COLLECTION = "intakePending"


def pending_record(observation_id, created_at):
    """Queue entry for an observation whose agents intake call has not succeeded yet."""
    return {
        "id": observation_id,
        "createdAt": created_at,
        "attemptedAt": created_at,
        "attempts": 0,
    }


def assemble_record(prepared, volunteer_id, received_at):
    record = {
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
        "photoPath": prepared.get("photoPath"),
        "immutable": True,
    }
    if prepared.get("clientId"):
        record["clientId"] = prepared["clientId"]
    return record


class MemoryObservationStore:
    """In-memory stand-in used by tests. Reads return the stored record."""

    def __init__(self):
        self.observations = {}
        self.audits = []
        self.pending = {}

    def create(self, record):
        """Return (stored, created). A repeated clientId returns the first record with created False."""
        stored = dict(record)
        if stored.get("clientId"):
            stored["id"] = observation_id_for(stored["volunteerId"], stored["clientId"])
            if stored["id"] in self.observations:
                return dict(self.observations[stored["id"]]), False
        else:
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
        self.pending[stored["id"]] = pending_record(stored["id"], stored["receivedAt"])
        return dict(stored), True

    def get(self, observation_id):
        found = self.observations.get(observation_id)
        return dict(found) if found else None

    def pending_intake(self, retry_before, limit):
        due = [p for p in self.pending.values() if p["attemptedAt"] <= retry_before]
        return [dict(p) for p in sorted(due, key=lambda p: p["attemptedAt"])[:limit]]

    def intake_done(self, observation_id):
        self.pending.pop(observation_id, None)

    def intake_failed(self, observation_id, at):
        item = self.pending.get(observation_id)
        if item:
            item["attempts"] += 1
            item["attemptedAt"] = at


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
        """Return (stored, created). A repeated clientId returns the first record with created False."""
        db = self._db()
        if record.get("clientId"):
            obs_id = observation_id_for(record["volunteerId"], record["clientId"])
            obs_ref = db.collection("observations").document(obs_id)
        else:
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
        # create() fails when the document exists, and then the audit row is not written either.
        batch.create(obs_ref, stored)
        batch.set(audit_ref, audit)
        # Removed once agents has taken the observation, see observations/notify.py.
        batch.set(db.collection(PENDING_COLLECTION).document(obs_ref.id), pending_record(obs_ref.id, stored["receivedAt"]))
        try:
            batch.commit()
        except AlreadyExists:
            return obs_ref.get().to_dict(), False
        return stored, True

    def pending_intake(self, retry_before, limit):
        """Queued observations last tried at or before retry_before, oldest first."""
        query = (
            self._db()
            .collection(PENDING_COLLECTION)
            .where("attemptedAt", "<=", retry_before)
            .order_by("attemptedAt")
            .limit(limit)
        )
        return [snapshot.to_dict() for snapshot in query.stream()]

    def intake_done(self, observation_id):
        self._db().collection(PENDING_COLLECTION).document(observation_id).delete()

    def intake_failed(self, observation_id, at):
        from google.cloud import firestore

        self._db().collection(PENDING_COLLECTION).document(observation_id).update({
            "attempts": firestore.Increment(1),
            "attemptedAt": at,
        })

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
