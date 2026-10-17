import pytest

import assist.routes
import spotter.model
from app import app
from assist import facts as facts_module
from assist.store import MemoryAssistStore
from assist.suggest import clean, template


class FakeModel:
    name = "gemini-test-flash"

    def __init__(self, reply):
        self.reply = reply
        self.prompts = []

    def json(self, prompt, image=None, mime_type=None):
        self.prompts.append(prompt)
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture
def store(monkeypatch):
    memory = MemoryAssistStore()
    monkeypatch.setattr(assist.routes, "get_store", lambda: memory)
    return memory


def use_model(monkeypatch, reply):
    fake = FakeModel(reply)
    monkeypatch.setattr(spotter.model, "get_model", lambda: fake)
    return fake


def seed(store, photo=False, conflict=False):
    store.collections["incidents"]["inc_1"] = {
        "name": "Bengkalis, Riau · Pak Dedi · #3", "area": "Bengkalis, Riau", "status": "held" if conflict else "open",
        "severity": "small_flame", "evidenceScore": 40, "lat": 1.48, "lng": 102.11,
        "observationIds": ["obs_1", "obs_2"], "conflictId": "con_1" if conflict else None,
        "evidenceFactors": [{"factor": "severity", "points": 20, "detail": "small flame reported"}],
        "withdraw": None,
    }
    store.collections["conflicts"]["con_1"] = {"incidentId": "inc_1", "status": "open"}
    store.collections["observations"]["obs_1"] = {
        "volunteerId": "uid_dedi", "volunteerName": "Pak Dedi", "source": "chip", "chip": "api", "severity": "small_flame",
        "text": None, "capturedAt": "2026-10-17T05:00:00.000Z", "photoPath": None,
        "device": {"batteryPct": 64, "network": "4g", "language": "id"}, "lat": 1.48, "lng": 102.11,
    }
    store.collections["observations"]["obs_2"] = {
        "volunteerId": "uid_sari", "source": "photo" if photo else "text", "chip": None, "severity": "unknown",
        "text": "Ada asap tipis dekat kanal", "capturedAt": "2026-10-17T05:10:00.000Z",
        "photoPath": "photos/uid_sari/20261017/" + "a" * 32 + ".jpg" if photo else None, "lat": 1.481, "lng": 102.111,
    }
    store.collections["volunteers"]["uid_sari"] = {"displayName": "Bu Sari", "crewName": "Crew Kanal", "fcmTokens": ["secret-token"], "phone": "+62000"}
    store.collections["tasks"]["tsk_1"] = {"incidentId": "inc_1", "volunteerId": "uid_sari", "type": "verify", "status": "proposed", "instruction": "Check the spot."}
    store.collections["weather"]["current"] = {"windKmh": 12, "windDirDeg": 90, "observedAt": "2026-10-17T05:00:00Z"}
    store.collections["photo_triage"]["obs_2"] = {
        "id": "obs_2", "observationId": "obs_2",
        "status": "ok", "result": {"smokeVisible": True, "flameVisible": "none", "burnScarVisible": False, "notes": "Thin smoke", "confidence": "high"},
    }


# Facts ---------------------------------------------------------------------

def test_facts_hold_only_stored_data_and_no_secrets(store):
    seed(store, photo=True)
    incident = store.get("incidents", "inc_1")
    ids = incident["observationIds"]
    facts = facts_module.build(
        incident, store.observations_for(ids), None, store.triages_for(ids), store.tasks_for("inc_1"),
        store.volunteers_for(["uid_dedi", "uid_sari"]), store.weather(),
    )
    flat = repr(facts)
    assert "secret-token" not in flat and "+62000" not in flat and "fcmTokens" not in flat
    assert facts["reportCount"] == 2
    assert {p["volunteerId"]: p["name"] for p in facts["volunteers"]} == {"uid_dedi": "Pak Dedi", "uid_sari": "Bu Sari"}
    assert next(p for p in facts["volunteers"] if p["volunteerId"] == "uid_dedi")["device"] == {"batteryPct": 64, "network": "4g", "language": "id"}
    assert facts["weather"]["windKmh"] == 12 and "monitoring point" in facts["weather"]["note"]
    photo = next(r for r in facts["reports"] if r["id"] == "obs_2")
    assert photo["photoRead"]["notes"] == "Thin smoke"
    assert "no weather reading is stored" not in facts["gaps"]


