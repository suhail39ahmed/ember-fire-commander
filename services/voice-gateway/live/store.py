"""Write one immutable live observation. The model never writes an incident."""
import os
import uuid

from live.digest import digest_for

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
