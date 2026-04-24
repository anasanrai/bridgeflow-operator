"""Shared agent runtime: streams Opus 4.7 and yields text deltas.

Every agent outputs JSON. We stream the raw text deltas so the UI can show
the agent "thinking" in real time, then parse once the stream completes.
"""
from __future__ import annotations

import json
import os
import re
from typing import AsyncIterator

from anthropic import AsyncAnthropic

MODEL = "claude-opus-4-7"
MAX_TOKENS = 4096

_client: AsyncAnthropic | None = None


def _get_client() -> AsyncAnthropic:
    global _client
    if _client is None:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        _client = AsyncAnthropic(api_key=api_key)
    return _client


async def stream_agent(system: str, user: str) -> AsyncIterator[str]:
    """Yield text deltas from an Opus 4.7 run."""
    client = _get_client()
    async with client.messages.stream(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        async for text in stream.text_stream:
            yield text


async def run_agent(system: str, user: str) -> tuple[str, dict]:
    """Run an agent and return (raw_text, parsed_json).

    Buffers the stream — use stream_agent() instead when you need live deltas.
    """
    buffer = []
    async for chunk in stream_agent(system, user):
        buffer.append(chunk)
    raw = "".join(buffer)
    return raw, extract_json(raw)


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a response, tolerating stray prose or fences."""
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))

    start = text.find("{")
    if start == -1:
        raise ValueError(f"No JSON object found in agent output:\n{text}")

    depth = 0
    in_string = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
    raise ValueError(f"Unterminated JSON in agent output:\n{text}")
