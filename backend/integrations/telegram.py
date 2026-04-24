"""Telegram notifier — fires a HOT-lead alert via the Bot API.

Silent no-op when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set, so the
pipeline keeps running in local/demo mode.
"""
from __future__ import annotations

import os

import httpx

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


def _fmt_message(call_analysis: dict, qualification: dict) -> str:
    prospect = call_analysis.get("prospect", {}) or {}
    name = prospect.get("name") or "Unknown"
    company = prospect.get("company") or "Unknown"
    confidence = qualification.get("confidence", "?")
    decision = (qualification.get("decision") or "—").replace("_", " ")
    est_value = qualification.get("estimated_deal_value") or "Unknown"
    next_contact = qualification.get("best_contact_time") or "—"

    return (
        f"🔥 HOT LEAD — {name} @ {company}\n"
        f"Score: {confidence}% | Decision: {decision}\n"
        f"Est. value: {est_value}\n"
        f"Next: {next_contact}"
    )


async def notify_hot_lead(
    call_analysis: dict,
    qualification: dict,
) -> dict:
    """Send a Telegram alert when the lead is HOT.
    Returns {"sent": bool, "skipped_reason"?: str, "error"?: str}.
    Never raises — pipeline resilience is more important than notification."""
    score = (qualification.get("score") or "").lower()
    if score != "hot":
        return {"sent": False, "skipped_reason": "not_hot"}

    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return {"sent": False, "skipped_reason": "credentials_missing"}

    text = _fmt_message(call_analysis, qualification)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                TELEGRAM_API.format(token=token),
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "disable_web_page_preview": True,
                },
            )
            if resp.status_code == 200 and resp.json().get("ok"):
                return {"sent": True}
            return {
                "sent": False,
                "error": f"telegram_api {resp.status_code}: {resp.text[:200]}",
            }
    except Exception as exc:
        return {"sent": False, "error": f"{type(exc).__name__}: {exc}"}
