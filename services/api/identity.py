"""Resolve the signed-in user from a Firebase ID token.

The role is the `role` custom claim already on the token. This module reads
that claim. It does not set custom claims and it does not read a role from
the request.
"""
import os

import firebase_admin
from firebase_admin import auth


class AuthError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


ALLOWED_ROLES = ("volunteer", "supervisor")


def verify_id_token(token):
    """Verify a Firebase ID token and return its decoded claims."""
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={
            "projectId": os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
        })
    return auth.verify_id_token(token)


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


def user_from_token(token):
    try:
        claims = verify_id_token(token)
    except auth.ExpiredIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is expired")
    except auth.InvalidIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is invalid")
    except auth.RevokedIdTokenError:
        raise AuthError(401, "unauthorized", "Firebase ID token is revoked")
    return user_from_claims(claims)
