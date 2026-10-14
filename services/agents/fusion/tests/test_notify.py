"""Code WITHDRAW tells ember-api after the incident is stored."""
import io
import json

from fusion.notify import notify_withdraw


class _Plan:
    def __init__(self, tasks):
        self.incident = {"id": "inc_01", "lat": 1.482, "lng": 102.115}
        self.tasks = tasks


def _withdraw_plan():
    return _Plan([
        {"id": "task_verify", "volunteerId": "uid_sari", "type": "verify"},
        {
            "id": "task_wd",
            "volunteerId": "uid_sari",
            "type": "withdraw",
            "instruction": "Withdraw upwind. Do not engage.",
        },
    ])


def test_skips_when_url_unset(monkeypatch):
    monkeypatch.delenv("EMBER_API_URL", raising=False)

    def refuse(*args, **kwargs):
        raise AssertionError("urlopen should not be called")

    monkeypatch.setattr("fusion.notify.urllib.request.urlopen", refuse)
    notify_withdraw(_withdraw_plan())


def test_posts_only_new_withdraw_tasks(monkeypatch):
    monkeypatch.setenv("EMBER_API_URL", "https://api.example/")
    monkeypatch.setattr("fusion.notify._id_token", lambda audience: "tok")
    seen = {}

    class Response(io.BytesIO):
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["method"] = request.get_method()
        seen["auth"] = request.get_header("Authorization")
        seen["body"] = json.loads(request.data.decode())
        return Response(b"{}")

    monkeypatch.setattr("fusion.notify.urllib.request.urlopen", fake_urlopen)
    notify_withdraw(_withdraw_plan())
    assert seen["url"] == "https://api.example/internal/notifications/withdraw"
    assert seen["method"] == "POST"
    assert seen["auth"] == "Bearer tok"
    assert seen["body"] == {
        "incidentId": "inc_01",
        "tasks": [{"id": "task_wd", "volunteerId": "uid_sari"}],
    }
    assert "lat" not in seen["body"]
    assert "instruction" not in seen["body"]


def test_retries_then_gives_up_without_raising(monkeypatch):
    monkeypatch.setenv("EMBER_API_URL", "https://api.example")
    monkeypatch.setattr("fusion.notify._id_token", lambda audience: "tok")
    calls = {"n": 0}

    def fail(request, timeout):
        calls["n"] += 1
        raise TimeoutError("down")

    monkeypatch.setattr("fusion.notify.urllib.request.urlopen", fail)
    notify_withdraw(_withdraw_plan())
    assert calls["n"] == 3


def test_intake_notifies_after_the_withdraw_is_stored(monkeypatch):
    import fusion.intake
    from app import app
    from fusion.store import MemoryFusionStore

    memory = MemoryFusionStore()
    monkeypatch.setattr(fusion.intake, "get_store", lambda: memory)
    seen = {}

    def capture(plan):
        seen["tasks"] = [
            task["id"] for task in memory.collections["tasks"].values() if task["type"] == "withdraw"
        ]
        seen["active"] = next(iter(memory.collections["incidents"].values()))["withdraw"]["active"]
        seen["volunteers"] = [task["volunteerId"] for task in plan.tasks if task["type"] == "withdraw"]

    monkeypatch.setattr(fusion.intake, "notify_withdraw", capture)
    memory.collections["observations"]["obs_01"] = {
        "volunteerId": "uid_sari", "source": "chip", "severity": "large_flame", "lat": 1.482,
        "lng": 102.115, "accuracyM": 18, "chip": None, "text": None, "photoPath": None,
        "capturedAt": "2026-10-13T08:12:00Z", "receivedAt": "2026-10-13T08:12:02Z",
        "immutable": True,
    }
    app.config["TESTING"] = True
    with app.test_client() as test_client:
        response = test_client.post("/internal/observations/obs_01/intake", data=b"")
    assert response.status_code == 202
    assert seen["active"] is True
    assert seen["volunteers"] == ["uid_sari"]
    assert seen["tasks"]
