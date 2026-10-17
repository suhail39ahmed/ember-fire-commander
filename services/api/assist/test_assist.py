"""Suggestions, Ask EMBER and translation routes (supervisor), and the after-store model work."""
import io
import json
import urllib.error

import pytest

from assist import background, client as agents_client
from incidents.test_incidents import AUTH, _as, client, db  # noqa: F401  (fixtures)


class FakeAgents:
    """Stands in for ember-agents. Records each call and answers from `replies`."""

    def __init__(self, monkeypatch):
        self.calls = []
        self.replies = {}
        monkeypatch.setenv("EMBER_AGENTS_URL", "https://agents.example")
        monkeypatch.setattr("assist.client.cloud_run_token", lambda audience: "tok")
        monkeypatch.setattr("assist.client.urllib.request.urlopen", self.urlopen)

    def urlopen(self, request, timeout=None):
        path = request.full_url.replace("https://agents.example", "")
        self.calls.append({
            "path": path, "body": json.loads(request.data) if request.data else None,
            "auth": request.headers.get("Authorization"), "timeout": timeout,
        })
        reply = next((v for k, v in self.replies.items() if path.endswith(k)), {})
        if isinstance(reply, tuple):
            status, body = reply
            raise urllib.error.HTTPError(request.full_url, status, "err", {}, io.BytesIO(json.dumps(body).encode()))
        if isinstance(reply, Exception):
            raise reply

        class Response:
            def read(self_inner):
                return json.dumps(reply).encode()

            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

        return Response()


@pytest.fixture
def agents(monkeypatch):
    return FakeAgents(monkeypatch)


SUGGESTED = {"id": "inc_01", "suggestions": [{"text": "Ask Sari for a photo.", "rationale": "No photo is stored."}], "source": "model", "generatedAt": "2026-10-17T06:00:00.000Z", "model": "m"}


# Suggestions ---------------------------------------------------------------

def test_suggestions_call_agents_with_an_id_token(client, monkeypatch, db, agents):
    _as(monkeypatch)
    agents.replies["/suggestions"] = SUGGESTED
    response = client.post("/incidents/inc_01/suggestions", headers=AUTH)
    assert response.status_code == 200
    assert response.get_json() == {
        "items": [{"text": "Ask Sari for a photo.", "rationale": "No photo is stored."}],
        "source": "model", "generatedAt": "2026-10-17T06:00:00.000Z",
    }
    assert agents.calls == [{"path": "/internal/incidents/inc_01/suggestions", "body": None, "auth": "Bearer tok", "timeout": 40}]


def test_suggestions_are_supervisor_only(client, monkeypatch, db, agents):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert client.post("/incidents/inc_01/suggestions", headers=AUTH).status_code == 403
    assert agents.calls == []


def test_suggestions_for_an_unknown_incident_never_reach_agents(client, monkeypatch, db, agents):
    _as(monkeypatch)
    assert client.post("/incidents/missing/suggestions", headers=AUTH).status_code == 404
    assert agents.calls == []


def test_suggestions_say_agents_is_unavailable(client, monkeypatch, db, agents):
    _as(monkeypatch)
    agents.replies["/suggestions"] = (500, {"error": {"code": "x", "message": "boom"}})
    response = client.post("/incidents/inc_01/suggestions", headers=AUTH)
    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "agents_unavailable"


def test_suggestions_without_an_agents_url_are_a_503(client, monkeypatch, db):
    _as(monkeypatch)
    monkeypatch.delenv("EMBER_AGENTS_URL", raising=False)
    response = client.post("/incidents/inc_01/suggestions", headers=AUTH)
    assert response.status_code == 503
    assert response.get_json()["error"]["code"] == "agents_unavailable"


def test_a_timeout_is_a_502(client, monkeypatch, db, agents):
    _as(monkeypatch)
    agents.replies["/suggestions"] = TimeoutError("slow")
    assert client.post("/incidents/inc_01/suggestions", headers=AUTH).status_code == 502


# Ask -----------------------------------------------------------------------

