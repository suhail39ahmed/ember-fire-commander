"""Volunteer-facing reads and writes that have no other home.

`crew_name_of` backs the crew line on GET /me. The routes added here sit behind the same
token check as every other route; a volunteer only ever acts for themselves.
"""
import logging

from incidents import store

logger = logging.getLogger(__name__)


def read_profile(uid):
    """The volunteer's stored profile document, or {} when there is none."""
    snap = store.get_many(store.VOLUNTEERS, [uid]).get(uid)
    return (snap.to_dict() if snap else None) or {}


def crew_name_of(uid):
    """The crew written on this volunteer's profile, or None when there is none or it cannot be read."""
    try:
        crew = read_profile(uid).get("crewName")
    except Exception:  # the crew line is a label; /me must still answer if the profile read fails
        logger.warning("crew name read failed", exc_info=True)
        return None
    return crew.strip() if isinstance(crew, str) and crew.strip() else None
