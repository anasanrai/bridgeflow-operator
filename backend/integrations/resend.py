"""Resend integration — sends real follow-up emails via the Resend HTTP API.

Walks the action manifest and fires every action where:
  - type == "send_email"
  - priority == "immediate"

Uses the recipient from the call_analyst's prospect.email as the source of
truth (Agent 4 sometimes echoes the schema literal "string" in payload.to),
falling back to payload.to when prospect email is Unknown.

Mutates each action's status in place so Agent 5 and the final pipeline
result see the real outcome (sent / failed / skipped).
"""
from __future__ import annotations

import os
import re
from typing import Any

import httpx

RESEND_API = "https://api.resend.com/emails"
FROM_FALLBACK = "BridgeFlow <onboarding@resend.dev>"


def _from_address() -> str:
    raw = (os.environ.get("RESEND_FROM") or "").strip()
    if not raw:
        return FROM_FALLBACK
    return raw if "<" in raw else f"BridgeFlow <{raw}>"

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _valid_email(addr: str | None) -> bool:
    if not addr:
        return False
    a = addr.strip()
    if not a or a.lower() in {"unknown", "string", "none"}:
        return False
    return bool(_EMAIL_RE.match(a))


def _pick_recipient(action: dict, prospect_email: str | None) -> str | None:
    if _valid_email(prospect_email):
        return prospect_email.strip()  # type: ignore[union-attr]
    to = (action.get("payload") or {}).get("to")
    return to.strip() if _valid_email(to) else None


def _pick_content(
    action: dict,
    campaign: dict,
    used_campaign_idxs: set[int],
) -> tuple[str | None, str | None]:
    """Prefer the action's payload, fall back to the next un-used campaign email."""
    payload = action.get("payload") or {}
    subject = payload.get("subject") if payload.get("subject") not in (None, "", "string") else None
    body = payload.get("content") if payload.get("content") not in (None, "", "string") else None

    if not subject or not body:
        sequence = campaign.get("email_sequence") or []
        # prefer emails tagged "immediately"
        candidates = [
            (i, e)
            for i, e in enumerate(sequence)
            if i not in used_campaign_idxs and str(e.get("send_at", "")).lower() == "immediately"
        ]
        if not candidates:
            candidates = [
                (i, e) for i, e in enumerate(sequence) if i not in used_campaign_idxs
            ]
        if candidates:
            idx, email = candidates[0]
            used_campaign_idxs.add(idx)
            subject = subject or email.get("subject")
            body = body or email.get("body")

    return subject, body


def _body_as_html(body: str) -> str:
    escaped = (
        body.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
    return "<div>" + escaped.replace("\n", "<br>") + "</div>"


async def send_single_email(payload: dict) -> dict[str, Any]:
    """Send one already-resolved email payload (to/subject/content). Used by
    the Telegram webhook after the operator approves a held draft."""
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        return {"sent": False, "skipped_reason": "resend_credentials_missing"}
    recipient = (payload.get("to") or "").strip()
    subject = (payload.get("subject") or "").strip()
    body = payload.get("content") or ""
    if not recipient or not subject or not body:
        return {"sent": False, "error": "missing_recipient_or_content"}

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                RESEND_API,
                headers=headers,
                json={
                    "from": _from_address(),
                    "to": [recipient],
                    "subject": subject,
                    "html": _body_as_html(body),
                    "text": body,
                },
            )
            if resp.status_code in (200, 201, 202):
                data = resp.json()
                return {"sent": True, "id": data.get("id"), "to": recipient}
            return {
                "sent": False,
                "error": f"resend {resp.status_code}",
                "detail": resp.text[:300],
            }
    except Exception as exc:
        return {"sent": False, "error": f"{type(exc).__name__}: {exc}"}


