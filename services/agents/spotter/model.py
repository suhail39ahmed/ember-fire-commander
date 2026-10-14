"""Thin wrapper around Vertex AI Gemini Flash through the google-genai SDK.

Tests replace `get_model()` with a fake, so no test makes a real call.
"""
import json
import os

DEFAULT_MODEL = "gemini-2.5-flash"


def model_name():
    return os.getenv("EMBER_FLASH_MODEL", "").strip() or DEFAULT_MODEL


class FlashModel:
    def __init__(self, client=None, name=None):
        self._client = client
        self.name = name or model_name()

    def _sdk(self):
        if self._client is None:
            from google import genai

            self._client = genai.Client(
                vertexai=True,
                project=os.getenv("GOOGLE_CLOUD_PROJECT", "ember-fire-commander"),
                location=os.getenv("EMBER_VERTEX_LOCATION", "asia-southeast1"),
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
        return json.loads(response.text)


_model = None


def get_model():
    global _model
    if _model is None:
        _model = FlashModel()
    return _model
