"""Gemini Live client and the scripted double used by tests.

The double never calls Google. The real client is built only when a session
starts and no double was injected. It uses Agent Platform (Vertex) with the
voice-gateway service account, not an API key.
"""
import asyncio
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

RECEIVE_TIMEOUT = object()
TURN_WAIT_SECONDS = 20

SYSTEM_PREAMBLE = (
    "You are EMBER, a Bahasa Indonesia commander for a village fire volunteer. "
    "Speak Bahasa. Use only the digest JSON for incident facts. "
    "Do not invent coordinates, and do not set incident severity. "
    "When the volunteer reports what they see, call submit_observation with "
    "severity and a short text. Do not put coordinates in any tool call. "
    "Digest JSON:\n"
)


class ScriptedLive:
    """A Gemini test double. Each send consumes the next list of events."""

    def __init__(self, script=None):
        self.script = [list(step) for step in (script or [])]
        self.context = None
        self.manual = False
        self.audio = []
        self.frames = []
        self.tools = []
        self.opened = False
        self.closed = False
        self.activity = []

    def open(self, context):
        self.opened = True
        self.manual = True
        self.context = context
        self.activity.append("start")

    def send_audio(self, data):
        self.audio.append(data)
        return []

    def send_frame(self, data):
        self.frames.append(data)
        return []

    def end_activity(self):
        self.activity.append("end")
        return self._next()

    def respond_tool(self, name, result):
        self.tools.append((name, result))
        return self._next()

    def close(self):
        self.closed = True

    def _next(self):
        if not self.script:
            return []
        return self.script.pop(0)


class GeminiLiveClient:
    """Synchronous face over the async Gemini Live session."""

    def __init__(self, model=None, location=None, transcription_only=False):
        self.transcription_only = transcription_only
        self.model = model or os.getenv("LIVE_MODEL", "").strip() or "gemini-live-2.5-flash-native-audio"
        self.location = location or os.getenv("LIVE_LOCATION", "").strip() or "us-central1"
        self._loop = None
        self._thread = None
        self._cm = None
        self._session = None
        self._receive_future = None
        self._events = []
        self._lock = threading.Lock()

    def open(self, context):
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._loop.run_forever, daemon=True)
        self._thread.start()
        self._await(self._open(context))
        self._receive_future = asyncio.run_coroutine_threadsafe(self._pump(), self._loop)

    def send_audio(self, data):
        self._await(self._send_audio(data))
        return self._drain()

    def send_frame(self, data):
        self._await(self._send_frame(data))
        return self._drain()

    def end_activity(self):
        self._await(self._end_activity())
        return self._wait_for_turn()

    def respond_tool(self, name, result):
        self._await(self._send_tool(name, result))
        return self._wait_for_turn()

    def close(self):
        if self._receive_future is not None:
            self._receive_future.cancel()
            self._receive_future = None
        if self._cm is not None and self._loop is not None:
            try:
                self._await(self._cm.__aexit__(None, None, None))
            except Exception:
                logger.exception("Gemini Live close failed")
        if self._loop is not None:
            self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread is not None:
            self._thread.join(timeout=2)
        self._session = None
        self._cm = None

    def _wait_for_turn(self):
        """Collect events until a tool call or the turn completes."""
        deadline = time.monotonic() + TURN_WAIT_SECONDS
        collected = []
        while time.monotonic() < deadline:
            found = self._drain()
            collected.extend(found)
            if any(event.get("kind") in ("tool", "turn_complete") for event in found):
                return collected
            time.sleep(0.05)
        return collected

    def _drain(self):
        with self._lock:
            found = list(self._events)
            self._events.clear()
            return found

    def _await(self, coro):
        return asyncio.run_coroutine_threadsafe(coro, self._loop).result(timeout=20 if self.transcription_only else None)

    async def _open(self, context):
        from google import genai
        from google.genai import types

        client = genai.Client(
            vertexai=True,
            project=os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
            location=self.location,
        )
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            system_instruction=SYSTEM_PREAMBLE + _context_text(context),
            tools=[types.Tool(function_declarations=_declarations(types))],
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(disabled=True),
            ),
        )
        if self.transcription_only:
            config = types.LiveConnectConfig(
                response_modalities=["AUDIO"],
                input_audio_transcription=types.AudioTranscriptionConfig(),
                system_instruction=(
                    "This is a speech transcription connectivity test. Listen to the input audio. "
                    "Preserve the spoken language. Do not give advice or execute actions. "
                    "Your audio responses are discarded; only input audio transcription is displayed."
                ),
                realtime_input_config=types.RealtimeInputConfig(
                    automatic_activity_detection=types.AutomaticActivityDetection(disabled=False),
                ),
            )
        self._cm = client.aio.live.connect(model=self.model, config=config)
        self._session = await self._cm.__aenter__()
        if not self.transcription_only:
            await self._session.send_realtime_input(activity_start=types.ActivityStart())

    async def _pump(self):
        try:
            while True:
                async for message in self._session.receive():
                    events = _events_from(message)
                    if self.transcription_only:
                        events = [event for event in events if event["kind"] in ("transcript", "turn_complete")]
                    with self._lock:
                        self._events.extend(events)
                if not self.transcription_only:
                    break
        except Exception:
            logger.exception("Gemini Live receive ended")
            if self.transcription_only:
                with self._lock:
                    self._events.append({"kind": "error"})

    async def _end_activity(self):
        from google.genai import types

        await self._session.send_realtime_input(activity_end=types.ActivityEnd())

    async def _send_audio(self, data):
        from google.genai import types

        await self._session.send_realtime_input(
            audio=types.Blob(data=data, mime_type="audio/pcm;rate=16000"),
        )

    async def _send_frame(self, data):
        from google.genai import types

        await self._session.send_realtime_input(
            video=types.Blob(data=data, mime_type="image/jpeg"),
        )

    async def _send_tool(self, name, result):
        from google.genai import types

        call_id, payload = result if isinstance(result, tuple) else (None, result)
        response = {"result": payload}
        await self._session.send_tool_response(
            function_responses=[types.FunctionResponse(name=name, id=call_id, response=response)],
        )


