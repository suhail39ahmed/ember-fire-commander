import logging
import re

import pytest

from spotter import store as spotter_store


@pytest.fixture(autouse=True)
def reset_warning(monkeypatch):
    monkeypatch.setattr(spotter_store, "_warned_default_bucket", False)


def test_photo_bucket_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("PHOTO_BUCKET", " my-photos ")
    assert spotter_store.photo_bucket() == "my-photos"


def test_unset_bucket_on_cloud_run_is_logged_once(monkeypatch, caplog):
    monkeypatch.delenv("PHOTO_BUCKET", raising=False)
    monkeypatch.setenv("K_SERVICE", "ember-agents")
    with caplog.at_level(logging.WARNING, logger="spotter.store"):
        assert spotter_store.photo_bucket() == spotter_store.DEFAULT_BUCKET
        assert spotter_store.photo_bucket() == spotter_store.DEFAULT_BUCKET
    warnings = [r for r in caplog.records if "PHOTO_BUCKET" in r.getMessage()]
    assert len(warnings) == 1


def test_unset_bucket_locally_is_quiet(monkeypatch, caplog):
    monkeypatch.delenv("PHOTO_BUCKET", raising=False)
    monkeypatch.delenv("K_SERVICE", raising=False)
    with caplog.at_level(logging.WARNING, logger="spotter.store"):
        assert spotter_store.photo_bucket() == spotter_store.DEFAULT_BUCKET
    assert caplog.records == []


def test_now_iso_format():
    from clock import now_iso

    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z", now_iso())


def test_every_route_module_uses_the_shared_clock():
    import fusion.intake
    import sites.routes
    import spotter.routes
    from clock import now_iso

    assert fusion.intake._now is now_iso
    assert sites.routes._now is now_iso
    assert spotter.routes._now is now_iso


def test_app_registers_all_blueprints():
    from app import app

    assert {"fusion", "spotter", "sites"} <= set(app.blueprints)
