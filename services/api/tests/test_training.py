"""Training and isolated practice API contracts. No Google calls."""
import time
from copy import deepcopy

import pytest

import identity
from app import app
from incidents import store
from incidents.fake_firestore import FakeFirestore
from training_routes import TURNS, TRAINING
from assist import client as agents

AUTH = {"Authorization": "Bearer valid"}


def copy(en):
    return {"en": en, "id": "ID " + en}


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


def _as(monkeypatch, role="volunteer", uid="uid_sari"):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": uid, "name": "Sari", "role": role})


@pytest.fixture
def coach(monkeypatch):
    calls = []
    def fake(path, body):
        calls.append((path, deepcopy(body)))
        return {"reply": copy("Leave now. Move upwind."), "ruleKey": "withdraw",
                "question": copy(f'{body.get("lessonId")} check {body["index"]}'),
                "options": [{"id": str(i), "label": copy(f"Option {i}")} for i in range(1, 4)],
                "correctId": "2", "rightFeedback": copy("Right. Leave first."), "wrongFeedback": copy("Leave first, then report.")}
    monkeypatch.setattr(agents, "post", fake)
    return calls


def ask(client, **over):
    return client.post("/training/practice", headers=AUTH, json={"message": "The wind changed", "lang": "en", **over})


def answer(client, turn, option="2"):
    return client.post(f'/training/practice/{turn["turnId"]}/answer', headers=AUTH, json={"optionId": option})


def test_catalog_and_progress_reload(client, db, monkeypatch):
    _as(monkeypatch)
    body = client.get("/training", headers=AUTH).get_json()
    assert body["lessonCount"] == 4 and body["doneCount"] == 0
    assert len(body["askChips"]) == 4
    assert body["video"]["url"].endswith("LVcnXNLAPKo")
    saved = client.post("/training/progress", headers=AUTH, json={"videoProgressSec": 40, "lessonId": "withdraw", "status": "in_progress"})
    assert saved.status_code == 200
    client.post("/training/progress", headers=AUTH, json={"videoProgressSec": 50})
    body = client.get("/training", headers=AUTH).get_json()
    assert body["video"]["progressSec"] == 50
    assert body["lessons"][2]["status"] == "in_progress"
    assert body["lessons"][0]["status"] == "not_started"


def test_legacy_progress_and_configured_video(client, db, monkeypatch):
    _as(monkeypatch)
    db.add("volunteer_training", "uid_sari", {"videoProgressSec": 25, "lessons": {"withdraw": {"status": "done", "score": 3}}})
    monkeypatch.setenv("TRAINING_VIDEO_URL", "https://youtu.be/LVcnXNLAPKo")
    body = client.get("/training", headers=AUTH).get_json()
    assert body["video"]["progressSec"] == 25
    assert body["video"]["url"].startswith("https://youtu.be/")
    assert body["doneCount"] == 1


def test_selected_lesson_three_checks_and_idempotent_grading(client, db, monkeypatch, coach):
    _as(monkeypatch)
    turn = ask(client, lessonId="withdraw").get_json()
    assert turn["check"]["lessonId"] == "withdraw"
    assert "withdraw" in turn["check"]["question"]["en"]
    assert "correctId" not in str(turn)
    assert answer(client, turn, "1").get_json()["correct"] is False
    assert answer(client, turn, "2").get_json()["correct"] is False
    next_turn = ask(client, lessonId="withdraw", previousTurnId=turn["turnId"]).get_json()
    repeated = ask(client, lessonId="withdraw", previousTurnId=turn["turnId"]).get_json()
    assert repeated["turnId"] == next_turn["turnId"]
    assert next_turn["check"]["index"] == 2
    assert answer(client, next_turn).get_json()["lessonComplete"] is False
    assert client.get("/training", headers=AUTH).get_json()["lessons"][2]["status"] == "in_progress"
    last = ask(client, lessonId="withdraw", previousTurnId=next_turn["turnId"]).get_json()
    assert answer(client, last).get_json()["lessonComplete"] is True
    progress = client.get("/training", headers=AUTH).get_json()
    assert progress["lessons"][2]["score"] == 2
    assert progress["lessons"][2]["total"] == 3
    assert progress["lessons"][0]["status"] == "not_started"
    assert set(db.data) <= {TRAINING, TURNS, "volunteer_training"}
    assert all(call[0] == "/internal/practice" for call in coach)


def test_turn_ownership_expiry_and_answer_validation(client, db, monkeypatch, coach):
    _as(monkeypatch)
    turn = ask(client).get_json()
    assert answer(client, turn, "invalid").status_code == 400
    assert ask(client, previousTurnId=turn["turnId"]).status_code == 400
    _as(monkeypatch, uid="other")
    assert answer(client, turn).status_code == 404
    assert ask(client, previousTurnId=turn["turnId"]).status_code == 404
    _as(monkeypatch)
    db.data[TURNS][turn["turnId"]]["expiresAt"] = time.time() - 1
    assert answer(client, turn).status_code == 404


def test_training_volunteer_only(client, db, monkeypatch):
    _as(monkeypatch, role="supervisor")
    assert client.get("/training", headers=AUTH).status_code == 403
    assert ask(client).status_code == 403
    assert client.post("/training/progress", headers=AUTH, json={"videoProgressSec": 1}).status_code == 403
    assert answer(client, {"turnId": "anything"}).status_code == 403


@pytest.mark.parametrize("body", [{}, {"videoProgressSec": -1}, {"videoProgressSec": True}, {"videoProgressSec": float("inf")}, {"lessonId": "missing"}, {"lessonId": "withdraw", "status": "done", "score": 5}])
def test_invalid_progress(client, db, monkeypatch, body):
    _as(monkeypatch)
    assert client.post("/training/progress", headers=AUTH, json=body).status_code == 400


def test_bad_requests_and_unavailable_coach(client, db, monkeypatch):
    _as(monkeypatch)
    monkeypatch.delenv("EMBER_AGENTS_URL", raising=False)
    assert ask(client).status_code == 503
    assert ask(client, message="").status_code == 400
    assert ask(client, lang="xx").status_code == 400
    assert ask(client, lessonId="missing").status_code == 400
    monkeypatch.setattr(agents, "post", lambda *args: {"bad": True})
    assert ask(client).status_code == 503
    assert not db.data.get(TURNS)
