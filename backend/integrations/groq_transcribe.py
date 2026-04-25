"""V2 Beta: Groq Whisper-large-v3-turbo transcription.

Wraps the Groq audio.transcriptions API. Returns plain dicts so the FastAPI
route can JSON-serialize them directly. Never raises on missing creds — the
caller decides how to surface "not configured" to the UI.
"""
from __future__ import annotations

import os
from typing import Any

from groq import Groq

MODEL = "whisper-large-v3-turbo"
ALLOWED_MIME = {
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/aac",
}
ALLOWED_EXT = {".mp3", ".wav", ".m4a"}
MAX_BYTES = 25 * 1024 * 1024  # Groq free-tier hard limit


class TranscriptionError(Exception):
    pass


def is_configured() -> bool:
    return bool(os.environ.get("GROQ_API_KEY"))


def _client() -> Groq:
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise TranscriptionError("GROQ_API_KEY is not set")
    return Groq(api_key=key)


def transcribe_bytes(filename: str, data: bytes) -> dict[str, Any]:
    """Send audio bytes to Groq Whisper. Returns
    `{transcript, duration_seconds, language}`."""
    if not data:
        raise TranscriptionError("empty file")
    if len(data) > MAX_BYTES:
        raise TranscriptionError(
            f"file too large ({len(data)} bytes); max is {MAX_BYTES}"
        )

    try:
        result = _client().audio.transcriptions.create(
            file=(filename, data),
            model=MODEL,
            response_format="verbose_json",
        )
    except Exception as exc:
        raise TranscriptionError(f"{type(exc).__name__}: {exc}") from exc

    payload = result.model_dump() if hasattr(result, "model_dump") else dict(result)
    duration = payload.get("duration")
    return {
        "transcript": (payload.get("text") or "").strip(),
        "duration_seconds": float(duration) if duration is not None else None,
        "language": payload.get("language") or "en",
        "model": MODEL,
    }
