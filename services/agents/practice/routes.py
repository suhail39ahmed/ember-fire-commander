"""Private, Cloud Run IAM protected practice endpoint; no Firestore writes."""
import logging

from flask import Blueprint, jsonify, request
from practice import coach as coach_module

bp = Blueprint("practice", __name__)
logger = logging.getLogger(__name__)


@bp.post("/internal/practice")
def practice():
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("message"), str) or not 1 <= len(body["message"].strip()) <= 500:
        return jsonify({"error": {"code": "validation_error", "message": "A practice message is required"}}), 400
    if body.get("lang") not in ("en", "id") or type(body.get("index")) is not int or not 1 <= body["index"] <= 3:
        return jsonify({"error": {"code": "validation_error", "message": "Invalid language or check index"}}), 400
    if body.get("lessonId") not in (None, "report_30s", "wind_upwind", "withdraw", "peat_return"):
        return jsonify({"error": {"code": "validation_error", "message": "Unknown lesson"}}), 400
    try:
        return jsonify(coach_module.coach({key: body.get(key) for key in ("message", "lang", "index", "lessonId")}))
    except LookupError:
        return jsonify({"error": {"code": "practice_grounding_unconfigured", "message": "Practice guidance is not configured"}}), 503
    except Exception:
        logger.warning("Practice coach unavailable", exc_info=True)
        return jsonify({"error": {"code": "practice_unavailable", "message": "Practice is unavailable"}}), 503
