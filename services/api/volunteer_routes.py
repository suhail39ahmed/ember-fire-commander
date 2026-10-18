"""Volunteer-facing reads and writes that have no other home.

`crew_name_of` backs the crew line on GET /me. The routes here sit behind the same token check as every other
route, and a volunteer only ever acts for themselves: their own task, or an incident whose withdraw names them.
Each write commits the change and its audit row in one transaction, like the supervisor decisions do.
"""
import logging
import re

from flask import Blueprint, g, jsonify, request
from firebase_admin import auth as firebase_auth

from identity import AuthError
from photos.paths import owner_of
from incidents import rules, store
from incidents.errors import ApiError, conflict, error_response, not_found, validation
from config_route import read_demo_mode
from sms_config import sms_config

logger = logging.getLogger(__name__)

volunteer_bp = Blueprint("volunteer", __name__)

# What a volunteer can say when they cannot follow an instruction. The phone shows a label for each key (§6.5).
DECLINE_REASONS = ("unsafe", "too_far", "no_equipment", "other")
NOTE_MAX = 300
WITHDRAW_ANSWERS = "withdraw_answers"
ANSWER_STATES = ("safe", "stuck")
# Why a volunteer says a report from someone else is wrong. The phone shows a label for each key (§6.11).
FLAG_REASONS = ("no_fire", "duplicate", "old_photo", "wrong_place", "fake")
OBSERVATION_FLAGS = "observation_flags"


@volunteer_bp.errorhandler(ApiError)
def _handle_api_error(exc):
    return error_response(exc)


def read_profile(uid):
    """The volunteer's stored profile document, or {} when there is none."""
    snap = store.get_many(store.VOLUNTEERS, [uid]).get(uid)
    return (snap.to_dict() if snap else None) or {}


def crew_name_of(uid):
    """The crew written on this volunteer's profile, or None when there is none or it cannot be read."""
    try:
        crew = read_profile(uid).get("crewName")
    except Exception:  # the crew line is a label; /me must still answer if the profile read fails
        logger.warning("crew name read failed", exc_info=True)
        return None
    return crew.strip() if isinstance(crew, str) and crew.strip() else None


def profile_fields(profile):
    """Public profile allowlist. Raw phone numbers never leave this module."""
    def text(key):
        value = profile.get(key)
        return value.strip() if isinstance(value, str) and value.strip() else None

    def count(key):
        value = profile.get(key)
        return value if type(value) is int and value >= 0 else None

    phone = re.sub(r"\D", "", text("phone") or "")
    onboarding_complete = profile.get("onboardingComplete")
    if type(onboarding_complete) is not bool:
        # Older profiles with a phone and crew predate onboarding tracking.
        onboarding_complete = bool(text("phone") and text("crewName"))
    fields = {
        "crewName": text("crewName"),
        "area": text("area"),
        "roleLabel": text("roleLabel"),
        "supervisorName": text("supervisorName"),
        "phoneMasked": ("•••• " + phone[-4:]) if len(phone) > 4 else None,
        "onboardingComplete": onboarding_complete,
        "trainingDone": count("trainingDone"),
        "trainingTotal": count("trainingTotal"),
        "language": profile.get("language") if profile.get("language") in ("id", "en", "jv", "su", "ms") else None,
        "shareMyLocationWithCrew": profile.get("shareMyLocationWithCrew") if type(profile.get("shareMyLocationWithCrew")) is bool else True,
        "demoMode": read_demo_mode(),
    }
    display_name = text("displayName")
    if display_name:
        fields["displayName"] = display_name
    sms = sms_config(profile)
    if sms is not None:
        fields["sms"] = sms
    return fields


def profile_of(uid):
    try:
        profile = read_profile(uid)
    except Exception:
        logger.warning("profile read failed", exc_info=True)
        profile = {}
    return profile_fields(profile)


@volunteer_bp.route("/volunteers/register", methods=["POST"])
def register_volunteer():
    """Opt-in Google registration. The only role this endpoint can assign is volunteer."""
    return _register_role("volunteer")


@volunteer_bp.route("/supervisors/register", methods=["POST"])
def register_supervisor():
    """Opt-in Google registration for a new supervisor account."""
    return _register_role("supervisor")


