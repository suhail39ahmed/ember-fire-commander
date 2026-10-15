"""Minimum supervisor dashboard read for the console chrome.

Issue #91 owns the rest of the dashboard (live fires, season impact, charts).
This route returns only what the master layout shows: the caller's agency,
the server clock, and how many proposed tasks are waiting. It does not
return incidents, and nothing here writes a profile.
"""
from flask import Blueprint, g, jsonify

from identity import AuthError
from incidents import rules, store

dashboard_bp = Blueprint("dashboard", __name__)

# Same collection as device tokens. `agency` is optional and unread by every
# other route. Nothing in this repository writes it.
VOLUNTEERS = "volunteers"


def _require_supervisor():
    if g.user["role"] != "supervisor":
        raise AuthError(403, "forbidden", "Only a supervisor can do this")


def _agency(uid):
    """Agency name on the caller's profile, or None when it is not stored.

    A missing document, a non-string, or a blank string is null. That is an
    empty profile, not a failed read.
    """
    snapshot = store.db().collection(VOLUNTEERS).document(uid).get()
    if not snapshot.exists:
        return None
    agency = (snapshot.to_dict() or {}).get("agency")
    if not isinstance(agency, str):
        return None
    agency = agency.strip()
    return agency or None


def _approvals_count():
    """Proposed tasks waiting for a supervisor.

    Tasks have no supervisor id. A proposed task waits for the supervisor
    role, so the count is every task with status `proposed`. The tasks
    themselves stay off this response.
    """
    return sum(1 for _ in store.where(store.TASKS, "status", "==", "proposed"))


@dashboard_bp.route("/dashboard", methods=["GET"])
def dashboard():
    """Supervisor chrome fields. Later dashboard data belongs on this body."""
    _require_supervisor()
    return jsonify({
        "agency": _agency(g.user["id"]),
        "serverTime": rules.now_iso(),
        "approvalsCount": _approvals_count(),
    }), 200
