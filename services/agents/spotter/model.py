"""Thin wrapper around Vertex AI Gemini Flash through the google-genai SDK.

Tests replace `get_model()` with a fake, so no test makes a real call.
"""
import json
import os

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_TIMEOUT_SECONDS = 30


class ModelError(Exception):
    """The model replied, but not with a JSON object we can use."""


def model_name():
    return os.getenv("EMBER_FLASH_MODEL", "").strip() or DEFAULT_MODEL


def timeout_seconds():
    raw = os.getenv("EMBER_FLASH_TIMEOUT_SECONDS", "").strip()
    try:
        value = float(raw)
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS
    return value if value > 0 else DEFAULT_TIMEOUT_SECONDS


class FlashModel:
    def __init__(self, client=None, name=None):
        self._client = client
        self.name = name or model_name()

    def _sdk(self):
        if self._client is None:
            from google import genai
            from google.genai import types

            self._client = genai.Client(
                vertexai=True,
                project=os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
                location=os.getenv("EMBER_VERTEX_LOCATION", "asia-southeast1"),
                # The SDK takes milliseconds. A slow call fails instead of hanging.
                http_options=types.HttpOptions(timeout=int(timeout_seconds() * 1000)),
            )
        return self._client

    def json(self, prompt, image=None, mime_type=None):
        """Ask for a JSON object and return it parsed."""
        from google.genai import types

        parts = []
        if image is not None:
            parts.append(types.Part.from_bytes(data=image, mime_type=mime_type))
        parts.append(prompt)
        response = self._sdk().models.generate_content(
            model=self.name,
            contents=parts,
            config=types.GenerateContentConfig(
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )
        try:
            parsed = json.loads(response.text)
        except (TypeError, ValueError) as exc:
            raise ModelError("model did not return JSON") from exc
        if not isinstance(parsed, dict):
            raise ModelError("model did not return a JSON object")
        return parsed


_model = None


def get_model():
    global _model
    if _model is None:
        _model = FlashModel()
    return _model
