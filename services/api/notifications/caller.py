"""Accept only the ember-agents service account on the internal route.

ember-api is public, so Cloud Run IAM does not check this call. The route
checks a Google ID token whose audience is this service and whose email is
EMBER_AGENTS_CALLER.
"""
import os

from flask import request

from identity import AuthError


def _bearer():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme != "Bearer" or not token.strip():
        raise AuthError(401, "unauthorized", "Caller token is missing")
    return token.strip()


def audience():
    """Origin the ID token was minted for.

    Cloud Run speaks HTTP inside the container, so request.host_url would be
    http while the token audience is https.
    """
    host = request.host
    if host.startswith("localhost") or host.startswith("127.0.0.1"):
        return request.host_url.rstrip("/")
    return f"https://{host}"


def caller_email(token, aud):
    import google.auth.transport.requests
    import google.oauth2.id_token

    try:
        claims = google.oauth2.id_token.verify_oauth2_token(
            token, google.auth.transport.requests.Request(), aud
        )
    except Exception:
        raise AuthError(401, "unauthorized", "Caller token is invalid")
    if not claims.get("email_verified"):
        return ""
    return claims.get("email") or ""


def require_agents():
    expected = os.getenv("EMBER_AGENTS_CALLER", "").strip()
    if not expected:
        raise AuthError(401, "unauthorized", "Agents caller is not configured")
    email = caller_email(_bearer(), audience())
    if email != expected:
        raise AuthError(403, "forbidden", "Caller is not ember-agents")
