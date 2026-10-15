"""Reads for spotter, plus writes to its own collections only.

Writes go to `photo_triage` and `incident_summaries`. Spotter never writes
incidents, observations, conflicts, or tasks.
"""
import os

DEFAULT_BUCKET = "ember-fire-commander-ember-photos"
STORAGE_TIMEOUT_SECONDS = 30


class PhotoMissing(Exception):
    """The photo object is not in the bucket."""


class MemorySpotterStore:
    def __init__(self, photos=None):
        self.collections = {
            "observations": {}, "incidents": {}, "conflicts": {},
            "photo_triage": {}, "incident_summaries": {},
        }
        self.photos = photos or {}
        self.reads = []

    def get(self, collection, doc_id):
        found = self.collections[collection].get(doc_id)
        return dict(found, id=doc_id) if found else None

    def observations_for(self, ids):
        return [self.get("observations", i) for i in ids if i in self.collections["observations"]]

    def triages_for(self, ids):
        return [dict(self.collections["photo_triage"][i]) for i in ids if i in self.collections["photo_triage"]]

    def photo_size(self, path):
        if path not in self.photos:
            raise PhotoMissing(path)
        return len(self.photos[path])

    def read_photo(self, path):
        self.reads.append(path)
        if path not in self.photos:
            raise PhotoMissing(path)
        return self.photos[path]

    def put(self, collection, doc):
        self.collections[collection][doc["id"]] = dict(doc)


class FirestoreSpotterStore:
    def __init__(self, db=None, storage_client=None):
        self._db_client = db
        self._storage = storage_client

    def _db(self):
        if self._db_client is None:
            from google.cloud import firestore

            self._db_client = firestore.Client(
                project=os.getenv("GOOGLE_CLOUD_PROJECT") or None,
                database=os.environ["FIRESTORE_DATABASE"],
            )
        return self._db_client

    def get(self, collection, doc_id):
        snapshot = self._db().collection(collection).document(doc_id).get()
        if not snapshot.exists:
            return None
        data = snapshot.to_dict()
        data.setdefault("id", snapshot.id)
        return data

    def _get_all(self, collection, ids):
        if not ids:
            return []
        db = self._db()
        refs = [db.collection(collection).document(i) for i in ids]
        out = []
        for snapshot in db.get_all(refs):
            if snapshot.exists:
                data = snapshot.to_dict()
                data.setdefault("id", snapshot.id)
                out.append(data)
        return out

    def observations_for(self, ids):
        return self._get_all("observations", ids)

    def triages_for(self, ids):
        return self._get_all("photo_triage", ids)

    def _blob(self, path):
        if self._storage is None:
            from google.cloud import storage

            self._storage = storage.Client()
        bucket = os.getenv("PHOTO_BUCKET", "").strip() or DEFAULT_BUCKET
        return self._storage.bucket(bucket).blob(path)

    def photo_size(self, path):
        """Size in bytes from object metadata, without downloading the photo."""
        from google.api_core.exceptions import NotFound

        blob = self._blob(path)
        try:
            blob.reload(timeout=STORAGE_TIMEOUT_SECONDS)
        except NotFound as exc:
            raise PhotoMissing(path) from exc
        return blob.size or 0

    def read_photo(self, path):
        from google.api_core.exceptions import NotFound

        try:
            return self._blob(path).download_as_bytes(timeout=STORAGE_TIMEOUT_SECONDS)
        except NotFound as exc:
            raise PhotoMissing(path) from exc

    def put(self, collection, doc):
        self._db().collection(collection).document(doc["id"]).set(doc)


_store = None


def get_store():
    global _store
    if _store is None:
        _store = FirestoreSpotterStore()
    return _store
