"""Firestore access for the watch. Writes only `sites` and `audit`."""
import os


class MemorySitesStore:
    def __init__(self):
        self.collections = {
            "incidents": {}, "observations": {}, "leads": {}, "sites": {}, "audit": {},
        }
        self._n = 0

    def new_id(self, collection):
        self._n += 1
        return f"{collection[:3]}_{self._n:03d}"

    def _all(self, collection):
        return [dict(v, id=k) for k, v in self.collections[collection].items()]

    def extinguished_incidents(self):
        return [i for i in self._all("incidents") if i.get("status") == "extinguished"]

    def extinguished_at(self, incident_id):
        times = [
            a["at"] for a in self._all("audit")
            if a.get("action") == "incident.extinguish" and a.get("targetId") == incident_id
        ]
        return max(times) if times else None

    def sites(self):
        return self._all("sites")

    def observations_since(self, since):
        return [o for o in self._all("observations") if (o.get("receivedAt") or "") > since]

    def leads_since(self, since):
        return [lead for lead in self._all("leads") if (lead.get("firstSeenAt") or "") > since]

    def put(self, collection, doc):
        self.collections[collection][doc["id"]] = dict(doc)


class FirestoreSitesStore:
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

    def _docs(self, query):
        out = []
        for snapshot in query.stream():
            data = snapshot.to_dict()
            data.setdefault("id", snapshot.id)
            out.append(data)
        return out

    def extinguished_incidents(self):
        return self._docs(self._db().collection("incidents").where("status", "==", "extinguished"))

    def extinguished_at(self, incident_id):
        rows = self._docs(
            self._db().collection("audit").where("targetId", "==", incident_id)
        )
        times = [r["at"] for r in rows if r.get("action") == "incident.extinguish"]
        return max(times) if times else None

    def sites(self):
        return self._docs(self._db().collection("sites"))

    def observations_since(self, since):
        return self._docs(self._db().collection("observations").where("receivedAt", ">", since))

    def leads_since(self, since):
        return self._docs(self._db().collection("leads").where("firstSeenAt", ">", since))

    def put(self, collection, doc):
        self._db().collection(collection).document(doc["id"]).set(doc)


_store = None


def get_store():
    global _store
    if _store is None:
        _store = FirestoreSitesStore()
    return _store