def hold_immediate_emails_for_approval(
    actions_output: dict,
    call_analysis: dict,
    campaign: dict,
) -> list[dict[str, Any]]:
    """V2: instead of firing emails, mark immediate-priority sends as
    awaiting_approval and return their resolved payloads (recipient + subject
    + body) so the pipeline can store a pending_approval row and prompt the
    operator via Telegram. Mirrors send_immediate_emails' filtering /
    recipient-resolution / content-resolution logic so Agent 5 sees the same
    final action shape — just gated on a human reply."""
    actions = actions_output.get("actions") or []
    prospect_email = (call_analysis.get("prospect") or {}).get("email")

    held: list[dict[str, Any]] = []
    used_campaign_idxs: set[int] = set()

    targets = [
        a for a in actions
        if (a.get("type") == "send_email" and a.get("priority") == "immediate")
    ]
    for action in targets:
        recipient = _pick_recipient(action, prospect_email)
        subject, body = _pick_content(action, campaign, used_campaign_idxs)

        if not recipient or not subject or not body:
            action["status"] = "failed"
            action["execution"] = {
                "error": "missing_recipient" if not recipient else "missing_subject_or_body"
            }
            continue

        action["status"] = "awaiting_approval"
        action["execution"] = {
            "provider": "resend",
            "to": recipient,
            "subject": subject,
            "held_pending_telegram_approval": True,
        }
        held.append(
            {
                "sequence": action.get("sequence"),
                "to": recipient,
                "subject": subject,
                "content": body,
            }
        )

    return held


async def send_immediate_emails(
    actions_output: dict,
    call_analysis: dict,
    campaign: dict,
) -> list[dict[str, Any]]:
    """Send every `send_email` + `immediate` action. Mutates action statuses in place.
    Returns a summary list with per-action results for logging."""
    api_key = os.environ.get("RESEND_API_KEY")
    actions = actions_output.get("actions") or []
    prospect_email = (call_analysis.get("prospect") or {}).get("email")

    results: list[dict[str, Any]] = []
    used_campaign_idxs: set[int] = set()

    # Collect targets first so we can open a single client.
    targets = [
        a for a in actions
        if (a.get("type") == "send_email" and a.get("priority") == "immediate")
    ]
    if not targets:
        return results

    if not api_key:
        for action in targets:
            action["status"] = "skipped"
            action["execution"] = {"skipped_reason": "resend_credentials_missing"}
            results.append({"action": action.get("sequence"), "skipped_reason": "resend_credentials_missing"})
        return results

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        for action in targets:
            recipient = _pick_recipient(action, prospect_email)
            subject, body = _pick_content(action, campaign, used_campaign_idxs)

            if not recipient:
                action["status"] = "failed"
                action["execution"] = {"error": "no_valid_recipient"}
                results.append({"action": action.get("sequence"), "error": "no_valid_recipient"})
                continue
            if not subject or not body:
                action["status"] = "failed"
                action["execution"] = {"error": "missing_subject_or_body"}
                results.append({"action": action.get("sequence"), "error": "missing_subject_or_body"})
                continue

            try:
                resp = await client.post(
                    RESEND_API,
                    headers=headers,
                    json={
                        "from": _from_address(),
                        "to": [recipient],
                        "subject": subject,
                        "html": _body_as_html(body),
                        "text": body,
                    },
                )
                if resp.status_code in (200, 201, 202):
                    data = resp.json()
                    action["status"] = "sent"
                    action["execution"] = {
                        "provider": "resend",
                        "message_id": data.get("id"),
                        "to": recipient,
                    }
                    results.append({"action": action.get("sequence"), "sent": True, "id": data.get("id")})
                else:
                    action["status"] = "failed"
                    action["execution"] = {
                        "error": f"resend {resp.status_code}",
                        "detail": resp.text[:300],
                    }
                    results.append({"action": action.get("sequence"), "error": f"resend {resp.status_code}"})
            except Exception as exc:
                action["status"] = "failed"
                action["execution"] = {"error": f"{type(exc).__name__}: {exc}"}
                results.append({"action": action.get("sequence"), "error": str(exc)})

    return results
