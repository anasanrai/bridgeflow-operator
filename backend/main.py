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
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

# Load env from project root regardless of cwd
ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

from agents import (  # noqa: E402
    ACTION_EXECUTOR_SYSTEM,
    CALL_ANALYST_SYSTEM,
    CAMPAIGN_ARCHITECT_SYSTEM,
    CREDENTIALS_SYSTEM,
    LEAD_QUALIFIER_SYSTEM,
    PLAYBOOK_SYSTEM,
    REFLECTION_SYSTEM,
    VALIDATION_SYSTEM,
    WORKFLOW_DRAFT_SYSTEM,
    WORKFLOW_REFINE_SYSTEM,
    build_action_executor_user,
    build_call_analyst_user,
    build_campaign_architect_user,
    build_credentials_user,
    build_lead_qualifier_user,
    build_playbook_user,
    build_reflection_user,
    build_validation_user,
    build_workflow_draft_user,
    build_workflow_refine_user,
    with_company_context,
)
from agents import (  # noqa: E402
    build_consultant_context_block,
    build_consultant_system,
    build_memory_block,
    extract_prospect_identifier,
    memory_summary_for_event,
    with_memory_context,
)
from agents.base import extract_json, run_agent, stream_agent  # noqa: E402
from db import supabase_client  # noqa: E402
from integrations import (  # noqa: E402
    GROQ_ALLOWED_EXT,
    GROQ_MAX_BYTES,
    TranscriptionError,
    groq_configured,
    hold_immediate_emails_for_approval,
    notify_hot_lead,
    send_approval_prompt,
    send_immediate_emails,
    send_single_email,
    send_telegram_text,
    telegram_answer_callback,
    telegram_clear_keyboard,
    telegram_configured,
    transcribe_bytes,
)
from models.schemas import (  # noqa: E402
    AnalyzeRequest,
    CompanyProfile,
    ConsultantRequest,
    CredentialsRequest,
    EditApprovalRequest,
    PlaybookRequest,
    TestEmailRequest,
    ValidateWorkflowRequest,
    WorkflowDraftRequest,
    WorkflowRefineRequest,
)

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

    # V2: load the company profile once, inject into every agent's system prompt.
    company_profile = supabase_client.get_company_profile()

    # V2 lead memory — regex-extract any prospect identifier from the
    # raw transcript and look up prior pipeline_runs for the same person.
    # When matches exist, prepend a PRIOR CONTEXT block to agents 1/2/3/5
    # so they treat this as a follow-up call instead of first contact.
    ident = extract_prospect_identifier(transcript)
    prior_runs = supabase_client.get_prior_runs_for_prospect(
        email=ident.get("email"),
        company=None,            # we don't know company yet — rely on email match
        exclude_call_id=call_id,
        limit=5,
    )
    memory_block = build_memory_block(prior_runs)
    if memory_block:
        yield sse(
            {
                "type": "memory_loaded",
                **memory_summary_for_event(prior_runs),
                "matched_email": ident.get("email"),
            }
        )

    def _wrap(base: str, *, with_memory: bool = True) -> str:
        # Profile context first, then memory (so memory survives even if
        # no profile is set). Agents see both blocks above their role
        # instructions.
        out = with_company_context(base, company_profile)
        if with_memory and memory_block:
            out = with_memory_context(out, memory_block)
        return out

    outputs: dict[str, dict] = {}

    specs = [
        (
            "call_analyst",
            _wrap(CALL_ANALYST_SYSTEM),
            lambda: build_call_analyst_user(transcript),
        ),
        (
            "lead_qualifier",
            _wrap(LEAD_QUALIFIER_SYSTEM),
            lambda: build_lead_qualifier_user(outputs["call_analyst"]),
        ),
        (
            "campaign_architect",
            _wrap(CAMPAIGN_ARCHITECT_SYSTEM),
            lambda: build_campaign_architect_user(
                outputs["call_analyst"], outputs["lead_qualifier"]
            ),
        ),
        (
            "action_executor",
            # Action executor doesn't need memory — it just emits the manifest.
            _wrap(ACTION_EXECUTOR_SYSTEM, with_memory=False),
            lambda: build_action_executor_user(
                outputs["call_analyst"],
                outputs["lead_qualifier"],
                outputs["campaign_architect"],
            ),
        ),
        (
            "reflection_agent",
            _wrap(REFLECTION_SYSTEM),
            lambda: build_reflection_user(
                outputs["call_analyst"],
                outputs["lead_qualifier"],
                outputs["campaign_architect"],
                outputs["action_executor"],
            ),
        ),
    ]

    # V2 approval mode: when Telegram is configured AND the lead is HOT/WARM
    # AND there's an immediate-priority email in the manifest, hold the email
    # for human approval instead of auto-sending. Otherwise V1 behavior is
    # preserved exactly.
    held_emails_for_approval: list[dict] = []

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
            await asyncio.sleep(0)

            # After Agent 4 produces the action manifest:
            #   * Always run notify_hot_lead (HOT alert).
            #   * If approval-mode applies → hold immediate emails (status =
            #     awaiting_approval) so Agent 5 can reflect on the held state.
            #   * Otherwise (V1 path) → fire send_immediate_emails immediately.
            if name == "action_executor":
                yield sse({"type": "integrations_start"})
                qualification = outputs.get("lead_qualifier") or {}
                score = (qualification.get("score") or "").lower()
                actions_list = (
                    outputs["action_executor"].get("actions") or []
                )
                has_immediate_email = any(
                    a.get("type") == "send_email"
                    and a.get("priority") == "immediate"
                    for a in actions_list
                )
                approval_mode = (
                    telegram_configured()
                    and score in {"hot", "warm"}
                    and has_immediate_email
                )

                tg_alert_task = notify_hot_lead(
                    outputs["call_analyst"], outputs["lead_qualifier"]
                )
                if approval_mode:
                    # Mutates action statuses to awaiting_approval and returns the held payloads.
                    held_emails_for_approval = hold_immediate_emails_for_approval(
                        outputs["action_executor"],
                        outputs["call_analyst"],
                        outputs["campaign_architect"],
                    )
                    email_results = [
                        {
                            "action": h.get("sequence"),
                            "held_for_approval": True,
                            "to": h.get("to"),
                            "subject": h.get("subject"),
                        }
                        for h in held_emails_for_approval
                    ]
                else:
                    email_results = await send_immediate_emails(
                        outputs["action_executor"],
                        outputs["call_analyst"],
                        outputs["campaign_architect"],
                    )

                tg_result = await tg_alert_task
                yield sse(
                    {
                        "type": "integrations_complete",
                        "telegram": tg_result,
                        "emails": email_results,
                        "actions": outputs["action_executor"],
                        "approval_mode": approval_mode,
                    }
                )

        # Pipeline post-processing: persist + Telegram approval prompts (after Agent 5).
        supabase_client.insert_lead(
            call_id, outputs["call_analyst"], outputs["lead_qualifier"]
        )
        supabase_client.insert_actions(call_id, outputs["action_executor"])
        supabase_client.update_call_status(call_id or "", "complete")

        # V2 QA: persist a pipeline_runs row so /history and the dashboard can
        # show real history without re-joining 4 tables. approval_state is
        # populated below if we held emails.
        supabase_client.insert_pipeline_run(
            call_id,
            transcript,
            outputs["call_analyst"],
            outputs["lead_qualifier"],
            status="complete",
            approval_state="pending" if held_emails_for_approval else "none",
        )

        # If we held emails earlier, send the approval prompt to Telegram now
        # (after Agent 5) and persist a pending_approvals row per held email.
        # Order: insert row first so we can stamp the inline-keyboard
        # callback_data with the approval_id, then send the prompt, then
        # update the row with the returned message_id (used for reply-to
        # correlation when the operator types instead of tapping).
        if held_emails_for_approval and call_id:
            pending_records: list[dict] = []
            for held in held_emails_for_approval:
                pending = supabase_client.insert_pending_approval(
                    call_id, held, telegram_message_id=None
                )
                approval_id = (pending or {}).get("id")
                tg_resp = await send_approval_prompt(
                    outputs["lead_qualifier"],
                    outputs["call_analyst"],
                    held,
                    approval_id=approval_id,
                )
                msg_id = tg_resp.get("message_id") if tg_resp.get("ok") else None
                if approval_id and msg_id:
                    supabase_client.update_pending_approval(
                        approval_id, telegram_message_id=msg_id
                    )
                pending_records.append(
                    {
                        "id": approval_id,
                        "to": held.get("to"),
                        "subject": held.get("subject"),
                        "telegram_sent": bool(tg_resp.get("ok")),
                        "telegram_message_id": msg_id,
                    }
                )
            yield sse(
                {
                    "type": "approval_pending",
                    "approvals": pending_records,
                }
            )

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
        "groq": groq_configured(),
        "telegram_approval_mode": telegram_configured(),
    }


