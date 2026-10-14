"""Where ingest writes. Collections it owns: leads, weather, psi, ingestRuns.

It never writes incidents, observations, tasks or audit, and it never deletes.
"""
from __future__ import annotations

import copy

# Fields a person (or a later service) may change on a lead; ingest never overwrites them.
HUMAN_OWNED = ("status", "firstSeenAt", "verifiedBy", "verifiedAt", "incidentId")


def merge_lead(existing: dict | None, fresh: dict, *, now: str, run_id: str) -> dict:
    doc = dict(fresh, lastSeenAt=now, ingestRunId=run_id)
    if existing is None:
        doc.update(status="to_verify", firstSeenAt=now)
        return doc
    for key in HUMAN_OWNED:
        if key in existing:
            doc[key] = existing[key]
    return doc


class MemoryStore:
    """In-memory store for tests and --dry-run."""

    def __init__(self, seed: dict | None = None):
        self.collections: dict[str, dict[str, dict]] = copy.deepcopy(seed or {})

    def get(self, collection: str, doc_id: str):
        return copy.deepcopy(self.collections.get(collection, {}).get(doc_id))

    def put(self, collection: str, doc_id: str, doc: dict) -> None:
        self.collections.setdefault(collection, {})[doc_id] = copy.deepcopy(doc)

    def upsert_leads(self, leads: list[dict], *, now: str, run_id: str) -> int:
        for lead in leads:
            self.put("leads", lead["id"], merge_lead(self.get("leads", lead["id"]), lead, now=now, run_id=run_id))
        return len(leads)


class FirestoreStore:
    def __init__(self, project: str, database: str):
        from google.cloud import firestore

        self._db = firestore.Client(project=project or None, database=database)

    def put(self, collection: str, doc_id: str, doc: dict) -> None:
        self._db.collection(collection).document(doc_id).set(doc)

    def upsert_leads(self, leads: list[dict], *, now: str, run_id: str) -> int:
        col = self._db.collection("leads")
        for start in range(0, len(leads), 400):  # batch limit is 500 writes
            chunk = leads[start:start + 400]
            refs = [col.document(lead["id"]) for lead in chunk]
            existing = {s.id: s.to_dict() for s in self._db.get_all(refs) if s.exists}
            batch = self._db.batch()
            for ref, lead in zip(refs, chunk):
                batch.set(ref, merge_lead(existing.get(lead["id"]), lead, now=now, run_id=run_id))
            batch.commit()
        return len(leads)