def test_facts_list_what_is_missing(store):
    store.collections["incidents"]["inc_1"] = {"status": "open", "observationIds": []}
    incident = store.get("incidents", "inc_1")
    facts = facts_module.build(incident, [], None, [], [], {}, None)
    for gap in ("no report is stored for this incident", "no photo report is stored", "no weather reading is stored"):
        assert gap in facts["gaps"]
    assert facts["weather"] is None


# Suggestions ---------------------------------------------------------------

def test_suggestions_are_cleaned_and_cached(client, store, monkeypatch):
    seed(store, conflict=True)
    fake = use_model(monkeypatch, {"suggestions": [
        {"text": "Ask Bu Sari to send a photo of the canal.", "rationale": "Her report is text only."},
        {"text": "Withdraw everyone now.", "rationale": "Flames."},
        {"text": "Mark the fire as confirmed.", "rationale": "Two reports."},
        {"text": "Set severity to large flame.", "rationale": "Wind."},
        {"text": "", "rationale": "empty"},
        "not an object",
        {"text": "Ask Bu Sari to send a photo of the canal.", "rationale": "duplicate"},
    ]})
    response = client.post("/internal/incidents/inc_1/suggestions")
    body = response.get_json()
    assert response.status_code == 200
    assert body["source"] == "model" and body["model"] == "gemini-test-flash" and body["advisory"] is True
    assert body["suggestions"] == [{"text": "Ask Bu Sari to send a photo of the canal.", "rationale": "Her report is text only."}]
    assert body["generatedAt"].endswith("Z")
    assert store.collections["incident_suggestions"]["inc_1"]["suggestions"] == body["suggestions"]
    assert "Pak Dedi" in fake.prompts[0] and "secret-token" not in fake.prompts[0]
    # Nothing else was written.
    assert store.collections["incidents"]["inc_1"]["severity"] == "small_flame"
    assert store.collections["tasks"]["tsk_1"]["status"] == "proposed"


def test_suggestions_cap_at_four():
    raw = {"suggestions": [{"text": f"Ask volunteer {i} to report.", "rationale": "Stored."} for i in range(9)]}
    assert len(clean(raw)) == 4


@pytest.mark.parametrize("reply", [RuntimeError("boom"), {"suggestions": "nope"}, {"suggestions": []}, {"suggestions": [{"text": "Withdraw now", "rationale": "x"}]}])
def test_suggestions_fall_back_to_rules(client, store, monkeypatch, reply):
    seed(store, conflict=True)
    use_model(monkeypatch, reply)
    response = client.post("/internal/incidents/inc_1/suggestions")
    body = response.get_json()
    assert response.status_code == 200
    assert body["source"] == "template" and body["model"] is None
    assert [s["text"] for s in body["suggestions"]] == [
        "Ask a volunteer near the spot to check it and report back.",
        "Ask a volunteer on site to send a photo of the spot.",
    ]


def test_template_is_empty_when_nothing_supports_a_suggestion():
    facts = {"incident": {"reportsDisagree": False}, "reportCount": 1, "gaps": []}
    assert template(facts) == []


def test_suggestions_unknown_incident(client, store, monkeypatch):
    use_model(monkeypatch, {})
    assert client.post("/internal/incidents/missing/suggestions").status_code == 404


# Ask -----------------------------------------------------------------------

def test_ask_returns_a_grounded_answer(client, store, monkeypatch):
    seed(store, photo=True)
    fake = use_model(monkeypatch, {"answer": "Pak Dedi's phone reported 64% battery on 4g.", "enoughData": True})
    response = client.post("/internal/incidents/inc_1/ask", json={"question": "How is Pak Dedi's phone?", "volunteerId": "uid_dedi"})
    body = response.get_json()
    assert response.status_code == 200
    assert body["answer"] == "Pak Dedi's phone reported 64% battery on 4g."
    assert body["enoughData"] is True and body["advisory"] is True and body["model"] == "gemini-test-flash"
    assert "focusVolunteer" in fake.prompts[0] and "How is Pak Dedi" in fake.prompts[0]
    assert "gaps" in fake.prompts[0] and "secret-token" not in fake.prompts[0]


