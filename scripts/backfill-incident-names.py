#!/usr/bin/env python3
"""Give incidents that have no `name` or `area` the readable ones, with the same code fusion uses.

Dry run by default: it prints what it would write and changes nothing. Pass --apply to write.

  python scripts/backfill-incident-names.py            # dry run
  python scripts/backfill-incident-names.py --apply    # write

Rules:
- An incident that already has a `name` keeps it. An incident that already has an `area` keeps it.
- A missing `area` is the place part of an existing name, else the nearest known town, else a
  coordinate label (services/agents/fusion/places.py, the same code as intake).
- A missing `name` is "<area> · <reporter> · #<n>". The reporter is the earliest report's
  `volunteerName`, else `volunteers/{uid}.displayName`, and is left out when neither exists.
- The number comes from `counters/incidents`, taken inside a transaction per incident, in the order
  of each incident's earliest report. The transaction re-reads the incident and skips it when
  something named it in the meantime.

Needs Application Default Credentials for the project and these variables (same as the services):
  GOOGLE_CLOUD_PROJECT   default ember-fire-commander
  FIRESTORE_DATABASE     default ember-db
"""
import argparse
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "services", "agents"))

from fusion.places import clean_reporter, place_label  # noqa: E402

COUNTER_COLLECTION = "counters"
COUNTER_DOC = "incidents"
SEPARATOR = " \u00b7 "


def _text(value):
    return value.strip() if isinstance(value, str) and value.strip() else None


def area_from(incident):
    """The area an incident should have, or None when it already has one."""
    if _text(incident.get("area")):
        return None
    name = _text(incident.get("name"))
    head = name.split(SEPARATOR)[0].strip() if name else ""
    if head and not (head.startswith("#") and head[1:].isdigit()):
        return head
    return place_label(incident["lat"], incident["lng"])


def build_name(area, reporter, number):
    parts = [area]
    reporter = clean_reporter(reporter)
    if reporter:
        parts.append(reporter)
    parts.append(f"#{number}")
    return SEPARATOR.join(parts)


def first_report(incident, observations):
    """The earliest report of the incident that can be read, or None."""
    own = [observations[i] for i in incident.get("observationIds") or [] if i in observations]
    own.sort(key=lambda o: (o.get("capturedAt") or "", o.get("id") or ""))
    return own[0] if own else None


def plan(incidents, observations, volunteer_name, counter_value):
    """What to write. `incidents` and `observations` are {id: dict}. Nothing is read or written here.

    Returns a list of {id, area, name, number, reporter}. `area` and `name` are None where the
    incident already has one. The numbers continue from `counter_value`, in the order of each
    incident's earliest report.
    """
    todo = []
    for incident_id, incident in incidents.items():
        if _text(incident.get("name")) and _text(incident.get("area")):
            continue
        if not all(isinstance(incident.get(k), (int, float)) for k in ("lat", "lng")):
            continue
        todo.append((incident_id, incident))
    todo.sort(key=lambda item: ((first_report(item[1], observations) or {}).get("capturedAt") or "~", item[0]))

    out, number = [], counter_value
    for incident_id, incident in todo:
        area = area_from(incident)
        name = None
        reporter = None
        if not _text(incident.get("name")):
            number += 1
            report = first_report(incident, observations)
            reporter = _text((report or {}).get("volunteerName")) or (
                volunteer_name(report["volunteerId"]) if report and report.get("volunteerId") else None
            )
            name = build_name(area or _text(incident.get("area")), reporter, number)
        out.append({"id": incident_id, "area": area, "name": name, "number": number if name else None, "reporter": reporter})
    return out


class MemoryStore:
    """In-memory stand-in with the same calls as the Firestore store. Used by the tests."""

    def __init__(self, incidents=None, observations=None, volunteers=None, counter=0):
        self.incidents = incidents or {}
        self.observations = observations or {}
        self.volunteers = volunteers or {}
        self.counter = counter

    def load(self):
        return self.incidents, self.observations, self.counter

    def volunteer_name(self, volunteer_id):
        return _text((self.volunteers.get(volunteer_id) or {}).get("displayName"))

    def write(self, item):
        """Name one incident unless something named it already. Returns what was written, or None."""
        incident = self.incidents[item["id"]]
        changes = {}
        if item["area"] and not _text(incident.get("area")):
            changes["area"] = item["area"]
        if item["name"] and not _text(incident.get("name")):
            self.counter += 1
            changes["name"] = build_name(item["area"] or _text(incident.get("area")), item["reporter"], self.counter)
        incident.update(changes)
        return changes or None


class FirestoreStore:
    def __init__(self):
        from google.cloud import firestore

        self._firestore = firestore
        self.db = firestore.Client(
            project=os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
            database=os.getenv("FIRESTORE_DATABASE", "ember-db"),
        )

    def load(self):
        incidents = {s.id: s.to_dict() or {} for s in self.db.collection("incidents").stream()}
        wanted = [i for inc in incidents.values() for i in inc.get("observationIds") or [] if isinstance(i, str)]
        observations = {}
        for start in range(0, len(wanted), 100):
            refs = [self.db.collection("observations").document(i) for i in wanted[start:start + 100]]
            for snap in self.db.get_all(refs):
                if snap.exists:
                    observations[snap.id] = (snap.to_dict() or {}) | {"id": snap.id}
        counter = (self.db.collection(COUNTER_COLLECTION).document(COUNTER_DOC).get().to_dict() or {}).get("value") or 0
        return incidents, observations, counter

    def volunteer_name(self, volunteer_id):
        snap = self.db.collection("volunteers").document(volunteer_id).get()
        return _text((snap.to_dict() or {}).get("displayName")) if snap.exists else None

    def write(self, item):
        firestore = self._firestore
        incident_ref = self.db.collection("incidents").document(item["id"])
        counter_ref = self.db.collection(COUNTER_COLLECTION).document(COUNTER_DOC)

        def run(transaction):
            incident = incident_ref.get(transaction=transaction).to_dict() or {}
            changes = {}
            if item["area"] and not _text(incident.get("area")):
                changes["area"] = item["area"]
            if item["name"] and not _text(incident.get("name")):
                value = ((counter_ref.get(transaction=transaction).to_dict() or {}).get("value") or 0) + 1
                transaction.set(counter_ref, {"value": value})
                changes["name"] = build_name(item["area"] or _text(incident.get("area")), item["reporter"], value)
            if changes:
                transaction.update(incident_ref, changes)
            return changes or None

        return firestore.transactional(run)(self.db.transaction())


def run(store, apply, out=print):
    incidents, observations, counter = store.load()
    items = plan(incidents, observations, store.volunteer_name, counter)
    if not items:
        out("Every incident already has a name and an area. Nothing to do.")
        return 0
    out(f"{'APPLY' if apply else 'DRY RUN'}: {len(items)} incident(s) to update. counters/incidents is {counter}.")
    for item in items:
        shown = []
        if item["area"]:
            shown.append(f"area={item['area']!r}")
        if item["name"]:
            shown.append(f"name={item['name']!r}")
        out(f"  {item['id']}: " + ", ".join(shown))
    if not apply:
        out("Nothing was written. Run again with --apply to write these.")
        return len(items)
    written = 0
    for item in items:
        if store.write(item):
            written += 1
    out(f"Wrote {written} incident(s); {len(items) - written} already had what the plan would have written.")
    return written


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the changes. Without it nothing is written")
    args = parser.parse_args(argv)
    run(FirestoreStore(), args.apply)


if __name__ == "__main__":
    main()
