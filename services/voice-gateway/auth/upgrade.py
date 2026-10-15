"""Authenticate a voice-gateway WebSocket upgrade.

The role is the `role` custom claim already on the Firebase ID token. This
module reads that claim. It does not set custom claims and it does not read a
role from the request body.

APP_CHECK_ENFORCE defaults to false (log only), matching the Cloud Run
setting. Production enforcement is a later change.
"""
import json
import logging
import os

import firebase_admin
from firebase_admin import app_check, auth

logger = logging.getLogger(__name__)

ALLOWED_ROLES = ("volunteer", "supervisor")
UNAUTHORIZED_CLOSE = {"type": "session.closed", "reason": "unauthorized"}


class AuthError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def verify_id_token(token):
    """Verify a Firebase ID token and return its decoded claims."""
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={
            "projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
        })
    return auth.verify_id_token(token)


def user_from_claims(claims):
    """Map verified token claims to the signed-in user."""
    role = claims.get("role")
    if role is None or role == "":
        raise AuthError(403, "role_missing", "Firebase ID token has no role claim")
    if role not in ALLOWED_ROLES:
        raise AuthError(403, "forbidden", "Firebase ID token role is not allowed")
    name = claims.get("name")
    return {
        "id": claims["uid"],
        "displayName": name if isinstance(name, str) else "",
        "role": role,
    }


def user_from_token(token):
    try:
        claims = verify_id_token(token)
    except auth.ExpiredIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is expired")
    except auth.RevokedIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is revoked")
    except auth.InvalidIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is invalid")
    return user_from_claims(claims)


def _bearer_token(headers):
    header = headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme != "Bearer" or not token.strip():
        raise AuthError(401, "unauthorized", "Firebase ID token is missing")
    return token.strip()


def verify_app_check_token(token):
    if not token:
        raise AuthError(401, "unauthorized", "App Check token is missing")
    try:
        return app_check.verify_token(token)
    except ValueError as exc:
        if "expired" in str(exc).lower():
            raise AuthError(401, "unauthorized", "App Check token is expired")
        raise AuthError(401, "unauthorized", "App Check token is invalid")


def app_check_enforced():
    return os.getenv("APP_CHECK_ENFORCE", "false").strip().lower() == "true"


def authenticate_upgrade(headers):
    """Verify the upgrade headers and return the signed-in user.

    A missing or invalid ID token, or a token without an allowed role, raises
    AuthError. App Check is always checked. When APP_CHECK_ENFORCE is false,
    an App Check failure is logged and the upgrade continues.
    """
    user = user_from_token(_bearer_token(headers))
    app_check_token = headers.get("X-Firebase-AppCheck", "").strip()
    try:
        verify_app_check_token(app_check_token)
    except AuthError as exc:
        if app_check_enforced():
            raise
        logger.warning("App Check not enforced: %s", exc.message)
    return user


def _reject(ws):
    ws.send(json.dumps(UNAUTHORIZED_CLOSE))
    close = getattr(ws, "close", None)
    if close is not None:
        close()


def handle_upgrade(ws, headers, session_factory):
    """Accept or close one upgrade before a Gemini session exists.

    session_factory runs the Live relay. It is called only after the upgrade
    is accepted, and it is not called when credentials are rejected.
    """
    if session_factory is None:
        raise RuntimeError("session factory is required")
    try:
        user = authenticate_upgrade(headers)
    except AuthError as exc:
        logger.info("WebSocket upgrade rejected: %s", exc.message)
        _reject(ws)
        return None
    session_factory(user, ws)
    return user