# ── V2: Company identity vault ──────────────────────────────────────────


@app.get("/company-profile")
async def get_company_profile() -> JSONResponse:
    profile = supabase_client.get_company_profile()
    return JSONResponse({"profile": profile})


@app.post("/company-profile")
async def upsert_company_profile(req: CompanyProfile) -> JSONResponse:
    payload = req.model_dump(exclude_none=False)
    saved = supabase_client.upsert_company_profile(payload)
    if saved is None:
        # Supabase isn't configured OR insert failed — surface a clear 503
        # instead of a silent success so the UI can show a real error.
        raise HTTPException(503, "supabase_not_configured_or_write_failed")
    return JSONResponse({"profile": saved})


# ── V2: In-dashboard consultant ─────────────────────────────────────────


def _agent_outputs_for_call(call_id: str) -> dict[str, dict]:
    rows = supabase_client.get_analyses_for_call(call_id)
    out: dict[str, dict] = {}
    for r in rows:
        name = r.get("agent_name")
        body = r.get("agent_output") or {}
        if name:
            out[name] = body
    return out


@app.post("/consultant")
async def consultant(req: ConsultantRequest) -> StreamingResponse:
    """Stream a single Opus 4.7 consultant turn with full pipeline context."""
    call = supabase_client.get_call_record(req.pipeline_id)
    if call is None:
        raise HTTPException(404, "pipeline_not_found")
    transcript = call.get("transcript")
    agent_outputs = _agent_outputs_for_call(req.pipeline_id)
    profile = supabase_client.get_company_profile()
    company_name = (profile or {}).get("company_name") or "BridgeFlow"

    system = build_consultant_system(company_name)
    context_block = build_consultant_context_block(transcript, agent_outputs, profile)

    # First user turn carries the full pipeline context; subsequent turns are
    # the conversation history + the new question.
    messages: list[dict] = []
    if not req.conversation_history:
        first = (
            "Below is the full pipeline state you'll be answering questions about.\n\n"
            f"{context_block}\n\n"
            f"My first question: {req.message}"
        )
        messages.append({"role": "user", "content": first})
    else:
        # Replay history then append the new message. Make sure the first user
        # turn in history carries the context if it isn't already there.
        history = list(req.conversation_history)
        first_user_idx = next(
            (i for i, m in enumerate(history) if m.role == "user"), None
        )
        if first_user_idx is not None and "── Original call transcript ──" not in history[first_user_idx].content:
            history[first_user_idx] = type(history[first_user_idx])(
                role="user",
                content=(
                    "Below is the full pipeline state you'll be answering questions about.\n\n"
                    f"{context_block}\n\n"
                    f"My first question: {history[first_user_idx].content}"
                ),
            )
        for m in history:
            messages.append({"role": m.role, "content": m.content})
        messages.append({"role": "user", "content": req.message})

    async def event_stream():
        yield f"data: {json.dumps({'type': 'start'})}\n\n"
        buffer: list[str] = []
        try:
            from anthropic import AsyncAnthropic

            from agents.base import MAX_TOKENS, MODEL, _get_client  # type: ignore

            client = _get_client()  # type: ignore
            async with client.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=system,
                messages=messages,
            ) as stream:
                async for text in stream.text_stream:
                    buffer.append(text)
                    yield f"data: {json.dumps({'type': 'delta', 'delta': text})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': f'{type(exc).__name__}: {exc}'})}\n\n"
            return
        yield f"data: {json.dumps({'type': 'done', 'full': ''.join(buffer)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── V2: Telegram approval webhook ───────────────────────────────────────


