"""Resolve the signed-in user from a Firebase ID token.

The role is the `role` custom claim already on the token. This module reads
that claim. It does not set custom claims and it does not read a role from
the request.
"""
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

import firebase_admin
from firebase_admin import auth

logger = logging.getLogger(__name__)


class AuthError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


ALLOWED_ROLES = ("volunteer", "supervisor")

# The revocation check is a lookup against Firebase Auth, so it must never be
# able to hang or break a request. It gets a short deadline, and after one
# failed lookup it is skipped for a while instead of slowing every write.
REVOCATION_TIMEOUT_SECONDS = 3
REVOCATION_PAUSE_SECONDS = 30
_lookups = ThreadPoolExecutor(max_workers=4, thread_name_prefix="revocation")
_paused_until = 0.0


def verify_id_token(token):
    """Verify a Firebase ID token and return its decoded claims."""
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={
            "projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
        })
    return auth.verify_id_token(token)


def check_not_revoked(claims):
    """Raise a 401 when the user was disabled, deleted or had their tokens revoked.

    Only a clear answer from Firebase Auth rejects a request. If the lookup
    fails or is slow (network, quota, permissions), the token is accepted on
    the signature check alone and the lookup is paused for a short while.
    """
    global _paused_until
    if time.monotonic() < _paused_until:
        return
    uid = claims.get("uid")
    try:
        user = _lookups.submit(auth.get_user, uid).result(timeout=REVOCATION_TIMEOUT_SECONDS)
    except auth.UserNotFoundError:
        raise AuthError(401, "unauthorized", "Firebase user no longer exists")
    except Exception:
        logger.warning("revocation lookup failed for %s; accepting the token", uid, exc_info=True)
        _paused_until = time.monotonic() + REVOCATION_PAUSE_SECONDS
        return
    if user.disabled:
        raise AuthError(401, "unauthorized", "Firebase user is disabled")
    if (claims.get("iat") or 0) * 1000 < user.tokens_valid_after_timestamp:
        raise AuthError(401, "unauthorized", "Firebase ID token is revoked")


def user_from_claims(claims):
    """Map verified token claims to the GET /me body."""
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


def user_from_token(token, check_revoked=False):
    """Verify the token and map it to a user.

    check_revoked adds the Firebase Auth lookup. The middleware turns it on
    for requests that write, so reads keep their current speed.
    """
    try:
        claims = verify_id_token(token)
    except auth.ExpiredIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is expired")
    except auth.RevokedIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is revoked")
    except auth.InvalidIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is invalid")
    if check_revoked:
        check_not_revoked(claims)
    return user_from_claims(claims)
