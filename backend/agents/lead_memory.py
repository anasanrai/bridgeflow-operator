"""V2: lead memory — prior pipeline runs for the same prospect get
injected into the agents' system prompts as a PRIOR CONTEXT block.

Trigger: at the very start of pipeline_stream, before Agent 1 runs, we
extract any prospect identifier we can find (email is the most reliable;
company name is the fallback), look up matching pipeline_runs, and pack
the last few into a compact context block.

Design choices:
  - Extraction is a regex pass on the raw transcript — no extra LLM call
    so the demo doesn't pay an extra ~5s.
  - Memory block goes onto Agents 1, 2, 3, and 5. Agent 4 (action
    executor) doesn't need history; it just emits the action manifest.
  - When no prior runs exist (or no identifier could be extracted), the
    block is None and pipeline_stream falls through to V1 behavior.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Iterable

# ── Regex extraction ────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s\-.])?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}"
)


def extract_prospect_identifier(transcript: str) -> dict:
    """Best-effort extract email + phone from a raw transcript. Returns
    {email, phone} where each is the first match or None. We only use
    email for memory lookups today — phone is captured for future use."""
    text = transcript or ""
    email_match = _EMAIL_RE.search(text)
    phone_match = _PHONE_RE.search(text)
    return {
        "email": email_match.group(0).lower() if email_match else None,
        "phone": phone_match.group(0) if phone_match else None,
    }


# ── Memory block builder ────────────────────────────────────────────────


def _human_relative(iso: str) -> str:
    try:
        when = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except Exception:
        return iso
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - when
    secs = delta.total_seconds()
    if secs < 60:
        return "just now"
    if secs < 3600:
        return f"{int(secs // 60)} min ago"
    if secs < 86400:
        return f"{int(secs // 3600)} h ago"
    return f"{int(secs // 86400)} d ago"


def build_memory_block(prior_runs: Iterable[dict]) -> str | None:
    """Produce a compact PRIOR CONTEXT block to prepend to agent system
    prompts. Returns None when there's no usable history."""
    runs = list(prior_runs or [])
    if not runs:
        return None

    # Most-recent first; cap at 3 to keep prompt tokens tight.
    runs = sorted(runs, key=lambda r: r.get("created_at") or "", reverse=True)[:3]

    lines = [
        "PRIOR CONTEXT (this prospect has called before — use this history):",
        f"  Total prior calls: {len(runs)}",
    ]
    for i, r in enumerate(runs, start=1):
        score = (r.get("score") or "unknown").upper()
        decision = (r.get("decision") or "—").replace("_", " ")
        when = _human_relative(r.get("created_at") or "")
        snippet = (r.get("transcript_preview") or "").strip().replace("\n", " ")[:140]
        lines.append(
            f"  Call {i} ({when}): score {score} · decision {decision}"
        )
        if snippet:
            lines.append(f"    snippet: \"{snippet}…\"")

    lines += [
        "",
        "Use this history to:",
        "  - Treat this as a follow-up call, not first contact.",
        "  - Reference what was already discussed instead of re-asking.",
        "  - Avoid repeating campaign emails or offers from prior runs.",
        "  - Update the score/decision based on new signals (escalation, cooling).",
    ]
    return "\n".join(lines)


def with_memory_context(base_system: str, memory_block: str | None) -> str:
    """Prepend the memory block to a system prompt. Returns base_system
    unchanged when there's no memory."""
    if not memory_block:
        return base_system
    return f"{memory_block}\n\n---\n\n{base_system}"


def memory_summary_for_event(prior_runs: list[dict]) -> dict:
    """Compact dict for the SSE memory_loaded event. UI uses these fields
    directly — keep the keys stable."""
    if not prior_runs:
        return {"prior_count": 0}
    latest = sorted(prior_runs, key=lambda r: r.get("created_at") or "", reverse=True)[0]
    return {
        "prior_count": len(prior_runs),
        "last_call_at": latest.get("created_at"),
        "last_call_relative": _human_relative(latest.get("created_at") or ""),
        "last_score": (latest.get("score") or "").lower() or None,
        "last_decision": latest.get("decision"),
    }
