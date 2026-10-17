"""Volunteer Guide catalog, progress, and isolated practice turns."""
import math
import os
import time
import uuid
from copy import deepcopy

from flask import Blueprint, g, jsonify, request

from assist import client as agents
from identity import AuthError
from incidents import rules, store
from incidents.errors import ApiError, error_response, validation
from training_catalog import LESSONS, VIDEO, SCENARIOS

training_bp = Blueprint("training", __name__)
TRAINING = "trainingProgress"
TURNS = "practiceTurns"
TURN_TTL_SECONDS = 3600


@training_bp.errorhandler(ApiError)
def _handle_api_error(exc):
    return error_response(exc)


def _require_volunteer():
    if g.user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only a volunteer can do this")


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise validation("body", "send a JSON object")
    return body


def _progress(uid, transaction=None):
    ref = store.db().collection(TRAINING).document(uid)
    snap = ref.get(transaction=transaction)
    if not snap.exists:
        # Keep progress saved by the original Guide implementation.
        snap = store.db().collection("volunteer_training").document(uid).get(transaction=transaction)
    data = snap.to_dict() or {}
    data.setdefault("lessons", {})
    data.setdefault("videoProgressSec", 0)
    return ref, data


def _write_progress(uid, changes):
    def update(transaction):
        ref, data = _progress(uid, transaction)
        if "videoProgressSec" in changes:
            data["videoProgressSec"] = changes["videoProgressSec"]
        if "lessonId" in changes:
            data["lessons"][changes["lessonId"]] = changes["lesson"]
        data["updatedAt"] = rules.now_iso()
        transaction.set(ref, data)
    store.run_transaction(update)


@training_bp.get("/training")
def get_training():
    _require_volunteer()
    _, progress = _progress(g.user["id"])
    lessons = []
    for authored in LESSONS:
        lesson = {key: deepcopy(value) for key, value in authored.items() if key != "check"}
        row = progress["lessons"].get(lesson["id"]) or {}
        lesson.update(status=row.get("status", "not_started"), score=row.get("score"), total=row.get("total", 3))
        lessons.append(lesson)
    return jsonify({
        "video": {**VIDEO, "url": os.getenv("TRAINING_VIDEO_URL", "").strip() or VIDEO["url"], "progressSec": progress["videoProgressSec"]},
        "lessons": lessons,
        "doneCount": sum(row["status"] == "done" for row in lessons),
        "lessonCount": len(lessons), "askChips": SCENARIOS,
        "safetyLines": [],
    })


@training_bp.post("/training/progress")
def save_progress():
    _require_volunteer()
    body = _body()
    changes = {}
    video = body.get("videoProgressSec")
    if video is not None:
        if isinstance(video, bool) or not isinstance(video, (int, float)) or not math.isfinite(video) or not 0 <= video <= 86400:
            raise validation("videoProgressSec", "a finite number from 0 to 86400")
        changes["videoProgressSec"] = int(video)
    if "lessonId" in body:
        lesson_id = body["lessonId"]
        if not isinstance(lesson_id, str) or lesson_id not in {row["id"] for row in LESSONS}:
            raise validation("lessonId", "unknown lesson")
        status = body.get("status", "in_progress")
        if status not in ("not_started", "in_progress", "done"):
            raise validation("status", "use not_started, in_progress, or done")
        score, total = body.get("score"), body.get("total", 3)
        row = {"status": status, "at": rules.now_iso()}
        if status == "done":
            if type(score) is not int or type(total) is not int or not 0 <= score <= total == 3:
                raise validation("score", "done requires a score from 0 to 3 and total 3")
            row.update(score=score, total=total)
        changes.update(lessonId=lesson_id, lesson=row)
    if not changes:
        raise validation("body", "send videoProgressSec or lessonId")
    _write_progress(g.user["id"], changes)
    return jsonify({"ok": True})


def _turn(turn_id, uid, transaction=None):
    if not isinstance(turn_id, str) or not turn_id or len(turn_id) > 100 or "/" in turn_id:
        raise ApiError(404, "not_found", "Practice turn not found")
    ref = store.db().collection(TURNS).document(turn_id)
    row = ref.get(transaction=transaction).to_dict() or {}
    if row.get("volunteerId") != uid or row.get("expiresAt", 0) < time.time():
        raise ApiError(404, "not_found", "Practice turn not found")
    return ref, row


