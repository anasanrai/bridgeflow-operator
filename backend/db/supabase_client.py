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
