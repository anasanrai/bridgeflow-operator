"""ElevenLabs streaming TTS — Jarvis voice.

Why this and not browser SpeechSynthesis: the browser API uses OS narrator
voices that sound like a GPS unit. ElevenLabs delivers cinematic, ~40s
British-male voices that land much closer to film-Jarvis. Latency under
the eleven_turbo_v2_5 model is ~250-400ms first byte, fast enough to feel
conversational when paired with sentence-boundary streaming on the
frontend.

This module proxies POST → ElevenLabs streaming TTS endpoint and pipes
the MP3 bytes back to our /tts route. The frontend caller buffers the
chunks, plays the resulting blob, and queues the next sentence behind
it so audio plays in order without gaps.
"""
from __future__ import annotations

import os
from typing import AsyncIterator

import httpx

# Daniel — British, mature, calm — closest single-voice match to JARVIS.
DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"
DEFAULT_MODEL_ID = "eleven_turbo_v2_5"
TIMEOUT = httpx.Timeout(60.0, connect=10.0, read=60.0)

DEFAULT_VOICE_SETTINGS = {
    "stability": 0.5,
    "similarity_boost": 0.8,
    "style": 0.3,
    "use_speaker_boost": True,
}


def elevenlabs_configured() -> bool:
    return bool(os.environ.get("ELEVENLABS_API_KEY"))


def default_voice_id() -> str:
    return (os.environ.get("ELEVENLABS_VOICE_ID") or DEFAULT_VOICE_ID).strip()


def default_model_id() -> str:
    return (os.environ.get("ELEVENLABS_MODEL_ID") or DEFAULT_MODEL_ID).strip()


async def stream_tts(
    text: str,
    *,
    voice_id: str | None = None,
    model_id: str | None = None,
) -> AsyncIterator[bytes]:
    """Stream MP3 bytes from ElevenLabs. Best-effort: yields nothing when
    misconfigured or on transient errors — caller can fall back to
    browser TTS."""
    api_key = os.environ.get("ELEVENLABS_API_KEY")
    if not api_key or not (text or "").strip():
        return

    url = (
        "https://api.elevenlabs.io/v1/text-to-speech/"
        f"{voice_id or default_voice_id()}/stream"
    )
    payload: dict = {
        "text": text,
        "model_id": model_id or default_model_id(),
        "voice_settings": DEFAULT_VOICE_SETTINGS,
        # Cuts the trailing pause ElevenLabs sometimes adds.
        "optimize_streaming_latency": 3,
    }
    headers = {
        "xi-api-key": api_key,
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    print(
                        f"[elevenlabs] {resp.status_code}: {body[:200].decode('utf-8', 'replace')}"
                    )
                    return
                async for chunk in resp.aiter_bytes():
                    if chunk:
                        yield chunk
    except httpx.TimeoutException:
        print("[elevenlabs] timeout")
    except Exception as exc:
        print(f"[elevenlabs] {type(exc).__name__}: {exc}")
