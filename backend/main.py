"""BridgeFlow Operator — FastAPI app.

POST /analyze accepts a transcript and streams the full 5-agent pipeline back
as Server-Sent Events. Each agent's reasoning streams as `agent_delta` events
so the UI can show live thinking, then a single `agent_complete` event carries
the parsed JSON output before the next agent starts.
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import AsyncIterator

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# Load env from project root regardless of cwd
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from agents import (  # noqa: E402
    ACTION_EXECUTOR_SYSTEM,
    CALL_ANALYST_SYSTEM,
    CAMPAIGN_ARCHITECT_SYSTEM,
    LEAD_QUALIFIER_SYSTEM,
    REFLECTION_SYSTEM,
    build_action_executor_user,
    build_call_analyst_user,
    build_campaign_architect_user,
    build_lead_qualifier_user,
    build_reflection_user,
)
from agents.base import extract_json, stream_agent  # noqa: E402
from db import supabase_client  # noqa: E402
from models.schemas import AnalyzeRequest  # noqa: E402

app = FastAPI(title="BridgeFlow Operator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


AGENT_SEQUENCE = [
    "call_analyst",
    "lead_qualifier",
    "campaign_architect",
    "action_executor",
    "reflection_agent",
]


def sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def run_streaming_agent(
    index: int,
    name: str,
    system: str,
    user: str,
) -> AsyncIterator[tuple[str, dict]]:
    """Yield (sse_chunk, {}) deltas during streaming; last yield is ("", parsed_json)."""
    yield sse({"type": "agent_start", "agent": name, "index": index}), {}
    buffer: list[str] = []
    try:
        async for text in stream_agent(system, user):
            buffer.append(text)
            yield sse({"type": "agent_delta", "agent": name, "index": index, "delta": text}), {}
    except Exception as exc:
        yield sse({"type": "error", "agent": name, "message": f"{type(exc).__name__}: {exc}"}), {}
        raise

    raw = "".join(buffer)
    try:
        parsed = extract_json(raw)
    except ValueError as exc:
        yield sse({"type": "error", "agent": name, "message": str(exc)}), {}
        raise

    yield sse({"type": "agent_complete", "agent": name, "index": index, "output": parsed}), parsed


async def pipeline_stream(transcript: str) -> AsyncIterator[str]:
    call_id = supabase_client.insert_call(transcript)
    yield sse({"type": "pipeline_start", "call_id": call_id})

    outputs: dict[str, dict] = {}

    specs = [
        (
            "call_analyst",
            CALL_ANALYST_SYSTEM,
            lambda: build_call_analyst_user(transcript),
        ),
        (
            "lead_qualifier",
            LEAD_QUALIFIER_SYSTEM,
            lambda: build_lead_qualifier_user(outputs["call_analyst"]),
        ),
        (
            "campaign_architect",
            CAMPAIGN_ARCHITECT_SYSTEM,
            lambda: build_campaign_architect_user(
                outputs["call_analyst"], outputs["lead_qualifier"]
            ),
        ),
        (
            "action_executor",
            ACTION_EXECUTOR_SYSTEM,
            lambda: build_action_executor_user(
                outputs["call_analyst"],
                outputs["lead_qualifier"],
                outputs["campaign_architect"],
            ),
        ),
        (
            "reflection_agent",
            REFLECTION_SYSTEM,
            lambda: build_reflection_user(
                outputs["call_analyst"],
                outputs["lead_qualifier"],
                outputs["campaign_architect"],
                outputs["action_executor"],
            ),
        ),
    ]

    try:
        for idx, (name, system, build_user) in enumerate(specs, start=1):
            parsed: dict = {}
            async for chunk, out in run_streaming_agent(idx, name, system, build_user()):
                if chunk:
                    yield chunk
                if out:
                    parsed = out
            outputs[name] = parsed
            supabase_client.insert_analysis(call_id, name, parsed)
            # small nudge so the client can paint between agents
            await asyncio.sleep(0)

        supabase_client.insert_lead(
            call_id, outputs["call_analyst"], outputs["lead_qualifier"]
        )
        supabase_client.insert_actions(call_id, outputs["action_executor"])
        supabase_client.update_call_status(call_id or "", "complete")

        yield sse(
            {
                "type": "pipeline_complete",
                "call_id": call_id,
                "results": {
                    "call_analysis": outputs["call_analyst"],
                    "qualification": outputs["lead_qualifier"],
                    "campaign": outputs["campaign_architect"],
                    "actions": outputs["action_executor"],
                    "reflection": outputs["reflection_agent"],
                },
            }
        )
    except Exception as exc:
        supabase_client.update_call_status(call_id or "", "error")
        yield sse({"type": "error", "message": f"{type(exc).__name__}: {exc}"})


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "model": "claude-opus-4-7",
        "anthropic_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "supabase_configured": supabase_client.get_client() is not None,
    }


@app.get("/config")
async def config() -> dict:
    """Which integrations are live. Consumed by the UI's credential panel."""
    return {
        "anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "supabase": supabase_client.get_client() is not None,
        "resend": bool(os.environ.get("RESEND_API_KEY")),
        "telegram": bool(
            os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID")
        ),
    }


@app.get("/leads")
async def leads(limit: int = 100) -> dict:
    """Latest leads, enriched with the call analyst snapshot and decision.
    Returns an empty list (and `source: 'demo'`) when Supabase is not configured —
    the frontend falls back to seeded demo data in that case."""
    client = supabase_client.get_client()
    if client is None:
        return {"source": "demo", "leads": []}
    try:
        resp = (
            client.table("leads")
            .select("id,call_id,name,company,email,phone,score,decision,created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        return {"source": "supabase", "leads": rows}
    except Exception as exc:
        print(f"[supabase] /leads failed: {exc}")
        return {"source": "demo", "leads": []}


@app.post("/analyze")
async def analyze(req: AnalyzeRequest) -> StreamingResponse:
    return StreamingResponse(
        pipeline_stream(req.transcript),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