def _register_role(role):
    record = firebase_auth.get_user(g.user["id"])
    claims = dict(record.custom_claims or {})
    # Check current server claims too: a stale token cannot replace an existing role.
    if g.user.get("role") not in (None, role) or claims.get("role") not in (None, "", role):
        raise AuthError(403, "forbidden", "This account already has another role")
    if request.get_data():
        raise validation("body", "registration does not accept profile or role fields")
    if claims.get("role") != role:
        firebase_auth.set_custom_user_claims(record.uid, claims | {"role": role})
    body = dict(g.user) | {"role": role}
    if role == "volunteer":
        body.update(profile_of(g.user["id"]))
    return jsonify(body), 200


@volunteer_bp.route("/me", methods=["PATCH"])
def patch_me():
    """Update the caller's volunteer profile and onboarding details."""
    _require_volunteer()
    body = _body()
    allowed = {"displayName", "phone", "area", "crewName", "onboardingComplete", "language", "shareMyLocationWithCrew"}
    if not body or body.keys() - allowed:
        raise validation("body", "send volunteer profile fields only")
    body = dict(body)
    for field, maximum in (("displayName", 80), ("area", 100), ("crewName", 100)):
        if field in body:
            value = body[field]
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
                raise validation(field, f"enter 1 to {maximum} characters")
            body[field] = value.strip()
    if "phone" in body:
        phone = body["phone"]
        if not isinstance(phone, str) or not re.fullmatch(r"\+[1-9]\d{7,14}", phone):
            raise validation("phone", "use an E.164 phone number")
    if "onboardingComplete" in body and type(body["onboardingComplete"]) is not bool:
        raise validation("onboardingComplete", "a boolean")
    if body.get("onboardingComplete") is True:
        required = {"displayName", "phone", "area", "crewName", "language"}
        if required - body.keys():
            raise validation("onboardingComplete", "complete the required account fields first")
    if "language" in body and body["language"] not in ("id", "en", "jv", "su", "ms"):
        raise validation("language", "use id, en, jv, su or ms")
    if "shareMyLocationWithCrew" in body and type(body["shareMyLocationWithCrew"]) is not bool:
        raise validation("shareMyLocationWithCrew", "a boolean")

    def run(transaction):
        ref = _ref(store.VOLUNTEERS, g.user["id"])
        snapshot = ref.get(transaction=transaction)
        profile = (snapshot.to_dict() or {}) if snapshot.exists else {}
        if snapshot.exists:
            transaction.update(ref, body)
        else:
            transaction.set(ref, body)
        return profile | body

    profile = store.run_transaction(run)
    return jsonify(dict(g.user) | profile_fields(profile)), 200


def _require_volunteer():
    if g.user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only a volunteer can do this")


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "validation_error", "Body must be a JSON object", {"body": "send a JSON object"})
    return body


def _ref(collection, doc_id):
    return store.db().collection(collection).document(doc_id)


def _audit(transaction, action, target_id, subject_id=None):
    audit_ref = store.db().collection(store.AUDIT).document()
    transaction.set(audit_ref, rules.audit_record(audit_ref.id, g.user["id"], action, target_id, subject_id))
    return audit_ref.id


def _own_sent_task(transaction, task_id):
    """The caller's own approved, non-withdraw task, read inside the transaction. Anyone else's task is unknown."""
    ref = _ref(store.TASKS, task_id)
    snapshot = ref.get(transaction=transaction)
    task = (snapshot.to_dict() or {}) if snapshot.exists else None
    if task is None or task.get("volunteerId") != g.user["id"]:
        raise not_found("task")
    if task.get("status") != "approved" or task.get("type") == "withdraw" or task.get("closedAt"):
        raise conflict("Only a sent instruction can be answered")
    return ref, task


def _task_body(task_id, task):
    task = dict(task)
    task["id"] = task_id
    return rules.with_receipt(rules.pick(task, rules.TASK_FIELDS))


