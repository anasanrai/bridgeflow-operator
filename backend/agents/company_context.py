"""V2: prepend the COMPANY CONTEXT block to every agent system prompt.

When no profile exists, the agent runs with the original system prompt — so
V1 behavior is preserved exactly. When a profile exists, the block is
prepended verbatim above the agent's own instructions, separated by a clear
divider so the model treats it as ground truth.
"""
from __future__ import annotations


def _v(d: dict, key: str, default: str = "Unknown") -> str:
    raw = d.get(key)
    if raw is None:
        return default
    s = str(raw).strip()
    return s or default


def build_company_context_block(profile: dict | None) -> str | None:
    if not profile:
        return None
    company = _v(profile, "company_name")
    if company == "Unknown":
        # Empty/blank profile — don't pollute the prompt with placeholders.
        return None

    industry = _v(profile, "industry")
    what = _v(profile, "what_you_sell")
    clients = _v(profile, "target_client")
    agent_name = _v(profile, "agent_name", "Alex")
    tone = _v(profile, "agent_tone", "Professional")
    persona = _v(profile, "agent_persona", "—")
    pricing = _v(profile, "pricing_notes", "—")
    booking = _v(profile, "booking_link", "—")
    custom = _v(profile, "custom_instructions", "—")

    objections = []
    for i in (1, 2, 3):
        q = _v(profile, f"objection_{i}_q", "")
        a = _v(profile, f"objection_{i}_a", "")
        if q and q != "Unknown" and a and a != "Unknown":
            objections.append(f"Q: {q} → A: {a}")
    objections_block = "\n".join(objections) if objections else "(none configured)"

    return (
        "COMPANY CONTEXT (always use this):\n"
        f"Company: {company} | Industry: {industry}\n"
        f"What we sell: {what}\n"
        f"Our clients: {clients}\n"
        f"Agent name: {agent_name} | Tone: {tone}\n"
        f"Agent persona: {persona}\n"
        f"Pricing: {pricing}\n"
        f"Booking link: {booking}\n"
        "\n"
        "Known objections and our responses:\n"
        f"{objections_block}\n"
        "\n"
        f"Custom instructions: {custom}\n"
        "\n"
        f"Always write as {agent_name} from {company}.\n"
        "Never reveal you are an AI unless directly asked.\n"
        f"Always use the tone: {tone}."
    )


def with_company_context(base_system: str, profile: dict | None) -> str:
    """Return base_system unchanged when no profile is set."""
    block = build_company_context_block(profile)
    if not block:
        return base_system
    return f"{block}\n\n---\n\n{base_system}"
