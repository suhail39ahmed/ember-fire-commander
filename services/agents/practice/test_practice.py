"""Practice coach validation and route behavior without Google."""
import pytest
import json
from types import SimpleNamespace
from flask import Flask
from practice.coach import coach, PracticeModel
from practice import coach as coach_module
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


def test_no_datastore_still_calls_the_coach(monkeypatch):
    monkeypatch.delenv("VERTEX_SEARCH_DATASTORE", raising=False)
    model = FakeModel()
    assert coach({"message": "wind", "lang": "en", "index": 1}, model)["reply"]["en"] == "Leave now."
    assert model.calls[0][1] == ""


def test_route_validation_and_live_coach_without_datastore(monkeypatch):
    monkeypatch.delenv("VERTEX_SEARCH_DATASTORE", raising=False)
    model = FakeModel()
    monkeypatch.setattr(coach_module, "get_model", lambda: model)
    app = Flask(__name__)
    app.register_blueprint(bp)
    client = app.test_client()
    assert client.post("/internal/practice", json={}).status_code == 400
    response = client.post("/internal/practice", json={"message": "wind", "lang": "en", "index": 1})
    assert response.status_code == 200
    assert response.get_json()["correctId"] == "1"
    assert model.calls == [({"message": "wind", "lang": "en", "index": 1, "lessonId": None}, "")]


@pytest.mark.parametrize("datastore", ["", "projects/test/locations/global/collections/default_collection/dataStores/training"])
def test_gemini_receives_grounding_and_scenario(monkeypatch, datastore):
    calls = []
    payload = {"message": "Smoke hides the edge", "lang": "en", "index": 2, "lessonId": "withdraw"}
    expected = FakeModel().json(payload, datastore)
    def generate_content(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(text=json.dumps(expected))
    sdk = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
    monkeypatch.setattr(coach_module, "get_flash_model", lambda: SimpleNamespace(name="test-gemini", _sdk=lambda: sdk))
    assert PracticeModel().json(payload, datastore) == expected
    call = calls[0]
    assert json.loads(call["contents"]) == payload
    assert call["config"].response_mime_type == "application/json"
    schema = call["config"].response_schema
    assert schema["properties"]["options"]["min_items"] == 3
    assert schema["properties"]["options"]["max_items"] == 3
    if datastore:
        assert call["config"].tools[0].retrieval.vertex_ai_search.datastore == datastore
    else:
        assert not call["config"].tools
        for heading in ("When to WITHDRAW", "Read the wind", "Report a fire in 30 seconds", "Peat fires come back"):
            assert heading in call["config"].system_instruction


def test_model_failure_does_not_return_a_canned_answer(monkeypatch):
    def unavailable():
        raise RuntimeError("Vertex unavailable")
    monkeypatch.setattr(coach_module, "get_model", unavailable)
    app = Flask(__name__)
    app.register_blueprint(bp)
    response = app.test_client().post("/internal/practice", json={"message": "wind", "lang": "en", "index": 1})
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "practice_unavailable"


def test_malformed_model_json_rejected(monkeypatch):
    monkeypatch.setenv("VERTEX_SEARCH_DATASTORE", "test")
    class BadModel:
        def json(self, *args):
            return {"options": [{"id": "same", "label": localized("a")}] * 3}
    with pytest.raises(ValueError):
        coach({}, BadModel())
