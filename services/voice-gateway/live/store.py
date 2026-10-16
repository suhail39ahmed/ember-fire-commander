"""Write one immutable live observation. The model never writes an incident."""
import os
import uuid

from live.digest import digest_for
from live.seat import apply_disconnect, apply_signal, parse_signal

SEVERITIES = ("none", "smoke", "small_flame", "large_flame", "unknown")
MAX_VOLUNTEER_NAME = 80


def utc_now_iso(moment=None):
    from datetime import datetime, timezone

    now = moment or datetime.now(timezone.utc)
    text = now.strftime("%Y-%m-%dT%H:%M:%S")
    if now.microsecond:
        text += f".{now.microsecond // 1000:03d}"
    return text + "Z"


def clean_volunteer_name(name):
    if not isinstance(name, str):
        return None
    text = " ".join(name.split())
    return text[:MAX_VOLUNTEER_NAME].strip() or None


def _number(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if number < low or number > high:
        return None
    return number


def phone_location(message):
    """Keep a location message only when it has phone coordinates and a time."""
    if not isinstance(message, dict):
        return None
    lat = _number(message.get("lat"), -90, 90)
    lng = _number(message.get("lng"), -180, 180)
    captured_at = message.get("capturedAt")
    if lat is None or lng is None or not isinstance(captured_at, str) or not captured_at:
        return None
    accuracy = message.get("accuracyM")
    if accuracy is not None:
        accuracy = _number(accuracy, 0, 1_000_000)
    return {"lat": lat, "lng": lng, "accuracyM": accuracy, "capturedAt": captured_at}


def observation_from_tool(user, location, args, received_at):
    """Build a live observation. Coordinates in the tool call are discarded."""
    if location is None:
        return None
    severity = args.get("severity") if isinstance(args, dict) else None
    if severity not in SEVERITIES:
        severity = "unknown"
    text = args.get("text") if isinstance(args, dict) else None
    if not isinstance(text, str):
        text = None
    record = {
        "volunteerId": user["id"],
        "capturedAt": location["capturedAt"],
        "receivedAt": received_at,
        "source": "live",
        "lat": location["lat"],
        "lng": location["lng"],
        "accuracyM": location["accuracyM"],
        "chip": None,
        "text": text,
        "severity": severity,
        "photoPath": None,
        "immutable": True,
    }
    name = clean_volunteer_name(user.get("displayName"))
    if name:
        record["volunteerName"] = name
    return record


class MemoryStore:
    """In-memory observations for tests and for a process with no Firestore."""

    def __init__(self):
        self.observations = []
        self.audits = []
        self.pending = {}
        self.incidents = []
        self.tasks = []
        self.conflicts = []
        self.live_seats = {}

    def create(self, record):
        stored = dict(record)
        stored["id"] = uuid.uuid4().hex
        self.observations.append(stored)
        self.audits.append({
            "actorId": stored["volunteerId"],
            "action": "observation.create",
            "targetId": stored["id"],
            "at": stored["receivedAt"],
        })
        self.pending[stored["id"]] = True
        return stored

    def intake_done(self, observation_id):
        self.pending.pop(observation_id, None)

    def tasks_for(self, user):
        if user.get("role") != "volunteer":
            return []
        return [item for item in self.tasks if item.get("volunteerId") == user.get("id")]

    def digest(self, user, now):
        return digest_for(
            user, self.incidents, self.tasks, self.observations, now, self.conflicts,
        )

    def report_signal(self, user, signal, now):
        """Update signal on digest incidents; drop the seat when the holder is below 3G."""
        signal = parse_signal(signal)
        if signal is None:
            return []
        digest = self.digest(user, now)
        dropped = []
        for summary in digest.get("incidents") or []:
            incident_id = summary.get("id")
            if not incident_id:
                continue
            seat = dict(self.live_seats.get(incident_id) or {
                "incidentId": incident_id,
                "status": "free",
                "holderId": None,
                "lastDrop": None,
                "volunteers": {},
            })
            updated, action = apply_signal(seat, user["id"], signal, now)
            if updated is None:
                continue
            self.live_seats[incident_id] = updated
            if action:
                self.audits.append({
                    "actorId": "code",
                    "action": action,
                    "targetId": incident_id,
                    "at": now,
                })
                dropped.append(incident_id)
        return dropped

    def holder_disconnect(self, user, now, last_signal=None):
        """Free any seat this volunteer holds."""
        dropped = []
        for incident_id, seat in list(self.live_seats.items()):
            updated, action = apply_disconnect(seat, user["id"], now, last_signal or "unknown")
            if updated is None:
                continue
            self.live_seats[incident_id] = updated
            if action:
                self.audits.append({
                    "actorId": "code",
                    "action": action,
                    "targetId": incident_id,
                    "at": now,
                })
                dropped.append(incident_id)
        return dropped


class FirestoreStore:
    """Write observations to FIRESTORE_DATABASE and read the caller's digest."""

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
            self._client = firestore.client(database_id=os.environ["FIRESTORE_DATABASE"])
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
        pending = {
            "id": obs_ref.id,
            "createdAt": stored["receivedAt"],
            "attemptedAt": stored["receivedAt"],
            "attempts": 0,
        }
        batch = db.batch()
        batch.set(obs_ref, stored)
        batch.set(audit_ref, audit)
        batch.set(db.collection("intakePending").document(obs_ref.id), pending)
        batch.commit()
        return stored

    def intake_done(self, observation_id):
        self._db().collection("intakePending").document(observation_id).delete()

    def tasks_for(self, user):
        if user.get("role") != "volunteer":
            return []
        return self._where("tasks", "volunteerId", "==", user["id"])

    def digest(self, user, now):
        if user.get("role") == "supervisor":
            incidents = self._where("incidents", "status", "in", list(("open", "held", "verified")))
            return digest_for(user, incidents, [], [], now, [])
        uid = user["id"]
        tasks = self.tasks_for(user)
        observations = self._where("observations", "volunteerId", "==", uid)
        incident_ids = [item.get("incidentId") for item in tasks if item.get("incidentId")]
        incidents = self._get_many("incidents", incident_ids)
        incidents += self._where("incidents", "withdraw.volunteerIds", "array_contains", uid)
        obs_ids = [item["id"] for item in observations if item.get("id")]
        conflicts = []
        for chunk in _chunks(obs_ids, 30):
            incidents += self._where("incidents", "observationIds", "array_contains_any", chunk)
            conflicts += self._where("conflicts", "observationIds", "array_contains_any", chunk)
        return digest_for(user, _unique(incidents), tasks, observations, now, conflicts)

    def report_signal(self, user, signal, now):
        """Update signal on digest incidents in a transaction so concurrent writers do not clobber each other."""
        signal = parse_signal(signal)
        if signal is None:
            return []
        digest = self.digest(user, now)
        dropped = []
        db = self._db()
        for summary in digest.get("incidents") or []:
            incident_id = summary.get("id")
            if not incident_id:
                continue
            if self._txn_report_signal(db, incident_id, user["id"], signal, now):
                dropped.append(incident_id)
        return dropped

    def holder_disconnect(self, user, now, last_signal=None):
        """Free seats this volunteer holds. Each seat update runs in a transaction."""
        dropped = []
        db = self._db()
        from google.cloud.firestore_v1.base_query import FieldFilter
        # Find candidates outside the transaction; each write re-reads holderId inside.
        seat_ids = [
            snap.id for snap in db.collection("liveSeats").where(
                filter=FieldFilter("holderId", "==", user["id"])
            ).stream()
        ]
        for incident_id in seat_ids:
            if self._txn_holder_disconnect(db, incident_id, user["id"], now, last_signal or "unknown"):
                dropped.append(incident_id)
        return dropped

    def _txn_report_signal(self, db, incident_id, volunteer_id, signal, now):
        from google.cloud import firestore

        ref = db.collection("liveSeats").document(incident_id)
        dropped = False

        @firestore.transactional
        def run(transaction):
            nonlocal dropped
            snap = ref.get(transaction=transaction)
            seat = snap.to_dict() if snap.exists else {
                "incidentId": incident_id,
                "status": "free",
                "holderId": None,
                "lastDrop": None,
                "volunteers": {},
            }
            updated, action = apply_signal(seat, volunteer_id, signal, now)
            if updated is None:
                return
            transaction.set(ref, updated)
            if action:
                audit_ref = db.collection("audit").document()
                transaction.set(audit_ref, {
                    "id": audit_ref.id,
                    "actorId": "code",
                    "action": action,
                    "targetId": incident_id,
                    "at": now,
                })
                dropped = True

        run(db.transaction())
        return dropped

    def _txn_holder_disconnect(self, db, incident_id, volunteer_id, now, last_signal):
        from google.cloud import firestore

        ref = db.collection("liveSeats").document(incident_id)
        dropped = False

        @firestore.transactional
        def run(transaction):
            nonlocal dropped
            snap = ref.get(transaction=transaction)
            if not snap.exists:
                return
            updated, action = apply_disconnect(
                snap.to_dict() or {}, volunteer_id, now, last_signal,
            )
            if updated is None:
                return
            transaction.set(ref, updated)
            if action:
                audit_ref = db.collection("audit").document()
                transaction.set(audit_ref, {
                    "id": audit_ref.id,
                    "actorId": "code",
                    "action": action,
                    "targetId": incident_id,
                    "at": now,
                })
                dropped = True

        run(db.transaction())
        return dropped

    def _where(self, collection, field, op, value):
        from google.cloud.firestore_v1.base_query import FieldFilter

        query = self._db().collection(collection).where(filter=FieldFilter(field, op, value))
        return [_with_id(snap) for snap in query.stream()]

    def _get_many(self, collection, doc_ids):
        doc_ids = [doc_id for doc_id in dict.fromkeys(doc_ids) if doc_id]
        if not doc_ids:
            return []
        refs = [self._db().collection(collection).document(doc_id) for doc_id in doc_ids]
        return [_with_id(snap) for snap in self._db().get_all(refs) if snap.exists]


def _chunks(values, size):
    for start in range(0, len(values), size):
        yield values[start:start + size]


def _unique(records):
    found = {}
    for item in records:
        if item.get("id"):
            found[item["id"]] = item
    return list(found.values())


def _with_id(snapshot):
    data = snapshot.to_dict() or {}
    data["id"] = snapshot.id
    return data
