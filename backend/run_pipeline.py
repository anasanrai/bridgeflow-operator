"""CLI runner: pipe the demo transcript through all 5 agents and print outputs.

Usage:
    python run_pipeline.py                     # uses ../demo_transcript.txt
    python run_pipeline.py path/to/transcript.txt
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

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


async def run_one(name: str, system: str, user: str) -> dict:
    print(f"\n{'=' * 70}\n▶ {name}\n{'=' * 70}")
    buf: list[str] = []
    async for text in stream_agent(system, user):
        sys.stdout.write(text)
        sys.stdout.flush()
        buf.append(text)
    raw = "".join(buf)
    print()
    parsed = extract_json(raw)
    return parsed


async def main() -> None:
    transcript_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "demo_transcript.txt"
    transcript = transcript_path.read_text()

    call_analysis = await run_one("Agent 1 — Call Analyst", CALL_ANALYST_SYSTEM, build_call_analyst_user(transcript))
    qualification = await run_one("Agent 2 — Lead Qualifier", LEAD_QUALIFIER_SYSTEM, build_lead_qualifier_user(call_analysis))
    campaign = await run_one("Agent 3 — Campaign Architect", CAMPAIGN_ARCHITECT_SYSTEM, build_campaign_architect_user(call_analysis, qualification))
    actions = await run_one("Agent 4 — Action Executor", ACTION_EXECUTOR_SYSTEM, build_action_executor_user(call_analysis, qualification, campaign))
    reflection = await run_one("Agent 5 — Reflection", REFLECTION_SYSTEM, build_reflection_user(call_analysis, qualification, campaign, actions))

    print(f"\n{'=' * 70}\n✓ Pipeline complete\n{'=' * 70}")
    summary = {
        "score": qualification.get("score"),
        "decision": qualification.get("decision"),
        "prospect": call_analysis.get("prospect"),
        "action_count": len(actions.get("actions", []) or []),
        "pipeline_confidence": reflection.get("pipeline_confidence"),
        "rep_briefing": reflection.get("rep_briefing"),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
