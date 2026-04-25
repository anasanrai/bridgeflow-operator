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
    build_action_executor_user,
    build_call_analyst_user,
    build_campaign_architect_user,
    build_credentials_user,
    build_lead_qualifier_user,
    build_playbook_user,
    build_reflection_user,
    build_validation_user,
    build_workflow_draft_user,
    with_company_context,
)
from agents import (  # noqa: E402
    build_consultant_context_block,
    build_consultant_system,
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
    telegram_configured,
    transcribe_bytes,
)
from models.schemas import (  # noqa: E402
    AnalyzeRequest,
    CompanyProfile,
    ConsultantRequest,
    CredentialsRequest,
    PlaybookRequest,
    ValidateWorkflowRequest,
    WorkflowDraftRequest,
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

    outputs: dict[str, dict] = {}

    specs = [
        (
            "call_analyst",
            with_company_context(CALL_ANALYST_SYSTEM, company_profile),
            lambda: build_call_analyst_user(transcript),
        ),
        (
            "lead_qualifier",
            with_company_context(LEAD_QUALIFIER_SYSTEM, company_profile),
            lambda: build_lead_qualifier_user(outputs["call_analyst"]),
        ),
        (
            "campaign_architect",
            with_company_context(CAMPAIGN_ARCHITECT_SYSTEM, company_profile),
            lambda: build_campaign_architect_user(
                outputs["call_analyst"], outputs["lead_qualifier"]
            ),
        ),
        (
            "action_executor",
            with_company_context(ACTION_EXECUTOR_SYSTEM, company_profile),
            lambda: build_action_executor_user(
                outputs["call_analyst"],
                outputs["lead_qualifier"],
                outputs["campaign_architect"],
            ),
        ),
        (
            "reflection_agent",
            with_company_context(REFLECTION_SYSTEM, company_profile),
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

        # If we held emails earlier, send the approval prompt to Telegram now
        # (after Agent 5) and persist a pending_approvals row per held email.
        if held_emails_for_approval and call_id:
            pending_records: list[dict] = []
            for held in held_emails_for_approval:
                tg_resp = await send_approval_prompt(
                    outputs["lead_qualifier"],
                    outputs["call_analyst"],
                    held,
                )
                msg_id = tg_resp.get("message_id") if tg_resp.get("ok") else None
                pending = supabase_client.insert_pending_approval(
                    call_id, held, telegram_message_id=msg_id
                )
                pending_records.append(
                    {
                        "id": (pending or {}).get("id"),
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


@app.post("/telegram-webhook")
async def telegram_webhook(request: Request) -> JSONResponse:
    """Telegram setWebhook posts updates here. We accept text replies that
    start with APPROVE / EDIT / SKIP and act on the matching pending approval.
    Always returns 200 — Telegram retries on non-200, which we don't want."""
    try:
        update = await request.json()
    except Exception:
        return JSONResponse({"ok": True, "ignored": "invalid_json"})

    msg = update.get("message") or update.get("channel_post") or {}
    text = msg.get("text") or msg.get("caption") or ""
    action = _classify_reply(text)
    if not action:
        return JSONResponse({"ok": True, "ignored": "no_command"})

    # Correlate with the original approval prompt via reply_to_message; fall
    # back to the most recent pending approval.
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

    if pending.get("status") != "pending":
        await send_telegram_text(
            f"That approval was already {pending.get('status')}."
        )
        return JSONResponse(
            {"ok": True, "ignored": "already_resolved", "status": pending.get("status")}
        )

    approval_id = pending.get("id")
    payload = pending.get("email_payload") or {}

    if action == "skip":
        supabase_client.update_pending_approval(
            approval_id, status="skipped", approved_at=None
        )
        await send_telegram_text(
            f"⏭️ Skipped. Email to {payload.get('to') or 'recipient'} archived."
        )
        return JSONResponse({"ok": True, "action": "skipped"})

    if action == "edit":
        body = payload.get("content") or "(empty)"
        subject = payload.get("subject") or "(no subject)"
        recipient = payload.get("to") or "(no recipient)"
        full = (
            f"✏️ Full draft:\n\n"
            f"To: {recipient}\nSubject: {subject}\n\n{body}\n\n"
            "Reply with APPROVE / SKIP after editing in your email client."
        )
        await send_telegram_text(full)
        # Status stays pending; user still needs to APPROVE/SKIP after editing.
        return JSONResponse({"ok": True, "action": "edit_drafted"})

    # action == "approve"
    result = await send_single_email(payload)
    if result.get("sent"):
        supabase_client.update_pending_approval(
            approval_id,
            status="approved",
            email_payload={**payload, "sent_message_id": result.get("id")},
        )
        await send_telegram_text(
            f"✅ Sent to {payload.get('to')}. Resend id: {result.get('id')}"
        )
        return JSONResponse(
            {"ok": True, "action": "approved", "resend_id": result.get("id")}
        )
    error = result.get("error") or result.get("skipped_reason") or "unknown"
    await send_telegram_text(f"❌ Send failed: {error}")
    return JSONResponse({"ok": True, "action": "approve_failed", "error": error})


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


async def _run_json_agent(
    system: str, user: str, label: str, max_tokens: int = 4096
) -> dict:
    """Helper for /playbook, /workflow-draft, /credentials, /validate-workflow.
    Runs an Opus 4.7 agent and returns its parsed JSON, surfacing useful
    errors to the HTTP layer."""
    try:
        _, parsed = await run_agent(system, user, max_tokens=max_tokens)
    except Exception as exc:
        raise HTTPException(502, f"{label}: {type(exc).__name__}: {exc}") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(502, f"{label}: agent returned non-object JSON")
    return parsed


@app.post("/playbook")
async def playbook(req: PlaybookRequest) -> JSONResponse:
    """V2 — Opus 4.7 produces a structured playbook from the pipeline result."""
    out = await _run_json_agent(
        PLAYBOOK_SYSTEM, build_playbook_user(req.pipeline), "playbook"
    )
    return JSONResponse(out)


@app.post("/workflow-draft")
async def workflow_draft(req: WorkflowDraftRequest) -> JSONResponse:
    """V2 — Opus 4.7 generates a production n8n workflow JSON from the playbook."""
    out = await _run_json_agent(
        WORKFLOW_DRAFT_SYSTEM,
        build_workflow_draft_user(req.playbook, req.pipeline),
        "workflow_draft",
        max_tokens=16384,  # full n8n workflows are 8-12K JSON tokens
    )
    return JSONResponse(out)


@app.post("/credentials")
async def credentials(req: CredentialsRequest) -> JSONResponse:
    """V2 — Opus 4.7 enumerates the credentials the workflow needs to run."""
    out = await _run_json_agent(
        CREDENTIALS_SYSTEM, build_credentials_user(req.workflow), "credentials"
    )
    return JSONResponse(out)


@app.post("/validate-workflow")
async def validate_workflow(req: ValidateWorkflowRequest) -> JSONResponse:
    """V2 — Opus 4.7 audits the workflow JSON for completeness."""
    out = await _run_json_agent(
        VALIDATION_SYSTEM, build_validation_user(req.workflow), "validation"
    )
    return JSONResponse(out)


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
