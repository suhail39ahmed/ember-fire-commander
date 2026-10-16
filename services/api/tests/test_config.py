import config_route
from app import app


def test_config_is_public_and_returns_demo_mode(monkeypatch):
    monkeypatch.setattr(config_route, "read_demo_mode", lambda: True)
    app.config["TESTING"] = True
    with app.test_client() as client:
        response = client.get("/config")
    assert response.status_code == 200
    assert response.get_json() == {"demoMode": True}


def test_config_defaults_false_from_env(monkeypatch):
    monkeypatch.delenv("DEMO_MODE", raising=False)

    class Missing:
        exists = False

    class FakeDb:
        def collection(self, name):
            assert name == "ops"
            return self

        def document(self, name):
            assert name == "config"
            return self

        def get(self):
            return Missing()

    monkeypatch.setattr(config_route.store, "db", lambda: FakeDb())
    assert config_route.read_demo_mode() is False


def test_config_reads_firestore_bool(monkeypatch):
    class Snap:
        exists = True

        def to_dict(self):
            return {"demoMode": True}

    class FakeDb:
        def collection(self, name):
            return self

        def document(self, name):
            return self

        def get(self):
            return Snap()

    monkeypatch.setattr(config_route.store, "db", lambda: FakeDb())
    assert config_route.read_demo_mode() is True
