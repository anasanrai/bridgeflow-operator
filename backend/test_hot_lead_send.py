"""End-to-end test: run the 5-agent pipeline on the demo transcript,
override the prospect email to the verification target, fire real
Resend + Telegram integrations, and print the outcome.

Usage:
    python test_hot_lead_send.py [recipient_email]
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env", override=True)

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
from integrations import notify_hot_lead, send_immediate_emails  # noqa: E402


async def run_one(label: str, system: str, user: str) -> dict:
    print(f"\n=== {label} ===")
    buf: list[str] = []
    async for text in stream_agent(system, user):
        sys.stdout.write(text)
        sys.stdout.flush()
        buf.append(text)
    print()
    return extract_json("".join(buf))


async def main() -> None:
    recipient = sys.argv[1] if len(sys.argv) > 1 else "raianasan10@gmail.com"
    transcript = (ROOT / "demo_transcript.txt").read_text()

    print(f"RESEND_FROM = {os.environ.get('RESEND_FROM') or '(unset → onboarding@resend.dev)'}")
    print(f"Test recipient = {recipient}")

    call_analysis = await run_one("Agent 1 — Call Analyst", CALL_ANALYST_SYSTEM, build_call_analyst_user(transcript))
    qualification = await run_one("Agent 2 — Lead Qualifier", LEAD_QUALIFIER_SYSTEM, build_lead_qualifier_user(call_analysis))
    campaign      = await run_one("Agent 3 — Campaign Architect", CAMPAIGN_ARCHITECT_SYSTEM, build_campaign_architect_user(call_analysis, qualification))
    actions       = await run_one("Agent 4 — Action Executor", ACTION_EXECUTOR_SYSTEM, build_action_executor_user(call_analysis, qualification, campaign))

    # Force HOT + recipient override before integrations fire.
    qualification["score"] = "HOT"
    call_analysis.setdefault("prospect", {})["email"] = recipient

    print("\n=== Firing integrations (Telegram + Resend) ===")
    tg_result, email_results = await asyncio.gather(
        notify_hot_lead(call_analysis, qualification),
        send_immediate_emails(actions, call_analysis, campaign),
    )

    reflection = await run_one("Agent 5 — Reflection", REFLECTION_SYSTEM, build_reflection_user(call_analysis, qualification, campaign, actions))

    print("\n=== Result ===")
    print(json.dumps({
        "score": qualification.get("score"),
        "prospect_email": call_analysis.get("prospect", {}).get("email"),
        "telegram": tg_result,
        "emails": email_results,
        "rep_briefing": reflection.get("rep_briefing"),
    }, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
