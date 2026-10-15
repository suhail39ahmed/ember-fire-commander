"""Load the state `fuse` needs and apply its plan.

`MemoryFusionStore` backs the tests. `FirestoreFusionStore` uses
FIRESTORE_DATABASE (ember-db) with the service account's own credentials.
"""
import os
import uuid

ACTIVE_STATUSES = ["open", "held", "verified"]
COUNTER_COLLECTION = "counters"
INCIDENT_COUNTER = "incidents"


def _apply(plan, put):
    put("incidents", plan.incident)
    if plan.conflict:
        put("conflicts", plan.conflict)
    for task in plan.tasks:
        put("tasks", task)
    for audit in plan.audits:
        put("audit", audit)


class MemoryFusionStore:
    def __init__(self):
        self.collections = {
            "observations": {}, "incidents": {}, "conflicts": {}, "tasks": {}, "audit": {},
            "weather": {}, "counters": {}, "volunteers": {},
        }

    def new_id(self, collection):
        return f"{collection[:3]}_{uuid.uuid4().hex[:12]}"

    def next_incident_number(self):
        counter = self.collections["counters"].setdefault(INCIDENT_COUNTER, {"value": 0})
        counter["value"] += 1
        return counter["value"]

    def volunteer_name(self, volunteer_id):
        return (self.collections["volunteers"].get(volunteer_id) or {}).get("displayName")

    def get_observation(self, observation_id):
        found = self.collections["observations"].get(observation_id)
        return dict(found) if found else None

    def load_state(self):
        from fusion.rules import State

        incidents = [
            dict(i) for i in self.collections["incidents"].values()
            if i.get("status") in ACTIVE_STATUSES
        ]
        ids = {oid for i in incidents for oid in i.get("observationIds") or []}
        incident_ids = {i["id"] for i in incidents}
        return State(
            incidents=incidents,
            observations={
                k: dict(v, id=k) for k, v in self.collections["observations"].items() if k in ids
            },
            tasks=[
                dict(t) for t in self.collections["tasks"].values()
                if t.get("incidentId") in incident_ids
            ],
            conflicts=[
                dict(c) for c in self.collections["conflicts"].values()
                if c.get("incidentId") in incident_ids and c.get("status") == "open"
            ],
        )

    def wind_kmh(self):
        return (self.collections["weather"].get("current") or {}).get("windKmh")

    def apply(self, plan):
        def put(collection, doc):
            self.collections[collection][doc["id"]] = dict(doc)
        _apply(plan, put)


class FirestoreFusionStore:
    def __init__(self, client=None):
        self._client = client

    def _db(self):
        if self._client is None:
            from google.cloud import firestore

            self._client = firestore.Client(
                project=os.getenv("GOOGLE_CLOUD_PROJECT") or None,
                database=os.environ["FIRESTORE_DATABASE"],
            )
        return self._client

    def new_id(self, collection):
        return self._db().collection(collection).document().id

    def next_incident_number(self):
        """Take the next number from `counters/incidents` in a transaction.

        Two intakes that create an incident at the same time cannot get the same
        number: the second transaction retries on the committed counter.
        """
        from google.cloud import firestore

        db = self._db()
        ref = db.collection(COUNTER_COLLECTION).document(INCIDENT_COUNTER)

        def take(transaction):
            snapshot = ref.get(transaction=transaction)
            value = ((snapshot.to_dict() or {}).get("value") or 0) + 1
            transaction.set(ref, {"value": value})
            return value

        return firestore.transactional(take)(db.transaction())

    def volunteer_name(self, volunteer_id):
        snapshot = self._db().collection("volunteers").document(volunteer_id).get()
        return (snapshot.to_dict() or {}).get("displayName") if snapshot.exists else None

    def get_observation(self, observation_id):
        snapshot = self._db().collection("observations").document(observation_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict()
        data.setdefault("id", snapshot.id)
        return data

    def _docs(self, query):
        out = []
        for snapshot in query.stream():
            data = snapshot.to_dict()
            data.setdefault("id", snapshot.id)
            out.append(data)
        return out

    def load_state(self):
        from fusion.rules import State

        db = self._db()
        incidents = self._docs(db.collection("incidents").where("status", "in", ACTIVE_STATUSES))
        incident_ids = {i["id"] for i in incidents}
        observation_ids = sorted({o for i in incidents for o in i.get("observationIds") or []})
        observations = {}
        if observation_ids:
            refs = [db.collection("observations").document(o) for o in observation_ids]
            for snapshot in db.get_all(refs):
                if snapshot.exists:
                    data = snapshot.to_dict()
                    data.setdefault("id", snapshot.id)
                    observations[snapshot.id] = data
        tasks = [
            t for t in self._docs(db.collection("tasks"))
            if t.get("incidentId") in incident_ids
        ]
        conflicts = [
            c for c in self._docs(db.collection("conflicts").where("status", "==", "open"))
            if c.get("incidentId") in incident_ids
        ]
        return State(incidents=incidents, observations=observations, tasks=tasks, conflicts=conflicts)

    def wind_kmh(self):
        snapshot = self._db().collection("weather").document("current").get()
        if not snapshot.exists:
            return None
        return (snapshot.to_dict() or {}).get("windKmh")

    def apply(self, plan):
        db = self._db()
        batch = db.batch()

        def put(collection, doc):
            batch.set(db.collection(collection).document(doc["id"]), doc)
        _apply(plan, put)
        batch.commit()


_store = None


def get_store():
    global _store
    if _store is None:
        _store = FirestoreFusionStore()
    return _store
