"""Volunteer training and practice chat (#153, #154).

Practice never creates an observation, task, or incident. Lesson copy is served as
fixtures from this module until content is authored elsewhere.
"""
from flask import Blueprint, g, jsonify, request

from identity import AuthError
from incidents import rules, store
from incidents.errors import ApiError, error_response, validation

training_bp = Blueprint("training", __name__)

TRAINING = "volunteer_training"
NOTE_MAX = 500

# Fixture lessons — content is API data, not client-generated copy.
LESSONS = (
    {
        "id": "report_30s",
        "title": {"id": "Lapor kebakaran dalam 30 detik", "en": "Report a fire in 30 seconds"},
        "minutes": 4,
        "summary": {"id": "Chip, catatan, lepas mic.", "en": "Chip, note, or release the mic."},
        "body": {
            "id": "Pegang mic, sebut apa yang Anda lihat, lalu lepas. Atau ketuk asap / api.",
            "en": "Hold the mic, say what you see, then release. Or tap smoke / fire.",
        },
        "check": {
            "question": {"id": "Apa yang Anda lakukan dulu di lokasi?", "en": "What do you do first at the site?"},
            "options": [
                {"id": "report", "label": {"id": "Laporkan dari jarak aman", "en": "Report from a safe distance"}, "correct": True},
                {"id": "run_in", "label": {"id": "Langsung masuk ke api", "en": "Run into the fire"}, "correct": False},
            ],
        },
    },
    {
        "id": "wind_upwind",
        "title": {"id": "Baca angin, tetap di sisi datang angin", "en": "Read the wind, stay upwind"},
        "minutes": 4,
        "summary": {"id": "Datang dari arah angin.", "en": "Approach from upwind."},
        "body": {
            "id": "Asap dan api bergerak mengikuti angin. Datang dari sisi datang angin.",
            "en": "Smoke and fire move with the wind. Come in from the upwind side.",
        },
        "check": {
            "question": {"id": "Dari mana Anda mendekat?", "en": "Which way do you approach?"},
            "options": [
                {"id": "upwind", "label": {"id": "Dari sisi datang angin", "en": "From upwind"}, "correct": True},
                {"id": "downwind", "label": {"id": "Dari arah asap", "en": "From downwind"}, "correct": False},
            ],
        },
    },
    {
        "id": "withdraw",
        "title": {"id": "Kapan harus WITHDRAW", "en": "When to WITHDRAW"},
        "minutes": 4,
        "summary": {"id": "Mundur saat tidak aman.", "en": "Leave when it is not safe."},
        "body": {
            "id": "Jika api besar atau angin berubah, mundur ke titik aman. Jangan padamkan sendiri.",
            "en": "If flames are large or the wind shifts, withdraw to a safe point. Do not fight it alone.",
        },
        "check": {
            "question": {"id": "Api besar dan angin kencang. Apa yang Anda lakukan?", "en": "Large flames and strong wind. What do you do?"},
            "options": [
                {"id": "withdraw", "label": {"id": "WITHDRAW ke titik aman", "en": "WITHDRAW to a safe point"}, "correct": True},
                {"id": "stay", "label": {"id": "Tetap di tempat", "en": "Stay put"}, "correct": False},
            ],
        },
    },
    {
        "id": "peat_return",
        "title": {"id": "Api gambut bisa kembali", "en": "Peat fires come back"},
        "minutes": 4,
        "summary": {"id": "Periksa situs lama.", "en": "Check an old site."},
        "body": {
            "id": "Gambut bisa menyala lagi di bawah tanah. Laporkan asap tipis di situs lama.",
            "en": "Peat can re-ignite underground. Report thin smoke at an old site.",
        },
        "check": {
            "question": {"id": "Ada asap tipis di lokasi yang sudah padam. Apa?", "en": "Thin smoke at a site that was out. What next?"},
            "options": [
                {"id": "report", "label": {"id": "Laporkan untuk diperiksa ulang", "en": "Report it for a re-check"}, "correct": True},
                {"id": "ignore", "label": {"id": "Abaikan", "en": "Ignore it"}, "correct": False},
            ],
        },
    },
)

VIDEO = {
    "id": "how_ember_works",
    "title": {
        "id": "Cara EMBER bekerja: lapor, tetap di sisi angin, mundur",
        "en": "How EMBER works: report, stay upwind, withdraw",
    },
    "durationSec": 180,
    # Placeholder — real hosting comes later. The phone may cache playback position locally.
    "url": None,
}

SAFETY_LINES = (
    {"id": "Jangan masuk ke api besar sendirian.", "en": "Do not walk into a large fire alone."},
    {"id": "Datang dari sisi datang angin.", "en": "Approach from upwind."},
    {"id": "Jika tidak aman, mundur dan laporkan.", "en": "If it is not safe, withdraw and report."},
)


@training_bp.errorhandler(ApiError)
def _handle_api_error(exc):
    return error_response(exc)


def _require_volunteer():
    if g.user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only a volunteer can do this")


def _body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "validation_error", "Body must be a JSON object", {"body": "send a JSON object"})
    return body


def _progress_doc(uid):
    snap = store.db().collection(TRAINING).document(uid).get()
    data = (snap.to_dict() or {}) if snap.exists else {}
    lessons = data.get("lessons") if isinstance(data.get("lessons"), dict) else {}
    return {
        "videoProgressSec": data.get("videoProgressSec") if isinstance(data.get("videoProgressSec"), (int, float)) else 0,
        "lessons": lessons,
        "seenClosed": list(data.get("seenClosed") or []),
    }


