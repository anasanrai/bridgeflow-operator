"""Thin Supabase wrapper. Degrades gracefully when credentials aren't set so
the pipeline still runs end-to-end for the demo without a live DB."""
from __future__ import annotations

import os
from typing import Any

try:
    from supabase import Client, create_client
except ImportError:  # supabase is optional in the minimal install
    Client = None  # type: ignore
    create_client = None  # type: ignore


_client: "Client | None" = None
_checked = False


def get_client() -> "Client | None":
    global _client, _checked
    if _checked:
        return _client
    _checked = True
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_KEY")
    if not url or not key or create_client is None:
        return None
    _client = create_client(url, key)
    return _client


def _safe_insert(table: str, row: dict[str, Any]) -> dict | None:
    client = get_client()
    if client is None:
        return None
    try:
        resp = client.table(table).insert(row).execute()
        data = getattr(resp, "data", None) or []
        return data[0] if data else None
    except Exception as exc:  # never break the pipeline on DB errors
        print(f"[supabase] insert into {table} failed: {exc}")
        return None


def insert_call(transcript: str) -> str | None:
    row = _safe_insert("calls", {"transcript": transcript, "status": "processing"})
    return row.get("id") if row else None


def update_call_status(call_id: str, status: str) -> None:
    client = get_client()
    if client is None or not call_id:
        return
    try:
        client.table("calls").update({"status": status}).eq("id", call_id).execute()
    except Exception as exc:
        print(f"[supabase] update call status failed: {exc}")


def insert_analysis(call_id: str | None, agent_name: str, output: dict) -> None:
    if not call_id:
        return
    _safe_insert(
        "analyses",
        {"call_id": call_id, "agent_name": agent_name, "agent_output": output},
    )


def insert_lead(call_id: str | None, call_analysis: dict, qualification: dict) -> None:
    if not call_id:
        return
    prospect = call_analysis.get("prospect", {}) or {}
    _safe_insert(
        "leads",
        {
            "call_id": call_id,
            "name": prospect.get("name"),
            "company": prospect.get("company"),
            "email": prospect.get("email"),
            "phone": prospect.get("phone"),
            "score": qualification.get("score"),
            "decision": qualification.get("decision"),
        },
    )


def insert_actions(call_id: str | None, actions_output: dict) -> None:
    if not call_id:
        return
    for action in actions_output.get("actions", []) or []:
        _safe_insert(
            "actions",
            {
                "call_id": call_id,
                "action_type": action.get("type"),
                "action_data": action,
                "status": action.get("status", "queued"),
            },
        )


# ── V2: company identity vault ──────────────────────────────────────────

DEFAULT_PROFILE_ID = "default"

COMPANY_FIELDS = [
    "company_name",
    "industry",
    "what_you_sell",
    "target_client",
    "agent_name",
    "agent_tone",
    "agent_persona",
    "pricing_notes",
    "objection_1_q",
    "objection_1_a",
    "objection_2_q",
    "objection_2_a",
    "objection_3_q",
    "objection_3_a",
    "booking_link",
    "custom_instructions",
]