def _public_turn(turn_id, row):
    return {"practice": True, "turnId": turn_id, "reply": row["reply"], "ruleKey": row["ruleKey"], "correct": None,
            "safetyLines": [], "check": {"index": row["index"], "total": 3, "question": row["question"],
                                        "options": row["options"], "lessonId": row.get("lessonId")}}


@training_bp.post("/training/practice")
def practice_turn():
    _require_volunteer()
    body, uid = _body(), g.user["id"]
    message, lang = body.get("message"), body.get("lang", "en")
    if not isinstance(message, str) or not 1 <= len(message.strip()) <= 500:
        raise validation("message", "send 1 to 500 characters")
    if lang not in ("id", "en"):
        raise validation("lang", "use id or en")
    lesson_id = body.get("lessonId")
    if lesson_id is not None and (not isinstance(lesson_id, str) or lesson_id not in {row["id"] for row in LESSONS}):
        raise validation("lessonId", "unknown lesson")
    previous_id = body.get("previousTurnId")
    previous, index, correct_count = None, 1, 0
    if previous_id:
        _, previous = _turn(previous_id, uid)
        if previous.get("lessonId") != lesson_id or "answer" not in previous or previous["index"] >= 3:
            raise validation("previousTurnId", "answer the preceding check first")
        if previous.get("nextTurnId"):
            next_id = previous["nextTurnId"]
            _, existing = _turn(next_id, uid)
            return jsonify(_public_turn(next_id, existing))
        index, correct_count = previous["index"] + 1, previous["correctCount"]
    try:
        coached = agents.post("/internal/practice", {"message": message.strip(), "lang": lang, "lessonId": lesson_id, "index": index})
        # Validate the private service response too; malformed model output never creates a turn.
        from training_catalog import validate_coach
        coached = validate_coach(coached)
    except (agents.AgentsUnavailable, agents.AgentsRejected):
        raise ApiError(503, "practice_unavailable", "Practice is unavailable. Please try again.")
    except (ValueError, KeyError, TypeError):
        raise ApiError(503, "practice_unavailable", "Practice is unavailable. Please try again.")
    turn_id = uuid.uuid4().hex
    row = {**coached, "volunteerId": uid, "lessonId": lesson_id, "index": index,
           "correctCount": correct_count, "expiresAt": time.time() + TURN_TTL_SECONDS}
    def create(transaction):
        prior_ref = prior_row = None
        if previous_id:
            prior_ref, prior_row = _turn(previous_id, uid, transaction)
            if prior_row.get("nextTurnId"):
                existing_id = prior_row["nextTurnId"]
                _, existing_row = _turn(existing_id, uid, transaction)
                return _public_turn(existing_id, existing_row)
        progress_ref = progress = None
        if lesson_id:
            progress_ref, progress = _progress(uid, transaction)
        transaction.set(store.db().collection(TURNS).document(turn_id), row)
        if prior_ref:
            transaction.set(prior_ref, {**prior_row, "nextTurnId": turn_id})
        if progress_ref:
            current = progress["lessons"].get(lesson_id) or {}
            if current.get("status") != "done":
                progress["lessons"][lesson_id] = {"status": "in_progress"}
                transaction.set(progress_ref, progress)
        return _public_turn(turn_id, row)
    return jsonify(store.run_transaction(create))


@training_bp.post("/training/practice/<turn_id>/answer")
def answer_practice(turn_id):
    _require_volunteer()
    uid, option_id = g.user["id"], _body().get("optionId")
    def grade(transaction):
        ref, row = _turn(turn_id, uid, transaction)
        if option_id not in [option["id"] for option in row["options"]]:
            raise validation("optionId", "unknown option")
        if "answer" in row:
            return row["answer"]
        correct = option_id == row["correctId"]
        count = row["correctCount"] + int(correct)
        complete = row["index"] == 3
        answer = {"correct": correct, "feedback": row["rightFeedback"] if correct else row["wrongFeedback"], "lessonComplete": complete}
        progress_ref = progress = None
        if row.get("lessonId") and complete:
            progress_ref, progress = _progress(uid, transaction)
        transaction.set(ref, {**row, "answer": answer, "correctCount": count, "selectedId": option_id})
        if progress_ref:
            progress["lessons"][row["lessonId"]] = {"status": "done", "score": count, "total": 3, "at": rules.now_iso()}
            transaction.set(progress_ref, progress)
        return answer
    return jsonify(store.run_transaction(grade))