def test_ask_passes_the_question_and_returns_the_answer(client, monkeypatch, db, agents):
    _as(monkeypatch)
    agents.replies["/ask"] = {"incidentId": "inc_01", "answer": "Two reports.", "enoughData": True, "model": "m", "at": "t"}
    response = client.post("/incidents/inc_01/ask", headers=AUTH, json={"question": "  How many reports? ", "volunteerId": "uid_sari"})
    assert response.status_code == 200
    assert response.get_json() == {"answer": "Two reports.", "enoughData": True, "at": "t"}
    assert agents.calls[0]["body"] == {"question": "How many reports?", "volunteerId": "uid_sari"}


@pytest.mark.parametrize("body", [None, [], {}, {"question": " "}, {"question": 4}, {"question": "x" * 501}, {"question": "ok", "volunteerId": 3}, {"question": "ok", "volunteerId": " "}])
def test_ask_validates_its_body(client, monkeypatch, db, agents, body):
    _as(monkeypatch)
    response = client.post("/incidents/inc_01/ask", headers=AUTH, json=body)
    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "validation_error"
    assert agents.calls == []


def test_ask_is_supervisor_only(client, monkeypatch, db, agents):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    assert client.post("/incidents/inc_01/ask", headers=AUTH, json={"question": "?"}).status_code == 403


def test_ask_maps_an_unknown_volunteer_and_a_model_failure(client, monkeypatch, db, agents):
    _as(monkeypatch)
    agents.replies["/ask"] = (404, {"error": {"code": "not_found", "message": "volunteer is not on this incident"}})
    refused = client.post("/incidents/inc_01/ask", headers=AUTH, json={"question": "?", "volunteerId": "uid_x"})
    assert refused.status_code == 404 and refused.get_json()["error"]["message"] == "volunteer is not on this incident"
    agents.replies["/ask"] = (502, {"error": {"code": "model_unavailable", "message": "the model could not answer"}})
    assert client.post("/incidents/inc_01/ask", headers=AUTH, json={"question": "?"}).status_code == 502


# Translate -----------------------------------------------------------------

def test_translate_returns_the_stored_translation(client, monkeypatch, db, agents):
    _as(monkeypatch)
    agents.replies["/translate"] = {"observationId": "obs_01", "sourceLanguage": "id", "english": "Thin smoke", "at": "t", "model": "m", "volunteerId": "uid_sari"}
    response = client.post("/incidents/inc_01/observations/obs_01/translate", headers=AUTH)
    assert response.status_code == 200
    assert response.get_json() == {"observationId": "obs_01", "sourceLanguage": "id", "english": "Thin smoke", "at": "t"}
    assert agents.calls[0]["path"] == "/internal/observations/obs_01/translate"


def test_translate_only_reaches_reports_of_this_incident(client, monkeypatch, db, agents):
    _as(monkeypatch)
    assert client.post("/incidents/inc_01/observations/obs_other/translate", headers=AUTH).status_code == 404
    assert client.post("/incidents/missing/observations/obs_01/translate", headers=AUTH).status_code == 404
    assert agents.calls == []


def test_translate_no_text_is_a_400(client, monkeypatch, db, agents):
    _as(monkeypatch)
    agents.replies["/translate"] = (400, {"error": {"code": "validation_error", "message": "observation has no text"}})
    response = client.post("/incidents/inc_01/observations/obs_01/translate", headers=AUTH)
    assert response.status_code == 400


# What the supervisor read carries -------------------------------------------

def test_the_detail_carries_stored_suggestions_and_translations(client, monkeypatch, db):
    _as(monkeypatch)
    db.data["observations"]["obs_01"]["text"] = "Ada asap"
    db.add("incident_suggestions", "inc_01", dict(SUGGESTED, advisory=True, facts={"secret": 1}))
    db.add("observation_translations", "obs_01", {"english": "There is smoke", "sourceLanguage": "id", "at": "t", "model": "m", "volunteerId": "uid_sari"})
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert body["suggestions"] == {
        "items": [{"text": "Ask Sari for a photo.", "rationale": "No photo is stored."}],
        "source": "model", "generatedAt": "2026-10-17T06:00:00.000Z",
    }
    assert body["translations"] == {"obs_01": {"english": "There is smoke", "sourceLanguage": "id", "at": "t"}}


def test_the_detail_has_no_suggestions_or_translations_until_stored(client, monkeypatch, db):
    _as(monkeypatch)
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert body["suggestions"] is None and body["translations"] == {}
    reads = db.batch_reads
    assert ("observation_translations", 1) not in reads  # no report has text, so no read


