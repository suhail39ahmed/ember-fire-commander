import pytest
from firebase_admin import auth

import identity
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def profiles(monkeypatch):
    import volunteer_routes
    from incidents import store
    from incidents.fake_firestore import FakeFirestore

    fake = FakeFirestore()
    monkeypatch.setattr(store, "db", lambda: fake)
    monkeypatch.setattr(store, "run_transaction", fake.run_transaction)
    monkeypatch.setattr(volunteer_routes, "read_profile", lambda uid: fake.data.get("volunteers", {}).get(uid, {}))
    monkeypatch.setattr(volunteer_routes, "read_demo_mode", lambda: False)
    monkeypatch.setattr(identity, "check_not_revoked", lambda claims: None)
    return fake


def _claims(role="volunteer", uid="uid_sari", name="Sari"):
    claims = {"uid": uid, "name": name}
    if role is not None:
        claims["role"] = role
    return claims


def test_healthz_is_public(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_me_returns_volunteer(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    body = response.get_json()
    assert response.status_code == 200
    assert body == {"id": "uid_sari", "displayName": "Sari", "role": "volunteer", "crewName": None,
                    "area": None, "roleLabel": None, "supervisorName": None, "phoneMasked": None,
                    "onboardingComplete": False,
                    "trainingDone": None, "trainingTotal": None, "language": None,
                    "shareMyLocationWithCrew": True, "demoMode": False}


def test_me_returns_supervisor(client, monkeypatch):
    monkeypatch.setattr(
        identity,
        "verify_id_token",
        lambda token: _claims(role="supervisor", uid="uid_bpbd", name="Dewi"),
    )
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200
    assert response.get_json()["role"] == "supervisor"


def test_me_missing_token(client):
    response = client.get("/me")
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"


def test_me_invalid_token(client, monkeypatch):
    def reject(token):
        raise auth.InvalidIdTokenError("bad")

    monkeypatch.setattr(identity, "verify_id_token", reject)
    response = client.get("/me", headers={"Authorization": "Bearer nope"})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"


def test_me_expired_token(client, monkeypatch):
    def reject(token):
        raise auth.ExpiredIdTokenError("expired", None)

    monkeypatch.setattr(identity, "verify_id_token", reject)
    response = client.get("/me", headers={"Authorization": "Bearer old"})
    assert response.status_code == 401
    assert response.get_json()["error"]["code"] == "unauthorized"


def test_me_missing_role(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims(role=None))
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 403
    assert response.get_json()["error"]["code"] == "role_missing"


def test_me_ignores_role_in_query_and_body(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims(role="volunteer"))
    response = client.get(
        "/me?role=supervisor",
        headers={"Authorization": "Bearer valid"},
        json={"role": "supervisor"},
    )
    assert response.status_code == 200
    assert response.get_json()["role"] == "volunteer"


def test_me_returns_the_crew_from_the_volunteer_profile(client, monkeypatch):
    import volunteer_routes

    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    monkeypatch.setattr(volunteer_routes, "read_profile", lambda uid: {"crewName": "  Regu Tohor "})
    body = client.get("/me", headers={"Authorization": "Bearer valid"}).get_json()
    assert body["crewName"] == "Regu Tohor"


def test_me_treats_a_legacy_profile_with_phone_and_crew_as_complete(client, monkeypatch, profiles):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    profiles.add("volunteers", "uid_sari", {"phone": "+6281299994417", "crewName": "Regu Tohor"})
    body = client.get("/me", headers={"Authorization": "Bearer valid"}).get_json()
    assert body["onboardingComplete"] is True
    assert body["area"] is None


def test_patch_me_saves_first_run_profile_and_masks_phone(client, monkeypatch, profiles):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    response = client.patch("/me", headers={"Authorization": "Bearer valid"}, json={
        "displayName": "  Dedi Saputra ",
        "phone": "+6281234564417",
        "area": "  Desa Tohor ",
        "crewName": "  Crew A ",
        "language": "id",
        "onboardingComplete": True,
    })
    assert response.status_code == 200
    body = response.get_json()
    assert body["displayName"] == "Dedi Saputra"
    assert body["area"] == "Desa Tohor"
    assert body["crewName"] == "Crew A"
    assert body["phoneMasked"] == "•••• 4417"
    assert body["onboardingComplete"] is True
    assert "phone" not in body
    assert profiles.data["volunteers"]["uid_sari"]["phone"] == "+6281234564417"


def test_me_keeps_working_when_the_profile_read_fails(client, monkeypatch):
    import volunteer_routes

    def broken(uid):
        raise RuntimeError("firestore down")

    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    monkeypatch.setattr(volunteer_routes, "read_profile", broken)
    response = client.get("/me", headers={"Authorization": "Bearer valid"})
    assert response.status_code == 200
    assert response.get_json()["crewName"] is None


def test_me_for_a_supervisor_has_no_crew_field(client, monkeypatch):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims(role="supervisor", uid="uid_bpbd", name="Dewi"))
    body = client.get("/me", headers={"Authorization": "Bearer valid"}).get_json()
    assert "crewName" not in body


def test_me_profile_allowlist_and_server_demo_flag(client, monkeypatch, profiles):
    import volunteer_routes

    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    monkeypatch.setattr(volunteer_routes, "read_demo_mode", lambda: True)
    profiles.add("volunteers", "uid_sari", {"roleLabel": " pump team ", "supervisorName": " Maya ",
        "phone": "+62 812 9999 4417", "trainingDone": 0, "trainingTotal": 4,
        "language": "jv", "shareMyLocationWithCrew": False, "demoMode": False, "secret": "private"})
    body = client.get("/me", headers={"Authorization": "Bearer valid"}).get_json()
    assert body["roleLabel"] == "pump team"
    assert body["supervisorName"] == "Maya"
    assert body["phoneMasked"] == "•••• 4417"
    assert "phone" not in body and "secret" not in body
    assert "9999" not in str(body)
    assert body["trainingDone"] == 0 and body["trainingTotal"] == 4
    assert body["language"] == "jv" and body["shareMyLocationWithCrew"] is False
    assert body["demoMode"] is True


def test_me_blank_and_invalid_profile_values_are_null(client, monkeypatch, profiles):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    profiles.add("volunteers", "uid_sari", {"roleLabel": " ", "supervisorName": 23,
        "phone": "1234", "trainingDone": True, "trainingTotal": -1, "language": "invalid"})
    body = client.get("/me", headers={"Authorization": "Bearer valid"}).get_json()
    for field in ("roleLabel", "supervisorName", "phoneMasked", "trainingDone", "trainingTotal", "language"):
        assert body[field] is None


@pytest.mark.parametrize("language", ["id", "en", "jv", "su", "ms"])
def test_patch_me_round_trips_and_preserves_other_fields(client, monkeypatch, profiles, language):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    profiles.add("volunteers", "uid_sari", {"phone": "+6281299994417", "crewName": "Regu Tohor", "fcmTokens": ["keep"]})
    profiles.add("volunteers", "someone_else", {"language": "id"})
    response = client.patch("/me", headers={"Authorization": "Bearer valid"}, json={"language": language, "shareMyLocationWithCrew": False})
    assert response.status_code == 200
    assert response.get_json()["language"] == language
    assert response.get_json()["phoneMasked"] == "•••• 4417"
    body = client.get("/me", headers={"Authorization": "Bearer valid"}).get_json()
    assert body["language"] == language and body["shareMyLocationWithCrew"] is False
    assert profiles.data["volunteers"]["uid_sari"]["fcmTokens"] == ["keep"]
    assert profiles.data["volunteers"]["someone_else"] == {"language": "id"}


def test_patch_me_creates_a_missing_profile(client, monkeypatch, profiles):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    response = client.patch("/me", headers={"Authorization": "Bearer valid"}, json={"language": "ms"})
    assert response.status_code == 200
    assert profiles.data["volunteers"]["uid_sari"] == {"language": "ms"}
    assert response.get_json()["shareMyLocationWithCrew"] is True


@pytest.mark.parametrize("body", [{}, [], {"role": "supervisor"}, {"demoMode": True}, {"id": "other"},
    {"phone": "1234"}, {"language": None}, {"language": "xx"}, {"language": ["en"]},
    {"phone": "+0123456789"}, {"area": " "}, {"crewName": " "},
    {"onboardingComplete": True}, {"onboardingComplete": "yes"},
    {"shareMyLocationWithCrew": "false"}, {"shareMyLocationWithCrew": 0}])
def test_patch_me_rejects_invalid_and_readonly_fields(client, monkeypatch, profiles, body):
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims())
    response = client.patch("/me", headers={"Authorization": "Bearer valid"}, json=body)
    assert response.status_code == 400
    assert profiles.commits == 0


def test_patch_me_requires_a_signed_in_volunteer(client, monkeypatch, profiles):
    assert client.patch("/me", json={"language": "en"}).status_code == 401
    monkeypatch.setattr(identity, "verify_id_token", lambda token: _claims(role="supervisor"))
    assert client.patch("/me", headers={"Authorization": "Bearer valid"}, json={"language": "en"}).status_code == 403
    assert profiles.commits == 0
