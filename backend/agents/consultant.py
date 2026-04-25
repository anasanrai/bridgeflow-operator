"""V2 in-dashboard consultant — single Opus 4.7 streaming call with full
pipeline context."""
from __future__ import annotations

import json as _json

SYSTEM_TEMPLATE = """You are a senior sales consultant reviewing a pipeline result for {company_name}.

You have full access to:
- The original call transcript
- All 5 agent analyses
- The lead qualification and reasoning
- The drafted email sequence
- The action manifest
- The reflection agent's flags

Your job: answer questions about this result honestly, suggest improvements, rewrite specific outputs when asked, and explain any decision the agents made.

When asked to rewrite an email: output the full rewritten email immediately, ready to copy.
When asked why a lead was scored X: cite specific transcript evidence.
When asked to improve something: do it, don't describe it.

Be direct. Be specific. Use the actual data."""


def build_system(company_name: str) -> str:
    return SYSTEM_TEMPLATE.format(company_name=company_name or "this company")


def build_context_block(
    transcript: str | None,
    agent_outputs: dict[str, dict],
    company_profile: dict | None,
) -> str:
    """Pack the entire pipeline state into a single human-readable block that
    gets prepended to the user's first message. Subsequent turns rely on the
    conversation history and don't repeat this."""
    chunks: list[str] = []
    if company_profile and company_profile.get("company_name"):
        chunks.append(
            "── Company profile ──\n"
            + _json.dumps(
                {k: v for k, v in company_profile.items() if k not in {"created_at", "updated_at", "id"}},
                indent=2,
                default=str,
            )
        )
    if transcript:
        chunks.append("── Original call transcript ──\n" + transcript.strip())
    for label in (
        "call_analyst",
        "lead_qualifier",
        "campaign_architect",
        "action_executor",
        "reflection_agent",
    ):
        out = agent_outputs.get(label)
        if out:
            chunks.append(
                f"── Agent output: {label} ──\n"
                + _json.dumps(out, indent=2, default=str)
            )
    return "\n\n".join(chunks)
