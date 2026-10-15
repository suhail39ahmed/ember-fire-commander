"""Device tokens in volunteers/{uid}.fcmTokens.

ember-api is the only writer. A volunteer can only change their own list,
a token is stored once, and the list keeps the most recent MAX_TOKENS so a
phone that keeps getting new tokens cannot grow it without limit.
"""
from incidents import store
from incidents.errors import validation

VOLUNTEERS = "volunteers"
MAX_TOKENS = 10
MAX_TOKEN_LENGTH = 4096


def clean(value):
    """Return the stripped token, or raise a 400 when it is not a usable string."""
    if not isinstance(value, str) or not value.strip():
        raise validation("token", "required, a non-empty string")
    token = value.strip()
    if len(token) > MAX_TOKEN_LENGTH or any(ch.isspace() for ch in token):
        raise validation("token", "not a device token")
    return token


def _ref(volunteer_id):
    return store.db().collection(VOLUNTEERS).document(volunteer_id)


def _stored(snapshot):
    raw = (snapshot.to_dict() or {}).get("fcmTokens") if snapshot.exists else None
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, str) and item]


def add(volunteer_id, token):
    """Store the token once. Returns True when it was new, False when already stored."""
    ref = _ref(volunteer_id)

    def run(transaction):
        snapshot = ref.get(transaction=transaction)
        current = _stored(snapshot)
        if token in current:
            return False
        updated = (current + [token])[-MAX_TOKENS:]
        if snapshot.exists:
            transaction.update(ref, {"fcmTokens": updated})
        else:
            transaction.set(ref, {"fcmTokens": updated})
        return True

    added = store.run_transaction(run)
    if added:
        _release_from_others(volunteer_id, token)
    return added


def remove(volunteer_id, token):
    """Drop the token. Returns True when it was stored, False when it was not."""
    if not volunteer_id:
        return False
    ref = _ref(volunteer_id)

    def run(transaction):
        snapshot = ref.get(transaction=transaction)
        current = _stored(snapshot)
        if token not in current:
            return False
        transaction.update(ref, {"fcmTokens": [item for item in current if item != token]})
        return True

    return store.run_transaction(run)


def _release_from_others(volunteer_id, token):
    """A shared phone must not keep receiving the previous user's pushes."""
    for snapshot in store.where(VOLUNTEERS, "fcmTokens", "array_contains", token):
        if snapshot.id != volunteer_id:
            remove(snapshot.id, token)
