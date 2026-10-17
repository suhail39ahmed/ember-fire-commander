"""Reads for the assist routes, plus writes to their own collections only.

Writes go to `incident_suggestions` and `observation_translations`. Assist never
writes incidents, observations, conflicts or tasks. It reuses the spotter
store for the reads both share (incidents, observations, photo reads).
"""
from spotter.store import FirestoreSpotterStore, MemorySpotterStore

# Cap on what one prompt reads: the newest tasks of the incident.
TASK_LIMIT = 40


class MemoryAssistStore(MemorySpotterStore):
    def __init__(self, photos=None):
        super().__init__(photos=photos)
        self.collections.update({
            "tasks": {}, "volunteers": {}, "weather": {},
            "incident_suggestions": {}, "observation_translations": {},
        })

    def tasks_for(self, incident_id):
        rows = [dict(t, id=i) for i, t in self.collections["tasks"].items() if t.get("incidentId") == incident_id]
        return sorted(rows, key=lambda t: t["id"])[:TASK_LIMIT]

    def volunteers_for(self, ids):
        return {i: dict(self.collections["volunteers"][i]) for i in ids if i in self.collections["volunteers"]}

    def weather(self):
        found = self.collections["weather"].get("current")
        return dict(found) if found else None


class FirestoreAssistStore(FirestoreSpotterStore):
    def tasks_for(self, incident_id):
        query = self._db().collection("tasks").where("incidentId", "==", incident_id)
        rows = []
        for snapshot in query.stream():
            data = snapshot.to_dict() or {}
            data.setdefault("id", snapshot.id)
            rows.append(data)
        return sorted(rows, key=lambda t: t["id"])[:TASK_LIMIT]

    def volunteers_for(self, ids):
        return {row["id"]: row for row in self._get_all("volunteers", list(ids))}

    def weather(self):
        snapshot = self._db().collection("weather").document("current").get()
        return (snapshot.to_dict() or None) if snapshot.exists else None


_store = None


def get_store():
    global _store
    if _store is None:
        _store = FirestoreAssistStore()
    return _store
