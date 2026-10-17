"""Withdrawal identity, safety and scoped client presentation.

The incident's withdraw value is the authoritative session. Answers are also
mirrored in withdraw_answers for compatibility with existing audit/detail reads.
"""
from copy import deepcopy


def key(withdraw):
    return withdraw.get("id") or withdraw.get("sentAt")


def belongs(answer, withdraw):
    session = key(withdraw)
    if answer.get("sessionId"):
        return answer["sessionId"] == session
    return not session or (answer.get("at") or "") >= (withdraw.get("sentAt") or "")


def safe_ids(withdraw):
    return set(withdraw.get("safeVolunteerIds") or []) | {
        uid for uid, answer in (withdraw.get("answers") or {}).items()
        if answer.get("state") == "safe"
    }


def present(records, user):
    """Volunteers receive their answer, never another person's coordinates."""
    weather = None
    if any((r.get("withdraw") or {}).get("active") for r in records):
        from incidents.detail import _conditions, _guard
        weather = _guard("withdraw weather", _conditions, {}).get("weather")
    for record in records:
        w = record.get("withdraw")
        if not w:
            continue
        w = deepcopy(w)
        if weather:
            w["weather"] = weather
        if w.get("answers"):
            w["selfSafeVolunteerIds"] = [uid for uid, a in w["answers"].items() if a.get("state") == "safe"]
        if user["role"] == "volunteer":
            w["answers"] = {uid: a for uid, a in (w.get("answers") or {}).items() if uid == user["id"]}
        record["withdraw"] = w