def test_a_volunteer_read_has_neither(client, monkeypatch, db):
    _as(monkeypatch, role="volunteer", uid="uid_sari")
    body = client.get("/incidents/inc_01", headers=AUTH).get_json()
    assert "suggestions" not in body and "translations" not in body


# After a report is stored ----------------------------------------------------

@pytest.fixture
def inline(monkeypatch):
    monkeypatch.setenv("EMBER_ASSIST_BACKGROUND", "on")
    monkeypatch.setattr(background, "_spawn", lambda fn: fn())


def test_a_photo_report_is_sent_for_a_photo_read(agents, inline):
    background.after_store({"id": "obs_1", "source": "photo", "photoPath": "photos/uid/20261017/" + "a" * 32 + ".jpg", "text": None}, "uid_sari")
    assert [(c["path"], c["body"], c["timeout"]) for c in agents.calls] == [("/internal/observations/obs_1/triage", {"callerId": "uid_sari"}, 70)]


def test_a_text_report_is_sent_for_translation(agents, inline):
    background.after_store({"id": "obs_2", "source": "text", "text": "Ada asap"}, "uid_sari")
    assert [c["path"] for c in agents.calls] == ["/internal/observations/obs_2/translate"]


def test_a_chip_report_needs_no_model_work(agents, inline):
    background.after_store({"id": "obs_3", "source": "chip", "chip": "api", "text": None}, "uid_sari")
    assert agents.calls == []


def test_a_failed_call_is_logged_and_the_next_job_still_runs(agents, inline):
    agents.replies["/triage"] = (502, {"error": {"code": "triage_failed", "message": "x"}})
    background.after_store({"id": "obs_4", "source": "photo", "photoPath": "photos/uid/20261017/" + "b" * 32 + ".jpg", "text": "Ada asap"}, "uid_sari")
    assert [c["path"].rsplit("/", 1)[1] for c in agents.calls] == ["triage", "translate"]


def test_it_can_be_turned_off(agents, monkeypatch):
    monkeypatch.setattr(background, "_spawn", lambda fn: fn())
    monkeypatch.setenv("EMBER_ASSIST_BACKGROUND", "off")
    background.after_store({"id": "obs_5", "source": "text", "text": "Ada asap"}, "uid_sari")
    assert agents.calls == []


def test_without_an_agents_url_nothing_is_started(monkeypatch):
    started = []
    monkeypatch.delenv("EMBER_AGENTS_URL", raising=False)
    monkeypatch.setenv("EMBER_ASSIST_BACKGROUND", "on")
    monkeypatch.setattr(background, "_spawn", lambda fn: started.append(fn))
    background.after_store({"id": "obs_6", "source": "text", "text": "Ada asap"}, "uid_sari")
    assert started == []


def test_a_failure_to_start_never_reaches_the_report(monkeypatch, agents):
    monkeypatch.setenv("EMBER_ASSIST_BACKGROUND", "on")

    def broken(_fn):
        raise RuntimeError("no threads")

    monkeypatch.setattr(background, "_spawn", broken)
    background.after_store({"id": "obs_7", "source": "text", "text": "Ada asap"}, "uid_sari")  # does not raise


def test_storing_a_text_report_starts_the_model_work_once(monkeypatch, agents, inline):
    import identity
    from app import app
    from observations.store import MemoryObservationStore

    memory = MemoryObservationStore()
    monkeypatch.setattr("observations.routes.get_store", lambda: memory)
    monkeypatch.setattr("observations.notify.notify_observation", lambda _id: True)
    monkeypatch.setattr("observations.routes.notify_observation", lambda _id: True)
    monkeypatch.setattr(identity, "verify_id_token", lambda token: {"uid": "uid_sari", "name": "Sari", "role": "volunteer"})
    body = {"source": "text", "capturedAt": "2026-10-17T05:00:00Z", "lat": 1.48, "lng": 102.11, "text": "Ada asap", "clientId": "c-1"}
    with app.test_client() as c:
        first = c.post("/observations", json=body, headers=AUTH)
        again = c.post("/observations", json=body, headers=AUTH)
    assert (first.status_code, again.status_code) == (201, 200)
    assert [c["path"].rsplit("/", 1)[1] for c in agents.calls] == ["translate"]