def _lesson_status(progress, lesson_id):
    row = progress["lessons"].get(lesson_id) or {}
    status = row.get("status")
    if status in ("done", "in_progress", "not_started"):
        return status
    return "not_started"


@training_bp.route("/training", methods=["GET"])
def get_training():
    """Guide content and this volunteer's progress (#153)."""
    _require_volunteer()
    progress = _progress_doc(g.user["id"])
    lessons = []
    done = 0
    for lesson in LESSONS:
        status = _lesson_status(progress, lesson["id"])
        if status == "done":
            done += 1
        lessons.append({
            "id": lesson["id"],
            "title": lesson["title"],
            "minutes": lesson["minutes"],
            "summary": lesson["summary"],
            "body": lesson["body"],
            "status": status,
            "score": (progress["lessons"].get(lesson["id"]) or {}).get("score"),
        })
    return jsonify({
        "video": {**VIDEO, "progressSec": int(progress["videoProgressSec"] or 0)},
        "lessons": lessons,
        "doneCount": done,
        "lessonCount": len(LESSONS),
        "askChips": [
            {"id": "thick_smoke", "label": {"id": "Asap semakin tebal", "en": "Smoke is getting thick"}},
            {"id": "wind_changed", "label": {"id": "Angin berubah", "en": "The wind changed"}},
            {"id": "underground", "label": {"id": "Api di bawah tanah", "en": "Fire under the ground"}},
            {"id": "alone", "label": {"id": "Saya sendirian di api", "en": "I am alone at the fire"}},
        ],
        "safetyLines": list(SAFETY_LINES),
    }), 200


@training_bp.route("/training/progress", methods=["POST"])
def save_progress():
    """Save video position and/or a lesson result (#153)."""
    _require_volunteer()
    body = _body()
    uid = g.user["id"]
    progress = _progress_doc(uid)
    video = body.get("videoProgressSec")
    if video is not None:
        if isinstance(video, bool) or not isinstance(video, (int, float)) or video < 0:
            raise validation("videoProgressSec", "a number, 0 or more")
        progress["videoProgressSec"] = int(video)
    lesson_id = body.get("lessonId")
    if lesson_id is not None:
        if lesson_id not in {lesson["id"] for lesson in LESSONS}:
            raise validation("lessonId", "unknown lesson")
        status = body.get("status") or "in_progress"
        if status not in ("not_started", "in_progress", "done"):
            raise validation("status", "use not_started, in_progress, or done")
        score = body.get("score")
        row = {"status": status, "at": rules.now_iso()}
        if score is not None:
            if isinstance(score, bool) or not isinstance(score, (int, float)):
                raise validation("score", "a number or null")
            row["score"] = int(score)
        progress["lessons"][lesson_id] = row
    store.db().collection(TRAINING).document(uid).set({
        "videoProgressSec": progress["videoProgressSec"],
        "lessons": progress["lessons"],
        "seenClosed": progress["seenClosed"],
        "updatedAt": rules.now_iso(),
    })
    return jsonify({"ok": True}), 200


@training_bp.route("/training/practice", methods=["POST"])
def practice_turn():
    """Practice Q&A that cannot create observations or open the live voice socket (#154)."""
    _require_volunteer()
    body = _body()
    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        raise validation("message", "required")
    message = message.strip()
    if len(message) > NOTE_MAX:
        raise validation("message", f"at most {NOTE_MAX} characters")
    option_id = body.get("optionId")
    lesson_id = body.get("lessonId")

    # Deterministic fixture answers — not the live incident coach.
    lower = message.lower()
    if option_id and lesson_id:
        lesson = next((row for row in LESSONS if row["id"] == lesson_id), None)
        if lesson is None:
            raise validation("lessonId", "unknown lesson")
        option = next((opt for opt in lesson["check"]["options"] if opt["id"] == option_id), None)
        if option is None:
            raise validation("optionId", "unknown option")
        correct = bool(option["correct"])
        return jsonify({
            "practice": True,
            "reply": {
                "id": "Benar. Tetap di jarak aman." if correct else "Belum tepat. Coba lagi — utamakan jarak aman.",
                "en": "Right. Stay at a safe distance." if correct else "Not yet. Try again — keep a safe distance.",
            },
            "correct": correct,
            "check": None,
            "safetyLines": list(SAFETY_LINES),
        }), 200

    if "wind" in lower or "angin" in lower:
        reply = {
            "id": "Datang dari sisi datang angin. Asap dan api bergerak mengikuti angin.",
            "en": "Approach from upwind. Smoke and fire move with the wind.",
        }
    elif "withdraw" in lower or "mundur" in lower:
        reply = {
            "id": "Jika tidak aman, mundur ke titik kumpul dan laporkan. Jangan padamkan sendiri.",
            "en": "If it is not safe, withdraw to the rally point and report. Do not fight it alone.",
        }
    else:
        reply = {
            "id": "Laporkan dari jarak aman. Sebut apa yang Anda lihat, lalu tunggu instruksi.",
            "en": "Report from a safe distance. Say what you see, then wait for an instruction.",
        }
    check = LESSONS[0]["check"]
    return jsonify({
        "practice": True,
        "reply": reply,
        "correct": None,
        "check": {
            "question": check["question"],
            "options": [{"id": opt["id"], "label": opt["label"]} for opt in check["options"]],
            "lessonId": LESSONS[0]["id"],
        },
        "safetyLines": list(SAFETY_LINES),
    }), 200
