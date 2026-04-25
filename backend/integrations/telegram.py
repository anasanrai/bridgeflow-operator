"""Telegram notifier — fires HOT-lead alerts and (V2) email-approval prompts.

Silent no-op when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are not set, so the
pipeline keeps running in local/demo mode.
"""
from __future__ import annotations

import os

import httpx

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"
TELEGRAM_ANSWER_CB = "https://api.telegram.org/bot{token}/answerCallbackQuery"
TELEGRAM_EDIT_MARKUP = "https://api.telegram.org/bot{token}/editMessageReplyMarkup"


def telegram_configured() -> bool:
    return bool(os.environ.get("TELEGRAM_BOT_TOKEN")) and bool(
        os.environ.get("TELEGRAM_CHAT_ID")
    )


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


# ── V2: email approval prompts ──────────────────────────────────────────


def _truncate(s: str | None, n: int) -> str:
    if not s:
        return "—"
    s = str(s).strip()
    return s if len(s) <= n else s[:n].rstrip() + "…"


def format_approval_prompt(
    qualification: dict,
    call_analysis: dict,
    email_payload: dict,
    *,
    with_buttons: bool = False,
) -> str:
    """The Telegram approval message body. When with_buttons=True we drop
    the trailing 'Reply: APPROVE/EDIT/SKIP' lines because the inline
    keyboard speaks for itself."""
    score = (qualification.get("score") or "").upper() or "LEAD"
    confidence = qualification.get("confidence", "?")
    decision = (qualification.get("decision") or "—").replace("_", " ")
    prospect = call_analysis.get("prospect", {}) or {}
    name = prospect.get("name") or "Unknown"
    company = prospect.get("company") or "Unknown"
    subject = email_payload.get("subject") or "(no subject)"
    body_preview = _truncate(email_payload.get("content"), 150)

    base = (
        f"[{score}] {name} @ {company}\n"
        f"Score: {confidence}% | {decision}\n"
        "\n"
        "📧 Draft email ready:\n"
        f"Subject: {subject}\n"
        f"Preview: {body_preview}"
    )
    if with_buttons:
        return base + "\n\nTap to act ↓"
    return (
        base
        + "\n\nReply:\n"
        "✅ APPROVE - send now\n"
        "✏️ EDIT - send me full draft\n"
        "⏭️ SKIP - archive lead"
    )


def _approval_keyboard(approval_id: str) -> dict:
    """Telegram inline keyboard: 3 buttons in one row, callback_data carries
    the action verb + pending_approvals.id."""
    return {
        "inline_keyboard": [
            [
                {"text": "✅ Approve & send", "callback_data": f"approve:{approval_id}"},
                {"text": "✏️ Edit", "callback_data": f"edit:{approval_id}"},
                {"text": "⏭️ Skip", "callback_data": f"skip:{approval_id}"},
            ]
        ]
    }


async def send_text(
    text: str,
    *,
    reply_to_message_id: int | None = None,
    reply_markup: dict | None = None,
) -> dict:
    """Generic Telegram sendMessage. Returns {ok, message_id?, error?}.
    Never raises."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return {"ok": False, "skipped_reason": "credentials_missing"}
    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }
    if reply_to_message_id is not None:
        payload["reply_to_message_id"] = reply_to_message_id
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(TELEGRAM_API.format(token=token), json=payload)
            data = resp.json()
            if resp.status_code == 200 and data.get("ok"):
                msg = data.get("result") or {}
                return {"ok": True, "message_id": msg.get("message_id")}
            return {
                "ok": False,
                "error": f"telegram_api {resp.status_code}: {str(data)[:200]}",
            }
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


async def send_approval_prompt(
    qualification: dict,
    call_analysis: dict,
    email_payload: dict,
    *,
    approval_id: str | None = None,
) -> dict:
    """Send the Telegram approval prompt for a held immediate email. When
    approval_id is provided, attach an inline keyboard so the operator can
    tap APPROVE/EDIT/SKIP instead of typing it. Returns {ok, message_id?, error?}."""
    text = format_approval_prompt(
        qualification, call_analysis, email_payload, with_buttons=approval_id is not None
    )
    reply_markup = _approval_keyboard(approval_id) if approval_id else None
    return await send_text(text, reply_markup=reply_markup)


async def answer_callback_query(callback_query_id: str, text: str | None = None) -> None:
    """Acknowledge a tapped inline button so Telegram stops the spinner.
    Best-effort — never raises."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token or not callback_query_id:
        return
    payload: dict = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(TELEGRAM_ANSWER_CB.format(token=token), json=payload)
    except Exception:
        pass


async def clear_message_keyboard(message_id: int) -> None:
    """Strip the inline keyboard off a previously-sent approval message so
    the operator can't double-tap. Best-effort — never raises."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id or not message_id:
        return
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.post(
                TELEGRAM_EDIT_MARKUP.format(token=token),
                json={
                    "chat_id": chat_id,
                    "message_id": message_id,
                    "reply_markup": {"inline_keyboard": []},
                },
            )
    except Exception:
        pass