def _classify_reply(text: str) -> str | None:
    t = (text or "").strip().upper()
    if not t:
        return None
    if t.startswith("APPROVE") or t.startswith("✅"):
        return "approve"
    if t.startswith("EDIT") or t.startswith("✏"):
        return "edit"
    if t.startswith("SKIP") or t.startswith("⏭"):
        return "skip"
    return None


async def _resolve_approval(
    pending: dict, action: str, *, source: str
) -> dict:
    """Apply APPROVE/EDIT/SKIP to a pending_approvals row. Returns a result
    dict the caller can serialise. Used by both the text-reply path and the
    inline-keyboard callback path so behavior stays consistent."""
    approval_id = pending.get("id")
    payload = pending.get("email_payload") or {}
    msg_id = pending.get("telegram_message_id")

    if action == "skip":
        supabase_client.update_pending_approval(
            approval_id, status="skipped", approved_at=None
        )
        supabase_client.update_action_status(
            pending.get("call_id"),
            payload.get("sequence"),
            {"status": "skipped"},
        )
        if msg_id:
            await telegram_clear_keyboard(msg_id)
        await send_telegram_text(
            f"⏭️ Skipped. Email to {payload.get('to') or 'recipient'} archived."
        )
        return {"ok": True, "action": "skipped", "via": source}

    if action == "edit":
        body = payload.get("content") or "(empty)"
        subject = payload.get("subject") or "(no subject)"
        recipient = payload.get("to") or "(no recipient)"
        full = (
            f"✏️ Full draft:\n\n"
            f"To: {recipient}\nSubject: {subject}\n\n{body}\n\n"
            "Tap ✅ Approve when ready, or ⏭️ Skip to archive."
        )
        # Send the full draft as a fresh message that *also* carries the
        # Approve/Skip buttons, so the operator can act without scrolling
        # back to the original prompt.
        from integrations.telegram import _approval_keyboard  # type: ignore
        await send_telegram_text(
            full,
            reply_markup=_approval_keyboard(approval_id) if approval_id else None,
        )
        return {"ok": True, "action": "edit_drafted", "via": source}

    # action == "approve"
    result = await send_single_email(payload)
    if msg_id:
        await telegram_clear_keyboard(msg_id)
    if result.get("sent"):
        supabase_client.update_pending_approval(
            approval_id,
            status="approved",
            email_payload={**payload, "sent_message_id": result.get("id")},
        )
        supabase_client.update_action_status(
            pending.get("call_id"),
            payload.get("sequence"),
            {"status": "sent"},
        )
        await send_telegram_text(
            f"✅ Sent to {payload.get('to')}. Resend id: {result.get('id')}"
        )
        return {
            "ok": True,
            "action": "approved",
            "resend_id": result.get("id"),
            "via": source,
        }
    error = result.get("error") or result.get("skipped_reason") or "unknown"
    supabase_client.update_action_status(
        pending.get("call_id"),
        payload.get("sequence"),
        {"status": "failed"},
    )
    await send_telegram_text(f"❌ Send failed: {error}")
    return {"ok": True, "action": "approve_failed", "error": error, "via": source}


