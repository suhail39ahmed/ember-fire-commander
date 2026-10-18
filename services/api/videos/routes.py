"""POST /videos/upload-url: a short-lived signed PUT URL for one video clip.
GET /incidents/{id}/videos/{observationId}: a short-lived signed read URL (supervisor only).

Volunteers only for upload. Supervisor only for read. Both objects stay private;
the signed URL is the permission, not a public link.
"""
from datetime import datetime, timedelta, timezone

from flask import Blueprint, g, jsonify, request

from identity import AuthError
from photos import signing
from videos import paths as video_paths, store as video_store

videos_bp = Blueprint("videos", __name__)


class ValidationError(Exception):
    def __init__(self, field, hint):
        super().__init__(f"{field} is not valid")
        self.field = field
        self.hint = hint


@videos_bp.errorhandler(ValidationError)
def _validation_error(exc):
    body = {
        "error": {
            "code": "validation_error",
            "message": str(exc),
            "fields": {exc.field: exc.hint},
        }
    }
    return jsonify(body), 400


def _iso(moment):
    return moment.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@videos_bp.route("/videos/upload-url", methods=["POST"])
def create_video_upload_url():
    user = g.user
    if user["role"] != "volunteer":
        raise AuthError(403, "forbidden", "Only volunteers upload videos")
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValidationError("contentType", "send a JSON body with contentType")
    content_type = body.get("contentType")
    if content_type not in video_paths.CONTENT_TYPES:
        raise ValidationError("contentType", "use video/mp4, video/webm or video/quicktime")

    now = datetime.now(timezone.utc).replace(microsecond=0)
    ttl = signing.upload_ttl_seconds()
    expires_at = now + timedelta(seconds=ttl)
    video_path = video_paths.new_video_path(user["id"], content_type, now)
    upload_url = signing.sign_put_url(signing.photo_bucket(), video_path, content_type, ttl)
    video_store.save_upload({
        "volunteerId": user["id"],
        "videoPath": video_path,
        "contentType": content_type,
        "createdAt": _iso(now),
        "expiresAt": _iso(expires_at),
    })
    return jsonify({
        "uploadUrl": upload_url,
        "method": "PUT",
        "headers": {"Content-Type": content_type},
        "videoPath": video_path,
        "expiresAt": _iso(expires_at),
    }), 201