@volunteer_bp.route("/tasks/<task_id>/accept", methods=["POST"])
def accept_task(task_id):
    """"Doing it": the volunteer says they will follow the instruction. Recorded once; a repeat writes nothing."""
    _require_volunteer()
    # Empty requests remain valid for older clients (including the joined screen).
    body = _body() if request.get_data() else {}
    response = body.get("response")
    if response is not None and response not in ("on_my_way", "starting_now"):
        raise validation("response", "use on_my_way or starting_now")
    note = body.get("note")
    if note is not None and not isinstance(note, str):
        raise validation("note", "a string or null")
    note = (note or "").strip()
    if len(note) > NOTE_MAX:
        raise validation("note", f"at most {NOTE_MAX} characters")

    def run(transaction):
        ref, task = _own_sent_task(transaction, task_id)
        if task.get("declinedAt"):
            raise conflict("This instruction was already declined")
        if task.get("acceptedAt"):
            return _task_body(task_id, task), None
        changes = {"acceptedAt": rules.now_iso(), "acceptResponse": response, "acceptNote": note or None}
        transaction.update(ref, changes)
        audit_id = _audit(transaction, "task.accept", task_id)
        return _task_body(task_id, task | changes), audit_id

    task, audit_id = store.run_transaction(run)
    return jsonify({"task": task, "auditId": audit_id}), 200


@volunteer_bp.post("/tasks/<task_id>/complete")
def complete_task(task_id):
    """Save the task's evidence and close it together; never run new-report intake."""
    _require_volunteer()
    from task_completion import submit
    result = submit(task_id, _body(), g.user)
    return jsonify(result), 200


@volunteer_bp.route("/tasks/<task_id>/decline", methods=["POST"])
def decline_task(task_id):
    """"Can't do it": the reason and an optional note go to the supervisor. The instruction itself is not changed."""
    _require_volunteer()
    body = _body()
    reason = body.get("reason")
    if reason not in DECLINE_REASONS:
        raise validation("reason", "use " + ", ".join(DECLINE_REASONS))
    note = body.get("note")
    if note is not None and not isinstance(note, str):
        raise validation("note", "a string or null")
    note = (note or "").strip()
    if len(note) > NOTE_MAX:
        raise validation("note", f"at most {NOTE_MAX} characters")

    def run(transaction):
        ref, task = _own_sent_task(transaction, task_id)
        if task.get("declinedAt"):
            return _task_body(task_id, task), None
        changes = {"declinedAt": rules.now_iso(), "declineReason": reason, "declineNote": note or None}
        transaction.update(ref, changes)
        audit_id = _audit(transaction, "task.decline", task_id)
        return _task_body(task_id, task | changes), audit_id

    task, audit_id = store.run_transaction(run)
    return jsonify({"task": task, "auditId": audit_id}), 200


def _number(body, field, low, high, required):
    value = body.get(field)
    if value is None:
        if required:
            raise validation(field, f"required, {low} to {high}")
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
        raise validation(field, f"a number, {low} to {high}")
    return value