@app.post("/telegram-webhook")
async def telegram_webhook(request: Request) -> JSONResponse:
    """Telegram setWebhook posts updates here. Two paths:
      1) callback_query — operator tapped an inline button (preferred).
      2) message text APPROVE/EDIT/SKIP — manual reply (fallback).
    Always returns 200 — Telegram retries on non-200, which we don't want."""
    try:
        update = await request.json()
    except Exception:
        return JSONResponse({"ok": True, "ignored": "invalid_json"})

    # ── Path 1: tapped inline keyboard button ──
    cb = update.get("callback_query")
    if cb:
        cb_id = cb.get("id")
        data = cb.get("data") or ""
        verb, _, approval_id = data.partition(":")
        if verb not in {"approve", "edit", "skip"} or not approval_id:
            await telegram_answer_callback(cb_id, "Unrecognised action.")
            return JSONResponse({"ok": True, "ignored": "bad_callback_data"})

        pending = supabase_client.get_pending_approval(approval_id)
        if pending is None:
            await telegram_answer_callback(cb_id, "Approval not found.")
            return JSONResponse({"ok": True, "ignored": "approval_not_found"})

        if pending.get("status") != "pending" and verb != "edit":
            await telegram_answer_callback(
                cb_id, f"Already {pending.get('status')}."
            )
            return JSONResponse(
                {"ok": True, "ignored": "already_resolved", "status": pending.get("status")}
            )

        # Acknowledge tap immediately so Telegram stops the spinner.
        ack_text = {"approve": "Sending…", "edit": "Drafting full…", "skip": "Skipping…"}[verb]
        await telegram_answer_callback(cb_id, ack_text)
        result = await _resolve_approval(pending, verb, source="button")
        return JSONResponse(result)

    # ── Path 2: typed text reply ──
    msg = update.get("message") or update.get("channel_post") or {}
    text = msg.get("text") or msg.get("caption") or ""
    action = _classify_reply(text)
    if not action:
        return JSONResponse({"ok": True, "ignored": "no_command"})

    reply_to = msg.get("reply_to_message") or {}
    target_msg_id = reply_to.get("message_id")
    pending = (
        supabase_client.get_pending_approval_by_message_id(target_msg_id)
        if target_msg_id
        else None
    )
    if pending is None:
        pending = supabase_client.get_latest_pending_approval()
    if pending is None:
        await send_telegram_text("No pending approval to act on.")
        return JSONResponse({"ok": True, "ignored": "no_pending_approval"})

    if pending.get("status") != "pending" and action != "edit":
        await send_telegram_text(
            f"That approval was already {pending.get('status')}."
        )
        return JSONResponse(
            {"ok": True, "ignored": "already_resolved", "status": pending.get("status")}
        )

    result = await _resolve_approval(pending, action, source="text")
    return JSONResponse(result)


