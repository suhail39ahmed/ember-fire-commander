"""Reject unauthenticated requests before a protected handler runs.

APP_CHECK_ENFORCE defaults to false (log only), matching the Cloud Run
setting. Production enforcement is a later change.
"""
import logging
import os

from flask import g, request
from firebase_admin import app_check

from identity import AuthError, user_from_token

logger = logging.getLogger(__name__)

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


def _bearer_token():
    header = request.headers.get("Authorization", "")
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


def protect_request():
    """Verify identity. Return None so the view can run."""
    if request.path in ("/healthz", "/config") or request.method == "OPTIONS":
        return None
    # Agents calls this with its own Cloud Run ID token. The route checks that
    # token. A Firebase user token is the wrong credential here.
    if request.path == "/internal/notifications/withdraw":
        return None
    # Requests that change data also check that the token was not revoked.
    g.user = user_from_token(_bearer_token(), check_revoked=request.method not in SAFE_METHODS)
    app_check_token = request.headers.get("X-Firebase-AppCheck", "").strip()
    try:
        verify_app_check_token(app_check_token)
    except AuthError as exc:
        if app_check_enforced():
            raise
        logger.warning("App Check not enforced: %s", exc.message)
    return None


def install_auth(app):
    @app.before_request
    def _protect():
        return protect_request()
