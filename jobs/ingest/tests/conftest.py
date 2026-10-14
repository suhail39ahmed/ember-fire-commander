import pathlib
import socket

import pytest

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def guard(*a, **k):
        raise AssertionError("tests must not touch the network")
    monkeypatch.setattr(socket, "create_connection", guard)
    monkeypatch.setattr(socket.socket, "connect", guard)


@pytest.fixture
def fixtures_dir():
    return FIXTURES
