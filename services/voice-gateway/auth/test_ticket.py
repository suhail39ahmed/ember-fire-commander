"""Tests for voice ticket verification in auth.ticket."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

import auth.ticket as ticket_module
from auth.ticket import TicketError, verify_and_consume


# ---------------------------------------------------------------------------
# Fake Firestore helpers
# ---------------------------------------------------------------------------

class _FakeRef:
    def __init__(self, data):
        self._data = data
        self.updates = []

    def get(self, transaction=None):
        snap = MagicMock()
        snap.exists = self._data is not None
        snap.to_dict.return_value = dict(self._data) if self._data else None
        return snap

    def update(self, changes):
        self.updates.append(changes)


class _FakeTransaction:
    """Records update calls so tests can inspect them."""

    def __init__(self, ref):
        self._ref = ref

    def update(self, ref, changes):
        ref.updates.append(changes)


class _FakeDb:
    def __init__(self, record):
        self._ref = _FakeRef(record)

    def collection(self, name):
        return self

    def document(self, doc_id):
        return self._ref

    def transaction(self):
        return _FakeTransaction(self._ref)


def _make_transactional():
    """Return a fake transactional decorator that runs the inner function directly."""
    def transactional(fn):
        def run(txn):
            return fn(txn)
        return run
    return transactional


def _future(seconds=60):
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def _past(seconds=60):
    return (datetime.now(timezone.utc) - timedelta(seconds=seconds)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def _good_record(**kwargs):
    base = {
        "uid": "uid_sari",
        "displayName": "Sari",
        "role": "volunteer",
        "expiresAt": _future(60),
        "consumed": False,
    }
    base.update(kwargs)
    return base


def _run(ticket_str, record, **kwargs):
    """Call verify_and_consume with a fake DB, patching gcloud_firestore.transactional."""
    db = _FakeDb(record)
    with patch.object(ticket_module, "gcloud_firestore") as mock_gcloud:
        mock_gcloud.transactional = _make_transactional()
        return verify_and_consume(ticket_str, db_client=db), db._ref.updates


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

def test_valid_volunteer_ticket_returns_user():
    user, updates = _run("tok_abc", _good_record())
    assert user == {"id": "uid_sari", "displayName": "Sari", "role": "volunteer"}
    assert updates == [{"consumed": True}]


def test_valid_supervisor_ticket_returns_user():
    user, updates = _run("tok_sup", _good_record(role="supervisor", uid="uid_bpbd", displayName="Dewi"))
    assert user["role"] == "supervisor"
    assert user["id"] == "uid_bpbd"
    assert updates == [{"consumed": True}]


def test_empty_display_name_defaults_to_empty_string():
    user, _ = _run("tok_x", _good_record(displayName=""))
    assert user["displayName"] == ""


def test_missing_display_name_defaults_to_empty_string():
    record = _good_record()
    del record["displayName"]
    user, _ = _run("tok_x", record)
    assert user["displayName"] == ""


# ---------------------------------------------------------------------------
# Rejection cases
# ---------------------------------------------------------------------------

def test_unknown_ticket_raises():
    db = _FakeDb(None)  # record=None means document does not exist
    with patch.object(ticket_module, "gcloud_firestore") as mock_gcloud:
        mock_gcloud.transactional = _make_transactional()
        with pytest.raises(TicketError, match="not found"):
            verify_and_consume("tok_unknown", db_client=db)


def test_already_consumed_ticket_raises():
    _, _ = None, None
    with pytest.raises(TicketError, match="consumed"):
        _run("tok_c", _good_record(consumed=True))


def test_expired_ticket_raises():
    with pytest.raises(TicketError, match="expired"):
        _run("tok_exp", _good_record(expiresAt=_past(1)))


def test_missing_expiry_is_treated_as_expired():
    with pytest.raises(TicketError, match="expired"):
        _run("tok_no_exp", _good_record(expiresAt=None))


def test_invalid_expiry_format_is_treated_as_expired():
    with pytest.raises(TicketError, match="expired"):
        _run("tok_bad_exp", _good_record(expiresAt="not-a-date"))


def test_missing_ticket_string_raises():
    with pytest.raises(TicketError, match="missing"):
        verify_and_consume("", db_client=MagicMock())


def test_none_ticket_raises():
    with pytest.raises(TicketError, match="missing"):
        verify_and_consume(None, db_client=MagicMock())