def _context_text(context):
    import json
    return json.dumps(context, default=str)


def _declarations(types):
    severity = types.Schema(type="STRING", enum=["none", "smoke", "small_flame", "large_flame", "unknown"])
    return [
        types.FunctionDeclaration(
            name="submit_observation",
            description="Record what the volunteer is seeing. Do not include coordinates.",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "severity": severity,
                    "text": types.Schema(type="STRING"),
                },
            ),
        ),
        types.FunctionDeclaration(
            name="get_common_picture",
            description="Return the caller's current incident digest.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
        types.FunctionDeclaration(
            name="get_my_task",
            description="Return the caller's current approved task, or null.",
            parameters=types.Schema(type="OBJECT", properties={}),
        ),
    ]


def _events_from(message):
    events = []
    tool_call = getattr(message, "tool_call", None)
    if tool_call is not None:
        for call in getattr(tool_call, "function_calls", None) or []:
            events.append({
                "kind": "tool",
                "name": call.name,
                "id": getattr(call, "id", None),
                "args": dict(call.args or {}),
            })
    content = getattr(message, "server_content", None)
    transcription = getattr(content, "input_transcription", None) if content is not None else None
    if transcription is not None:
        events.append({"kind": "transcript", "text": getattr(transcription, "text", "") or "",
                       "finished": bool(getattr(transcription, "finished", False))})
    turn = getattr(content, "model_turn", None) if content is not None else None
    if turn is not None:
        for part in getattr(turn, "parts", None) or []:
            inline = getattr(part, "inline_data", None)
            if inline is not None and getattr(inline, "data", None):
                import base64
                raw = inline.data
                if isinstance(raw, str):
                    raw = raw.encode("ascii")
                events.append({"kind": "audio", "data": base64.b64encode(raw).decode("ascii")})
    if content is not None and getattr(content, "turn_complete", False):
        events.append({"kind": "turn_complete"})
    data = getattr(message, "data", None)
    if data and not any(event["kind"] == "audio" for event in events):
        import base64
        events.append({"kind": "audio", "data": base64.b64encode(data).decode("ascii")})
    return events