@app.get("/leads")
async def leads(limit: int = 100, include_archived: bool = False) -> dict:
    """Latest leads, enriched with the call analyst snapshot and decision.
    Returns an empty list (and `source: 'demo'`) when Supabase is not configured —
    the frontend falls back to seeded demo data in that case."""
    client = supabase_client.get_client()
    if client is None:
        return {"source": "demo", "leads": []}
    try:
        q = (
            client.table("leads")
            .select("id,call_id,name,company,email,phone,score,decision,status,created_at")
            .order("created_at", desc=True)
            .limit(limit)
        )
        # Default view excludes archived rows; ?archived=1 to include them.
        if not include_archived:
            q = q.or_("status.is.null,status.neq.archived")
        resp = q.execute()
        rows = getattr(resp, "data", None) or []
        return {"source": "supabase", "leads": rows}
    except Exception as exc:
        print(f"[supabase] /leads failed: {exc}")
        return {"source": "demo", "leads": []}


async def _run_json_agent(
    system: str, user: str, label: str, max_tokens: int = 4096
) -> dict:
    """Helper for /playbook, /credentials, /validate-workflow.
    Runs an Opus 4.7 agent and returns its parsed JSON, surfacing useful
    errors to the HTTP layer."""
    try:
        _, parsed = await run_agent(system, user, max_tokens=max_tokens)
    except Exception as exc:
        raise HTTPException(502, f"{label}: {type(exc).__name__}: {exc}") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(502, f"{label}: agent returned non-object JSON")
    return parsed


def _streaming_json_agent(
    system: str,
    user: str,
    label: str,
    *,
    max_tokens: int = 16384,
    on_complete: callable | None = None,  # type: ignore[valid-type]
) -> StreamingResponse:
    """Used for the two heaviest workflow endpoints (/workflow-draft +
    /workflow-refine). Opus 4.7 generation runs ~50-60s for a full n8n
    workflow JSON, which exceeds Railway's edge-proxy idle-timeout — the
    upstream returns 502 'Application failed to respond' if no bytes flow.

    SSE-style streaming keeps the connection visibly active by emitting
    a delta event for every text chunk Anthropic returns. Frontend reads
    until it sees `{type: 'done', result: {...}}`, then proceeds.

    `on_complete` runs after parse + before the final SSE event, so
    callers can persist the result (e.g. workflow_drafts row insert)."""

    async def event_stream():
        yield f"data: {json.dumps({'type': 'start', 'label': label})}\n\n"
        buf: list[str] = []
        chunks_seen = 0
        try:
            async for text in stream_agent(system, user, max_tokens=max_tokens):
                buf.append(text)
                chunks_seen += 1
                # Push a tiny tick every chunk so Railway's edge sees a
                # live connection. Includes character count so the UI
                # can show a "generating…" progress hint if it wants.
                yield f"data: {json.dumps({'type': 'delta', 'chunks': chunks_seen, 'chars': sum(len(s) for s in buf)})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': f'{type(exc).__name__}: {exc}'})}\n\n"
            return

        raw = "".join(buf)
        try:
            parsed = extract_json(raw)
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': f'json_parse: {exc}'})}\n\n"
            return
        if not isinstance(parsed, dict):
            yield f"data: {json.dumps({'type': 'error', 'message': 'agent returned non-object JSON'})}\n\n"
            return

        # Persist + any other side-effects before announcing done.
        if on_complete is not None:
            try:
                on_complete(parsed)
            except Exception as exc:
                # Non-fatal — log and continue. The user still gets the
                # generated workflow even if our DB insert fumbles.
                print(f"[stream] on_complete({label}) failed: {exc}")

        yield f"data: {json.dumps({'type': 'done', 'result': parsed})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/playbook")
