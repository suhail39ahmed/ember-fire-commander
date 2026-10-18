"""Call-scoped transcript delivery with one local audio publisher per speaker."""
import base64
import json
import logging
import os
import time
import uuid
from pathlib import Path

from dotenv import dotenv_values
from simple_websocket import ConnectionClosed
from live.caps import MinuteCaps
from live.gemini import GeminiLiveClient
from live.session import _USAGE
from live.shared_transcripts import SharedTranscripts, CallAccessError, PublisherBusy

logger = logging.getLogger(__name__)
MAX_TEST_SECONDS = 120


def test_enabled():
    values = dotenv_values(Path(__file__).resolve().parent.parent.parent.parent / '.env')
    return os.getenv('EMBER_LIVEKIT_TEST_ENABLED', values.get('EMBER_LIVEKIT_TEST_ENABLED') or 'false').strip().lower() == 'true'


def run_transcription(user, ws, client=None, clock=time.monotonic, enabled=None, usage=None, store=None, max_seconds=None):
    max_seconds = MAX_TEST_SECONDS if max_seconds is None else max_seconds
    def send(payload):
        ws.send(json.dumps(payload))

    if not (test_enabled() if enabled is None else enabled):
        send({'type': 'session.closed', 'reason': 'test_disabled'})
        ws.close()
        return
    store = store or SharedTranscripts()
    caps = MinuteCaps.from_env(_USAGE if usage is None else usage)
    owner = uuid.uuid4().hex
    call_id = None
    live = None
    started = None
    lease_at = 0
    segment_id = None
    segment_text = ''
    reason = 'stopped'

    def forward(events):
        nonlocal segment_id, segment_text
        for event in events:
            kind = event.get('kind')
            if kind == 'error':
                raise RuntimeError('Gemini transcription ended')
            if kind not in ('transcript', 'turn_complete'):
                continue
            text = event.get('text', '') if kind == 'transcript' else ''
            finished = bool(event.get('finished')) or kind == 'turn_complete'
            if text:
                segment_id = segment_id or uuid.uuid4().hex
                segment_text += text
            if segment_id and (text or finished):
                store.append(call_id, user, owner, segment_id, segment_text, finished)
                if finished:
                    segment_id, segment_text = None, ''

    def stop_audio():
        nonlocal live, started, segment_id, segment_text
        try:
            if live is not None:
                forward(live._drain())
                if segment_id:
                    store.append(call_id, user, owner, segment_id, segment_text, True)
        finally:
            try:
                if live is not None:
                    live.close()
            finally:
                if started is not None:
                    caps.add(user['id'], max(0, clock() - started))
                live, started, segment_id, segment_text = None, None, None, ''
                if call_id:
                    store.release(call_id, user, owner)

    try:
        raw = ws.receive(timeout=10)
        if not isinstance(raw, str) or len(raw) > 32768:
            reason = 'invalid_start'
            return
        first = json.loads(raw)
        if not isinstance(first, dict) or first.get('type') != 'session.start':
            reason = 'invalid_start'
            return
        call_id = first.get('callId')
        after = first.get('afterSequence', 0)
        if type(after) is not int or after < 0 or after > 9007199254740991:
            reason = 'invalid_start'
            return
        member = store.authorize(call_id, user)
        send({'type': 'session.ready', 'callId': call_id, 'speakerId': member['speakerId'], 'maxSeconds': max_seconds})
        poll_at = clock() - 1
        while True:
            now = clock()
            if now - poll_at >= 1:
                events = store.read(call_id, user, after)
                for event in events:
                    send({'type': 'transcript.event', **event})
                    after = event['sequence']
                poll_at = now if len(events) < 100 else now - 1
            if live is not None:
                if now - started >= min(max_seconds, caps.remaining(user['id'])):
                    stop_audio()
                    send({'type': 'audio.closed', 'reason': 'time_limit'})
                else:
                    if now - lease_at >= 10:
                        store.claim(call_id, user, owner)
                        lease_at = now
                    forward(live._drain())
            raw = ws.receive(timeout=0.1)
            if raw is None:
                continue
            if not isinstance(raw, str) or len(raw) > 32768:
                reason = 'invalid_message'
                break
            message = json.loads(raw)
            if not isinstance(message, dict):
                reason = 'invalid_message'
                break
            kind = message.get('type')
            if kind == 'session.stop':
                break
            if kind == 'audio.stop':
                stop_audio()
            elif kind == 'audio.start' and live is None:
                if not caps.allow(user['id']):
                    send({'type': 'audio.closed', 'reason': 'cap_reached'})
                    continue
                try:
                    store.claim(call_id, user, owner)
                except PublisherBusy:
                    send({'type': 'audio.closed', 'reason': 'publisher_busy'})
                    continue
                started = lease_at = clock()
                live = client or GeminiLiveClient(transcription_only=True)
                try:
                    live.open({})
                except Exception:
                    logger.warning('Gemini publisher could not start', exc_info=True)
                    stop_audio()
                    send({'type': 'audio.closed', 'reason': 'transcription_unavailable'})
                    continue
                send({'type': 'audio.ready', 'speakerId': member['speakerId']})
            elif kind == 'audio' and live is not None:
                audio = base64.b64decode(message.get('data', ''), validate=True)
                if not audio or len(audio) > 16384 or len(audio) % 2:
                    reason = 'invalid_audio'
                    break
                forward(live.send_audio(audio))
    except ConnectionClosed:
        reason = 'stopped'
    except CallAccessError:
        reason = 'forbidden'
    except Exception:
        logger.warning('Shared call transcription failed', exc_info=True)
        reason = 'transcription_unavailable'
    finally:
        try:
            stop_audio()
        except Exception:
            logger.warning('Shared call transcription cleanup failed')
        try:
            send({'type': 'session.closed', 'reason': reason})
            ws.close()
        except Exception:
            pass
