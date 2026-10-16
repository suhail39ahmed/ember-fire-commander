"""Volunteer training and practice routes (#153, #154)."""
import pytest

import identity
from app import app
from incidents import store
from incidents.fake_firestore import FakeFirestore

AUTH = {"Authorization": "Bearer valid"}


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture
def db(monkeypatch):
    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    return fake


def _as(monkeypatch, role="volunteer", uid="uid_sari", name="Sari"):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": uid, "name": name, "role": role})


def test_get_training_returns_fixture_lessons(client, db, monkeypatch):
    _as(monkeypatch)
    response = client.get("/training", headers=AUTH)
    assert response.status_code == 200
    body = response.get_json()
    assert body["lessonCount"] == 4
    assert body["doneCount"] == 0
    assert body["video"]["id"] == "how_ember_works"
    assert body["video"]["progressSec"] == 0
    assert {lesson["id"] for lesson in body["lessons"]} == {
        "report_30s", "wind_upwind", "withdraw", "peat_return",
    }
    assert all(lesson["status"] == "not_started" for lesson in body["lessons"])
    assert body["askChips"]
    assert body["safetyLines"]


def test_save_progress_and_practice_turn(client, db, monkeypatch):
    _as(monkeypatch)
    saved = client.post(
        "/training/progress",
        headers=AUTH,
        json={"videoProgressSec": 40, "lessonId": "report_30s", "status": "in_progress"},
    )
    assert saved.status_code == 200
    body = client.get("/training", headers=AUTH).get_json()
    assert body["video"]["progressSec"] == 40
    assert body["lessons"][0]["status"] == "in_progress"

    practice = client.post(
        "/training/practice",
        headers=AUTH,
        json={"message": "Apa yang saya lakukan dulu?", "lessonId": "report_30s"},
    )
    assert practice.status_code == 200
    reply = practice.get_json()
    assert reply["practice"] is True
    assert reply["correct"] is None
    assert reply["check"]["lessonId"] == "report_30s"
    assert "observation" not in reply

    graded = client.post(
        "/training/practice",
        headers=AUTH,
        json={"message": "Laporkan", "lessonId": "report_30s", "optionId": "report"},
    )
    assert graded.status_code == 200
    assert graded.get_json()["correct"] is True


def test_training_is_volunteer_only(client, db, monkeypatch):
    _as(monkeypatch, role="supervisor", uid="uid_maya", name="Bu Maya")
    assert client.get("/training", headers=AUTH).status_code == 403
    assert client.post("/training/practice", headers=AUTH, json={"message": "hi"}).status_code == 403


def test_practice_requires_message(client, db, monkeypatch):
    _as(monkeypatch)
    response = client.post("/training/practice", headers=AUTH, json={})
    assert response.status_code == 400
    assert response.get_json()["error"]["fields"]["message"]
