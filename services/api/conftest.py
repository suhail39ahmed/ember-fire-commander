import types

import pytest

import identity


@pytest.fixture(autouse=True)
def active_firebase_user(monkeypatch):
    """Writes check the Firebase Auth user record; by default it is a normal active user."""
    monkeypatch.setattr(
        identity.auth,
        "get_user",
        lambda uid: types.SimpleNamespace(disabled=False, tokens_valid_after_timestamp=0),
    )
    monkeypatch.setattr(identity, "_paused_until", 0.0)