@pytest.mark.parametrize("body", [{}, {"question": "  "}, {"question": "x" * 501}, {"question": 5}, {"question": "ok", "volunteerId": 3}])
def test_ask_validates_the_question(client, store, monkeypatch, body):
    seed(store)
    use_model(monkeypatch, {"answer": "x"})
    assert client.post("/internal/incidents/inc_1/ask", json=body).status_code == 400


def test_ask_unknown_incident_and_volunteer(client, store, monkeypatch):
    seed(store)
    use_model(monkeypatch, {"answer": "x"})
    assert client.post("/internal/incidents/missing/ask", json={"question": "?"}).status_code == 404
    assert client.post("/internal/incidents/inc_1/ask", json={"question": "?", "volunteerId": "uid_other"}).status_code == 404


@pytest.mark.parametrize("reply", [RuntimeError("down"), {"answer": ""}, {"nope": 1}])
def test_ask_reports_unavailable_when_the_model_fails(client, store, monkeypatch, reply):
    seed(store)
    use_model(monkeypatch, reply)
    response = client.post("/internal/incidents/inc_1/ask", json={"question": "What is the wind?"})
    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "model_unavailable"


def test_ask_cuts_a_long_answer(client, store, monkeypatch):
    seed(store)
    use_model(monkeypatch, {"answer": "a" * 2000})
    body = client.post("/internal/incidents/inc_1/ask", json={"question": "?"}).get_json()
    assert len(body["answer"]) == 700 and body["enoughData"] is None


# Translation ---------------------------------------------------------------

def test_translate_stores_the_english_text_and_language(client, store, monkeypatch):
    seed(store)
    fake = use_model(monkeypatch, {"sourceLanguage": "ID", "english": "There is thin smoke near the canal"})
    before = dict(store.collections["observations"]["obs_2"])
    response = client.post("/internal/observations/obs_2/translate")
    body = response.get_json()
    assert response.status_code == 200
    assert body["sourceLanguage"] == "id" and body["english"] == "There is thin smoke near the canal"
    assert body["volunteerId"] == "uid_sari" and body["advisory"] is True
    assert store.collections["observation_translations"]["obs_2"]["english"] == body["english"]
    assert store.collections["observations"]["obs_2"] == before
    assert "Ada asap tipis dekat kanal" in fake.prompts[0]


def test_translate_is_final_once_stored(client, store, monkeypatch):
    seed(store)
    fake = use_model(monkeypatch, {"sourceLanguage": "id", "english": "First"})
    client.post("/internal/observations/obs_2/translate")
    fake.reply = {"sourceLanguage": "id", "english": "Second"}
    again = client.post("/internal/observations/obs_2/translate").get_json()
    assert again["english"] == "First" and len(fake.prompts) == 1


def test_translate_bad_language_becomes_und(client, store, monkeypatch):
    seed(store)
    use_model(monkeypatch, {"sourceLanguage": "Bahasa Indonesia!", "english": "Hello"})
    assert client.post("/internal/observations/obs_2/translate").get_json()["sourceLanguage"] == "und"


def test_translate_needs_text_and_an_observation(client, store, monkeypatch):
    seed(store)
    use_model(monkeypatch, {"sourceLanguage": "id", "english": "x"})
    assert client.post("/internal/observations/obs_1/translate").status_code == 400
    assert client.post("/internal/observations/missing/translate").status_code == 404


@pytest.mark.parametrize("reply", [RuntimeError("down"), {"sourceLanguage": "id"}, {"english": "  "}])
def test_translate_failure_stores_nothing(client, store, monkeypatch, reply):
    seed(store)
    use_model(monkeypatch, reply)
    response = client.post("/internal/observations/obs_2/translate")
    assert response.status_code == 502
    assert response.get_json()["error"]["code"] == "model_unavailable"
    assert store.collections["observation_translations"] == {}