async def playbook(req: PlaybookRequest) -> JSONResponse:
    """V2 — Opus 4.7 produces a structured playbook from the pipeline result."""
    out = await _run_json_agent(
        PLAYBOOK_SYSTEM, build_playbook_user(req.pipeline), "playbook"
    )
    if req.call_id:
        supabase_client.insert_workflow_draft(
            req.call_id, out, None, None, None, platform="n8n"
        )
    return JSONResponse(out)


@app.post("/workflow-draft")
async def workflow_draft(req: WorkflowDraftRequest) -> StreamingResponse:
    """V2 — Opus 4.7 generates a production n8n workflow JSON from the
    playbook. Streamed (SSE) because full generation runs ~55s and would
    otherwise hit Railway's edge-proxy idle timeout."""

    def persist(parsed: dict) -> None:
        if req.call_id:
            supabase_client.insert_workflow_draft(
                req.call_id, req.playbook, parsed, None, None, platform="n8n"
            )

    return _streaming_json_agent(
        WORKFLOW_DRAFT_SYSTEM,
        build_workflow_draft_user(req.playbook, req.pipeline),
        "workflow_draft",
        max_tokens=16384,  # full n8n workflows are 8-12K JSON tokens
        on_complete=persist,
    )


@app.post("/workflow-refine")
async def workflow_refine(req: WorkflowRefineRequest):
    """V2 self-correcting loop. Streamed (SSE) like /workflow-draft to
    survive Railway's edge proxy. Cap at 5 passes server-side via
    pass_number — generous because the auto-loop self-caps at 2 and any
    additional passes are user-triggered (Refine again button). When
    there are no issues, returns the workflow unchanged as a one-shot
    SSE 'done' event."""
    if req.pass_number > 5:
        raise HTTPException(429, "max_refinement_passes_exceeded")

    if not req.issues:
        # Nothing to fix — emit a synthetic done event so the frontend's
        # SSE reader gets the same shape it expects.
        unchanged = req.workflow

        async def passthrough():
            yield f"data: {json.dumps({'type': 'start', 'label': 'workflow_refine_noop'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'result': unchanged})}\n\n"

        return StreamingResponse(
            passthrough(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    def persist(parsed: dict) -> None:
        if req.call_id:
            supabase_client.insert_workflow_draft(
                req.call_id,
                None,
                parsed,
                None,
                None,
                platform=f"n8n (refined pass {req.pass_number})",
            )

    return _streaming_json_agent(
        WORKFLOW_REFINE_SYSTEM,
        build_workflow_refine_user(req.workflow, req.issues),
        f"workflow_refine pass {req.pass_number}",
        max_tokens=16384,
        on_complete=persist,
    )


@app.post("/credentials")
async def credentials(req: CredentialsRequest) -> JSONResponse:
    """V2 — Opus 4.7 enumerates the credentials the workflow needs to run."""
    out = await _run_json_agent(
        CREDENTIALS_SYSTEM, build_credentials_user(req.workflow), "credentials"
    )
    if req.call_id:
        supabase_client.insert_workflow_draft(
            req.call_id, None, req.workflow, out, None, platform="n8n"
        )
    return JSONResponse(out)


@app.post("/validate-workflow")
async def validate_workflow(req: ValidateWorkflowRequest) -> JSONResponse:
    """V2 — Opus 4.7 audits the workflow JSON for completeness."""
    out = await _run_json_agent(
        VALIDATION_SYSTEM, build_validation_user(req.workflow), "validation"
    )
    if req.call_id:
        supabase_client.insert_workflow_draft(
            req.call_id, None, req.workflow, None, out, platform="n8n"
        )
    return JSONResponse(out)


@app.post("/test-email")
async def test_email(req: TestEmailRequest) -> JSONResponse:
    """Credentials page → 'Send test email'. Uses send_single_email so the
    operator can verify Resend before a real run."""
    payload = {
        "to": req.to,
        "subject": req.subject or "BridgeFlow Operator — Resend test",
        "content": req.content
        or "If you got this, your Resend integration is wired up correctly.\n\n— BridgeFlow Operator",
    }
    result = await send_single_email(payload)
    if result.get("sent"):
        return JSONResponse({"sent": True, "id": result.get("id"), "to": req.to})
    raise HTTPException(502, f"resend: {result.get('error') or result.get('skipped_reason')}")


@app.get("/history")
async def history(limit: int = 100) -> JSONResponse:
    """V2 QA: pipeline_runs table for the History page."""
    rows = supabase_client.list_pipeline_runs(limit=limit)
    return JSONResponse({"runs": rows, "source": "supabase" if rows else "demo"})


@app.patch("/leads/{lead_id}")
async def patch_lead(lead_id: str, payload: dict) -> JSONResponse:
    saved = supabase_client.update_lead(lead_id, payload or {})
    if saved is None:
        raise HTTPException(404, "lead_not_found_or_unchanged")
    return JSONResponse({"lead": saved})


@app.delete("/leads/{lead_id}")
async def archive_lead(lead_id: str) -> JSONResponse:
    """Soft delete: status='archived'."""
    saved = supabase_client.update_lead(lead_id, {"status": "archived"})
    if saved is None:
        raise HTTPException(404, "lead_not_found")
    return JSONResponse({"lead": saved, "archived": True})


# ── V2 dashboard approvals — same flow as Telegram, just from the UI ────


@app.get("/approvals")
async def list_approvals(status: str = "pending", limit: int = 50) -> JSONResponse:
    rows = supabase_client.list_pending_approvals(
        status=status if status else None, limit=limit
    )
    return JSONResponse({"approvals": rows, "count": len(rows)})


@app.post("/approvals/{approval_id}/approve")
async def approve_approval(approval_id: str) -> JSONResponse:
    pending = supabase_client.get_pending_approval(approval_id)
    if pending is None:
        raise HTTPException(404, "approval_not_found")
    if pending.get("status") != "pending":
        raise HTTPException(409, f"already_{pending.get('status')}")
    result = await _resolve_approval(pending, "approve", source="dashboard")
    return JSONResponse(result)


@app.post("/approvals/{approval_id}/skip")
async def skip_approval(approval_id: str) -> JSONResponse:
    pending = supabase_client.get_pending_approval(approval_id)
    if pending is None:
        raise HTTPException(404, "approval_not_found")
    if pending.get("status") != "pending":
        raise HTTPException(409, f"already_{pending.get('status')}")
    result = await _resolve_approval(pending, "skip", source="dashboard")
    return JSONResponse(result)


@app.post("/approvals/{approval_id}/edit")
async def edit_approval(approval_id: str, req: EditApprovalRequest) -> JSONResponse:
    """Patch email_payload (subject/content/to) — does NOT send. Operator
    must call /approve afterwards to actually fire the email."""
    pending = supabase_client.get_pending_approval(approval_id)
    if pending is None:
        raise HTTPException(404, "approval_not_found")
    if pending.get("status") != "pending":
        raise HTTPException(409, f"already_{pending.get('status')}")
    payload = dict(pending.get("email_payload") or {})
    if req.to is not None:
        payload["to"] = req.to.strip()
    if req.subject is not None:
        payload["subject"] = req.subject
    if req.content is not None:
        payload["content"] = req.content
    supabase_client.update_pending_approval(approval_id, email_payload=payload)
    return JSONResponse({"approval_id": approval_id, "email_payload": payload, "status": "pending"})


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)) -> JSONResponse:
    """V2 Beta — Groq Whisper-large-v3-turbo transcription.
    Accepts a multipart .mp3 / .wav / .m4a upload and returns
    `{ transcript, duration_seconds, language, model }`."""
    if not groq_configured():
        raise HTTPException(503, "groq_not_configured")

    name = (file.filename or "audio").lower()
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""
    if ext not in GROQ_ALLOWED_EXT:
        raise HTTPException(415, f"unsupported audio type: {ext or 'unknown'}")

    data = await file.read()
    if len(data) > GROQ_MAX_BYTES:
        raise HTTPException(413, f"file exceeds {GROQ_MAX_BYTES} bytes")

    try:
        result = await asyncio.to_thread(transcribe_bytes, name, data)
    except TranscriptionError as exc:
        raise HTTPException(502, f"groq: {exc}") from exc

    return JSONResponse(result)


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
