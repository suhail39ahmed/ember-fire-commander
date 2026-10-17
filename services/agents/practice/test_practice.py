"""Practice coach validation and route behavior without Google."""
import pytest
from flask import Flask
from practice.coach import coach
from practice.routes import bp


def localized(text):
    return {"en": text, "id": text}


class FakeModel:
    def __init__(self, rule="withdraw"):
        self.rule = rule
        self.calls = []

    def json(self, payload, datastore):
        self.calls.append((payload, datastore))
        return {"reply": localized("Leave now."), "ruleKey": self.rule,
                "question": localized("What first?"),
                "options": [{"id": str(i), "label": localized(str(i))} for i in range(3)],
                "correctId": "1", "rightFeedback": localized("Right"), "wrongFeedback": localized("Leave first"),
                "severity": "large_flame", "coordinates": [1, 2]}


def test_grounding_and_allowlisted_output(monkeypatch):
    monkeypatch.setenv("VERTEX_SEARCH_DATASTORE", "projects/test/locations/global/collections/default_collection/dataStores/training")
    model = FakeModel("not_allowed")
    result = coach({"message": "wind", "lang": "en", "index": 2, "lessonId": "withdraw"}, model)
    assert result["ruleKey"] is None
    assert "severity" not in result and "coordinates" not in result
    assert len(result["options"]) == 3
    assert model.calls[0][0]["lessonId"] == "withdraw"


def test_unconfigured_grounding_never_calls_model(monkeypatch):
    monkeypatch.delenv("VERTEX_SEARCH_DATASTORE", raising=False)
    model = FakeModel()
    with pytest.raises(LookupError):
        coach({}, model)
    assert not model.calls


def test_route_validation_and_unconfigured_error(monkeypatch):
    monkeypatch.delenv("VERTEX_SEARCH_DATASTORE", raising=False)
    app = Flask(__name__)
    app.register_blueprint(bp)
    client = app.test_client()
    assert client.post("/internal/practice", json={}).status_code == 400
    response = client.post("/internal/practice", json={"message": "wind", "lang": "en", "index": 1})
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "practice_grounding_unconfigured"


def test_malformed_model_json_rejected(monkeypatch):
    monkeypatch.setenv("VERTEX_SEARCH_DATASTORE", "test")
    class BadModel:
        def json(self, *args):
            return {"options": [{"id": "same", "label": localized("a")}] * 3}
    with pytest.raises(ValueError):
        coach({}, BadModel())
