import types

import pytest

import identity
from observations import notify


@pytest.fixture(autouse=True)
def active_firebase_user(monkeypatch):
    """Writes check the Firebase Auth user record; by default it is a normal active user."""
    monkeypatch.setattr(
        identity.auth,
        "get_user",
        lambda uid: types.SimpleNamespace(disabled=False, tokens_valid_after_timestamp=0),
    )
    monkeypatch.setattr(identity, "_paused_until", 0.0)


@pytest.fixture(autouse=True)
def fresh_notify_state(monkeypatch):
    """The agents hand-off keeps a token cache and a pause; each test starts clean."""
    monkeypatch.setattr(notify, "_tokens", {})
    monkeypatch.setattr(notify, "_paused_until", 0.0)
    monkeypatch.setattr(notify, "_last_sweep", 0.0)


@pytest.fixture(autouse=True)
def no_profile_read(monkeypatch):
    """GET /me looks up the volunteer's crew; tests that do not set up Firestore get no crew instead of a real read."""
    import volunteer_routes

    monkeypatch.setattr(volunteer_routes, "read_profile", lambda uid: {})


@pytest.fixture(autouse=True)
def no_assist_background(monkeypatch):
    """The photo read and translation calls run on a thread after a report is stored; tests turn them on one by one."""
    monkeypatch.setenv("EMBER_ASSIST_BACKGROUND", "off")