def get_company_profile() -> dict | None:
    """Return the singleton default company profile, or None when the table
    doesn't exist / has no row / Supabase isn't configured."""
    client = get_client()
    if client is None:
        return None
    try:
        resp = (
            client.table("company_profiles")
            .select("*")
            .eq("id", DEFAULT_PROFILE_ID)
            .limit(1)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        print(f"[supabase] get_company_profile failed: {exc}")
        return None


def upsert_company_profile(payload: dict) -> dict | None:
    """Upsert the default profile. Only whitelisted fields are persisted."""
    client = get_client()
    if client is None:
        return None
    row: dict = {"id": DEFAULT_PROFILE_ID}
    for k in COMPANY_FIELDS:
        if k in payload:
            v = payload.get(k)
            row[k] = v if not isinstance(v, str) else v.strip()
    try:
        resp = (
            client.table("company_profiles")
            .upsert(row, on_conflict="id")
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        print(f"[supabase] upsert_company_profile failed: {exc}")
        return None


# ── V2: Telegram-gated email approvals ──────────────────────────────────

def insert_pending_approval(
    call_id: str,
    email_payload: dict,
    telegram_message_id: int | None = None,
) -> dict | None:
    return _safe_insert(
        "pending_approvals",
        {
            "call_id": call_id,
            "email_payload": email_payload,
            "status": "pending",
            "telegram_message_id": telegram_message_id,
        },
    )


def update_pending_approval(approval_id: str, **fields) -> None:
    client = get_client()
    if client is None or not approval_id:
        return
    try:
        client.table("pending_approvals").update(fields).eq("id", approval_id).execute()
    except Exception as exc:
        print(f"[supabase] update_pending_approval failed: {exc}")


def get_pending_approval(approval_id: str) -> dict | None:
    client = get_client()
    if client is None or not approval_id:
        return None
    try:
        resp = (
            client.table("pending_approvals")
            .select("*")
            .eq("id", approval_id)
            .limit(1)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        print(f"[supabase] get_pending_approval failed: {exc}")
        return None


def get_pending_approval_by_message_id(telegram_message_id: int) -> dict | None:
    client = get_client()
    if client is None:
        return None
    try:
        resp = (
            client.table("pending_approvals")
            .select("*")
            .eq("telegram_message_id", telegram_message_id)
            .limit(1)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        print(f"[supabase] get_pending_approval_by_message_id failed: {exc}")
        return None


def get_latest_pending_approval() -> dict | None:
    """Fallback when a Telegram reply has no reply_to_message correlation."""
    client = get_client()
    if client is None:
        return None
    try:
        resp = (
            client.table("pending_approvals")
            .select("*")
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        print(f"[supabase] get_latest_pending_approval failed: {exc}")
        return None


def get_call_record(call_id: str) -> dict | None:
    client = get_client()
    if client is None or not call_id:
        return None
    try:
        resp = (
            client.table("calls").select("*").eq("id", call_id).limit(1).execute()
        )
        rows = getattr(resp, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        print(f"[supabase] get_call_record failed: {exc}")
        return None


# ── V2 QA: pipeline_runs / workflow_drafts / lead ops / action status ──

def insert_pipeline_run(
    call_id: str | None,
    transcript: str,
    call_analysis: dict,
    qualification: dict,
    *,
    status: str = "complete",
    approval_state: str = "none",
) -> dict | None:
    prospect = (call_analysis or {}).get("prospect") or {}
    return _safe_insert(
        "pipeline_runs",
        {
            "call_id": call_id,
            "transcript_preview": (transcript or "")[:200],
            "prospect_name": prospect.get("name"),
            "company": prospect.get("company"),
            "score": (qualification or {}).get("score"),
            "decision": (qualification or {}).get("decision"),
            "status": status,
            "approval_state": approval_state,
        },
    )


def list_pipeline_runs(limit: int = 100) -> list[dict]:
    client = get_client()
    if client is None:
        return []
    try:
        resp = (
            client.table("pipeline_runs")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return getattr(resp, "data", None) or []
    except Exception as exc:
        print(f"[supabase] list_pipeline_runs failed: {exc}")
        return []


def insert_workflow_draft(
    call_id: str | None,
    playbook: dict | None,
    workflow_json: dict | None,
    credentials: dict | None,
    validation: dict | None,
    *,
    platform: str = "n8n",
) -> dict | None:
    return _safe_insert(
        "workflow_drafts",
        {
            "call_id": call_id,
            "playbook": playbook,
            "workflow_json": workflow_json,
            "credentials": credentials,
            "validation": validation,
            "platform": platform,
        },
    )


def update_lead(lead_id: str, fields: dict) -> dict | None:
    """Patch a leads row. Whitelisted to columns that exist."""
    client = get_client()
    if client is None or not lead_id:
        return None
    allowed = {"name", "company", "email", "phone", "score", "decision", "status"}
    payload = {k: v for k, v in (fields or {}).items() if k in allowed}
    if not payload:
        return None
    try:
        resp = (
            client.table("leads")
            .update(payload)
            .eq("id", lead_id)
            .execute()
        )
        rows = getattr(resp, "data", None) or []
        return rows[0] if rows else None
    except Exception as exc:
        print(f"[supabase] update_lead failed: {exc}")
        return None


def update_action_status(call_id: str, sequence: int | None, fields: dict) -> None:
    """Patch the actions row for a given call+sequence. Used after Resend
    actually sends / Telegram approval flips state."""
    client = get_client()
    if client is None or not call_id:
        return
    try:
        q = client.table("actions").update(fields).eq("call_id", call_id)
        if sequence is not None:
            # action_data is jsonb; filter via Postgrest's ->> operator.
            q = q.filter("action_data->>sequence", "eq", str(sequence))
        q.execute()
    except Exception as exc:
        print(f"[supabase] update_action_status failed: {exc}")


def get_analyses_for_call(call_id: str) -> list[dict]:
    client = get_client()
    if client is None or not call_id:
        return []
    try:
        resp = (
            client.table("analyses")
            .select("agent_name,agent_output,created_at")
            .eq("call_id", call_id)
            .order("created_at")
            .execute()
        )
        return getattr(resp, "data", None) or []
    except Exception as exc:
        print(f"[supabase] get_analyses_for_call failed: {exc}")
        return []