@volunteer_bp.route("/incidents/<incident_id>/withdraw/location", methods=["POST"])
@volunteer_bp.route("/incidents/<incident_id>/withdraw/answer", methods=["POST"])
def answer_withdraw(incident_id):
    """A volunteer on an active withdraw says they are safe upwind, or that they cannot get out. Latest answer wins."""
    _require_volunteer()
    body = _body()
    state = body.get("state")
    location_only = request.path.endswith("/location")
    if state not in ANSWER_STATES and not location_only:
        raise validation("state", "use safe or stuck")
    lat = _number(body, "lat", -90, 90, required=False)
    lng = _number(body, "lng", -180, 180, required=False)
    accuracy = _number(body, "accuracyM", 0, 100000, required=False)
    if (lat is None) != (lng is None):
        raise validation("lng" if lat is not None else "lat", "send lat and lng together, or neither")
    uid = g.user["id"]

    def run(transaction):
        snapshot = _ref(store.INCIDENTS, incident_id).get(transaction=transaction)
        withdraw = ((snapshot.to_dict() or {}).get("withdraw") or {}) if snapshot.exists else {}
        # A volunteer who is not named on the withdraw gets the same answer as an unknown incident.
        if not snapshot.exists or uid not in (withdraw.get("volunteerIds") or []):
            raise not_found("incident")
        if not withdraw.get("active"):
            raise conflict("There is no active withdraw on this incident")
        from incidents import withdrawal
        session_id = withdrawal.key(withdraw)
        if session_id and body.get("sessionId") != session_id:
            raise conflict("This answer belongs to a different withdrawal")
        previous = (withdraw.get("answers") or {}).get(uid) or {}
        answer_state = previous.get("state") if location_only else state
        if location_only and lat is None:
            raise validation("lat", "location update needs coordinates")
        if uid in (withdraw.get("safeVolunteerIds") or []) and answer_state == "stuck" and not location_only:
            raise conflict("A supervisor has already confirmed you safe")
        answer = {
            "sessionId": session_id,
            "incidentId": incident_id,
            "volunteerId": uid,
            "state": answer_state,
            "lat": lat,
            "lng": lng,
            "accuracyM": accuracy,
            "at": rules.now_iso(),
        }
        answers = dict(withdraw.get("answers") or {})
        answer["answeredAt"] = previous.get("answeredAt") if location_only else previous.get("answeredAt", answer["at"]) if previous.get("state") == state else answer["at"]
        answers[uid] = answer
        transaction.update(_ref(store.INCIDENTS, incident_id), {"withdraw": dict(withdraw, answers=answers)})
        transaction.set(_ref(WITHDRAW_ANSWERS, f"{incident_id}__{uid}"), answer)
        audit_id = _audit(transaction, "withdraw.answer", incident_id, uid) if not location_only and previous.get("state") != state else None
        return answer, audit_id

    answer, audit_id = store.run_transaction(run)
    return jsonify({"answer": answer, "auditId": audit_id}), 200


def _on_incident(uid, incident_id, incident):
    """True when the caller has a task, a withdraw entry or a report on this incident, like GET /incidents/{id}."""
    if uid in ((incident.get("withdraw") or {}).get("volunteerIds") or []):
        return True
    if any((snap.to_dict() or {}).get("volunteerId") == uid for snap in store.where(store.TASKS, "incidentId", "==", incident_id)):
        return True
    mine = store.get_many(store.OBSERVATIONS, incident.get("observationIds") or [])
    return any((snap.to_dict() or {}).get("volunteerId") == uid for snap in mine.values())


@volunteer_bp.route("/observations/<observation_id>/flag", methods=["POST"])
def flag_observation(observation_id):
    """A volunteer on the incident says someone else's report looks wrong. The report itself is never changed.

    One flag per volunteer and report; a new flag from the same volunteer replaces the earlier one.
    """
    _require_volunteer()
    body = _body()
    reason = body.get("reason")
    if reason not in FLAG_REASONS:
        raise validation("reason", "use " + ", ".join(FLAG_REASONS))
    uid = g.user["id"]
    photo_path = body.get("photoPath")
    if photo_path is not None:
        if not isinstance(photo_path, str) or owner_of(photo_path) != uid:
            raise validation("photoPath", "use a path issued to you by /photos/upload-url, or null")

    observation = store.get_many(store.OBSERVATIONS, [observation_id]).get(observation_id)
    holders = store.where(store.INCIDENTS, "observationIds", "array_contains", observation_id) if observation else []
    incident = holders[0] if holders else None
    if incident is None or not _on_incident(uid, incident.id, incident.to_dict() or {}):
        # A report on an incident the caller is not part of gets the same answer as an unknown one.
        raise not_found("observation")
    if (observation.to_dict() or {}).get("volunteerId") == uid:
        raise conflict("You cannot flag your own report")

    def run(transaction):
        flag = {
            "observationId": observation_id,
            "incidentId": incident.id,
            "volunteerId": uid,
            "reason": reason,
            "photoPath": photo_path,
            "at": rules.now_iso(),
        }
        transaction.set(_ref(OBSERVATION_FLAGS, f"{observation_id}__{uid}"), flag)
        audit_id = _audit(transaction, "observation.flag", observation_id)
        return flag, audit_id

    flag, audit_id = store.run_transaction(run)
    return jsonify({"flag": flag, "auditId": audit_id}), 200
