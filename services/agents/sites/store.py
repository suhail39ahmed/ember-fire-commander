"""Firestore access for the watch. Writes only `sites`, `sites_meta` and `audit`."""
import os

from sites.watch import ACTIVE_STATUSES

IN_QUERY_LIMIT = 30  # Firestore `in` accepts at most 30 values
SCAN_META = ("sites_meta", "scan")


def _chunks(items, size=IN_QUERY_LIMIT):
    items = list(items)
    for start in range(0, len(items), size):
        yield items[start:start + size]


class MemorySitesStore:
    def __init__(self):
        self.collections = {
            "incidents": {}, "observations": {}, "leads": {}, "sites": {}, "audit": {},
            "sites_meta": {},
        }
        self._n = 0

    def new_id(self, collection):
        self._n += 1
        return f"{collection[:3]}_{self._n:03d}"

    def _all(self, collection):
        return [dict(v, id=k) for k, v in self.collections[collection].items()]

    def extinguished_incidents(self):
        return [i for i in self._all("incidents") if i.get("status") == "extinguished"]

    def extinguished_times(self, incident_ids):
        """Latest `incident.extinguish` time per incident id, for the ids that have one."""
        wanted = set(incident_ids)
        times = {}
        for a in self._all("audit"):
            if a.get("action") == "incident.extinguish" and a.get("targetId") in wanted:
                times[a["targetId"]] = max(a["at"], times.get(a["targetId"], ""))
        return times

    def active_sites(self):
        return [s for s in self._all("sites") if s.get("status") in ACTIVE_STATUSES]

    def site_ids(self):
        return set(self.collections["sites"])

    def last_scanned_at(self):
        return self.collections["sites_meta"].get(SCAN_META[1], {}).get("lastScannedAt")

    def set_last_scanned_at(self, at):
        self.collections["sites_meta"][SCAN_META[1]] = {"lastScannedAt": at}

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

    def extinguished_times(self, incident_ids):
        """Latest `incident.extinguish` time per incident id, for the ids that have one.

        One query per 30 ids instead of one per incident. Equality and `in`
        filters only, so no composite index is needed.
        """
        times = {}
        audit = self._db().collection("audit")
        for chunk in _chunks(incident_ids):
            query = audit.where("action", "==", "incident.extinguish").where("targetId", "in", chunk)
            for row in self._docs(query):
                times[row["targetId"]] = max(row["at"], times.get(row["targetId"], ""))
        return times

    def active_sites(self):
        return self._docs(self._db().collection("sites").where("status", "in", list(ACTIVE_STATUSES)))

    def site_ids(self):
        """Ids of every remembered site (document ids only), so expired ones are not remembered again."""
        return {snapshot.id for snapshot in self._db().collection("sites").select([]).stream()}

    def last_scanned_at(self):
        snapshot = self._db().collection(SCAN_META[0]).document(SCAN_META[1]).get()
        return (snapshot.to_dict() or {}).get("lastScannedAt") if snapshot.exists else None

    def set_last_scanned_at(self, at):
        self._db().collection(SCAN_META[0]).document(SCAN_META[1]).set({"lastScannedAt": at})

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
