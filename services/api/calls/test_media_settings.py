from pathlib import PurePosixPath
from types import SimpleNamespace

import jwt
import pytest

from calls import media
from incidents.errors import ApiError


CONFIG = {'LIVEKIT_URL': 'wss://test.livekit.cloud', 'LIVEKIT_API_KEY': 'test',
          'LIVEKIT_API_SECRET': 'test-only-secret-long-enough-for-hs256'}


@pytest.fixture
def container_path(monkeypatch):
    # Use the actual Linux image layout even when tests run on Windows.
    monkeypatch.setattr(media, 'Path', lambda _: SimpleNamespace(resolve=lambda: PurePosixPath('/app/calls/media.py')))
    for key in CONFIG:
        monkeypatch.delenv(key, raising=False)


def test_container_issues_credentials_from_injected_environment(container_path, monkeypatch):
    for key, value in CONFIG.items():
        monkeypatch.setenv(key, value)
    def no_dotenv(_):
        pytest.fail('Injected deployment settings must not read a local .env file')
    monkeypatch.setattr(media, 'dotenv_values', no_dotenv)
    result = media.credentials({'id': 'call', 'room': 'room', 'volunteerId': 'v', 'speakerIds': {'v': 'speaker'}},
                               {'role': 'volunteer', 'speakerId': 'speaker', 'speakerName': 'Volunteer'})
    assert result['serverUrl'] == CONFIG['LIVEKIT_URL']
    claims = jwt.decode(result['participantToken'], CONFIG['LIVEKIT_API_SECRET'], algorithms=['HS256'], issuer='test')
    assert claims['video']['canPublishSources'] == ['microphone', 'camera']


def test_unconfigured_container_returns_service_error_not_path_crash(container_path, monkeypatch):
    monkeypatch.setattr(media, 'dotenv_values', lambda _: {})
    with pytest.raises(ApiError) as error:
        media.settings()
    assert error.value.status == 503


def test_local_checkout_uses_root_dotenv_with_environment_precedence(tmp_path, monkeypatch):
    source = tmp_path / 'services' / 'api' / 'calls' / 'media.py'
    monkeypatch.setattr(media, '__file__', str(source))
    (tmp_path / '.env').write_text('\n'.join(f'{key}={value}' for key, value in CONFIG.items()))
    for key in CONFIG:
        monkeypatch.delenv(key, raising=False)
    assert media.settings() == CONFIG
    monkeypatch.setenv('LIVEKIT_URL', ' wss://injected.livekit.cloud ')
    assert media.settings() == {**CONFIG, 'LIVEKIT_URL': 'wss://injected.livekit.cloud'}
    monkeypatch.setenv('LIVEKIT_API_SECRET', '')
    with pytest.raises(ApiError):
        media.settings()
