"""V2 HubSpot CRM integration — search-or-upsert contact, create deal,
associate them, return deep-links the UI can render.

Idempotency: HubSpot rejects duplicate-email contact creates with 409. We
search by email first; if a contact exists we PATCH it instead of POSTing
a new one. New deal each pipeline run (running the same prospect twice
adds a second deal — that's correct, not a bug).

Failure mode: never raises. Any HubSpot error returns
{ "synced": False, "error": "..." } so pipeline_stream keeps moving."""
from __future__ import annotations

import os
from typing import Any

import httpx

BASE = "https://api.hubapi.com"
DEFAULT_TIMEOUT = 12.0


def hubspot_configured() -> bool:
    return bool(os.environ.get("HUBSPOT_TOKEN"))


def _portal_id() -> str:
    return (os.environ.get("HUBSPOT_PORTAL_ID") or "").strip()


def _region() -> str:
    return (os.environ.get("HUBSPOT_REGION") or "eu1").strip().lower()


def _ui_base() -> str:
    """https://app-eu1.hubspot.com or https://app.hubspot.com depending on
    the portal's region."""
    region = _region()
    return f"https://app-{region}.hubspot.com" if region != "na1" else "https://app.hubspot.com"


def _contact_url(contact_id: str) -> str:
    return f"{_ui_base()}/contacts/{_portal_id()}/record/0-1/{contact_id}"


def _deal_url(deal_id: str) -> str:
    return f"{_ui_base()}/contacts/{_portal_id()}/record/0-3/{deal_id}"


def _split_name(full: str | None) -> tuple[str, str]:
    if not full:
        return ("Unknown", "Lead")
    parts = [p for p in full.strip().split() if p]
    if not parts:
        return ("Unknown", "Lead")
    if len(parts) == 1:
        return (parts[0], "—")
    return (parts[0], " ".join(parts[1:]))


def _parse_amount(value: str | int | float | None) -> str:
    """Try to extract a number from strings like '$4,500' or '$5k pilot'.
    Falls back to '4500' if we can't tell."""
    if value is None:
        return "4500"
    if isinstance(value, (int, float)):
        return str(int(value))
    s = str(value)
    digits = ""
    multiplier = 1
    if "k" in s.lower():
        multiplier = 1000
    for ch in s.replace(",", ""):
        if ch.isdigit() or (ch == "." and "." not in digits):
            digits += ch
        elif digits:
            break
    if not digits:
        return "4500"
    try:
        return str(int(float(digits) * multiplier))
    except Exception:
        return "4500"


async def _find_contact_by_email(client: httpx.AsyncClient, headers: dict, email: str) -> str | None:
    """Returns existing contact id or None. Never raises."""
    try:
        resp = await client.post(
            f"{BASE}/crm/v3/objects/contacts/search",
            headers=headers,
            json={
                "filterGroups": [
                    {"filters": [{"propertyName": "email", "operator": "EQ", "value": email}]}
                ],
                "limit": 1,
                "properties": ["email"],
            },
        )
        if resp.status_code != 200:
            return None
        results = (resp.json() or {}).get("results") or []
        return results[0].get("id") if results else None
    except Exception as exc:
        print(f"[hubspot] search failed: {exc}")
        return None


async def sync_lead_to_hubspot(
    prospect: dict,
    qualification: dict,
    crm_note: str,
) -> dict[str, Any]:
    """Create-or-update contact + create deal + associate them.
    Returns a dict the UI can render. Never raises."""
    token = os.environ.get("HUBSPOT_TOKEN")
    if not token:
        return {"synced": False, "skipped_reason": "credentials_missing"}

    email = (prospect.get("email") or "").strip()
    if not email or "@" not in email or email.lower() in {"unknown", "string", "none"}:
        return {"synced": False, "skipped_reason": "no_valid_email"}

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    first, last = _split_name(prospect.get("name"))
    company = prospect.get("company") or ""
    role = prospect.get("role") or ""
    phone = prospect.get("phone") or ""

    score = (qualification.get("score") or "").lower()
    confidence = qualification.get("confidence")
    decision = qualification.get("decision") or ""
    est_value = qualification.get("estimated_deal_value")

    contact_props: dict[str, str] = {
        "firstname": first,
        "lastname": last,
        "email": email,
        "company": company,
        "jobtitle": role,
        "hs_lead_status": "NEW",
        "lifecyclestage": "lead",
    }
    # HubSpot rejects garbage placeholder phone strings — only set when sane.
    if phone and phone.lower() not in {"unknown", "none", "—"} and any(c.isdigit() for c in phone):
        contact_props["phone"] = phone

    contact_id: str | None = None
    deal_id: str | None = None
    contact_action = "created"
    error: str | None = None

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
            # 1. Upsert contact (search → PATCH if exists, POST if not).
            existing_id = await _find_contact_by_email(client, headers, email)
            if existing_id:
                contact_action = "updated"
                resp = await client.patch(
                    f"{BASE}/crm/v3/objects/contacts/{existing_id}",
                    headers=headers,
                    json={"properties": contact_props},
                )
                if resp.status_code in (200, 201):
                    contact_id = (resp.json() or {}).get("id") or existing_id
                else:
                    error = f"contact patch {resp.status_code}: {resp.text[:200]}"
            else:
                resp = await client.post(
                    f"{BASE}/crm/v3/objects/contacts",
                    headers=headers,
                    json={"properties": contact_props},
                )
                if resp.status_code in (200, 201):
                    contact_id = (resp.json() or {}).get("id")
                else:
                    error = f"contact create {resp.status_code}: {resp.text[:200]}"

            if not contact_id:
                return {"synced": False, "error": error or "contact_id missing"}

            # 2. Create deal.
            dealname = f"{prospect.get('name') or 'Unknown'} @ {company or 'Unknown'} — BridgeFlow"
            dealstage = "appointmentscheduled" if score == "hot" else "qualifiedtobuy"
            amount = _parse_amount(est_value)
            description = (
                f"Score: {score.upper() or 'UNKNOWN'} ({confidence}% confidence)\n"
                f"Decision: {decision.replace('_', ' ')}\n"
                f"Source: BridgeFlow Operator (Opus 4.7)\n\n"
                f"{(crm_note or '').strip() or 'See call analysis in BridgeFlow.'}"
            )
            resp = await client.post(
                f"{BASE}/crm/v3/objects/deals",
                headers=headers,
                json={
                    "properties": {
                        "dealname": dealname,
                        "dealstage": dealstage,
                        "pipeline": "default",
                        "amount": amount,
                        "description": description,
                        # Two months out by default. HubSpot accepts ISO date.
                        "closedate": "2026-06-30",
                    }
                },
            )
            if resp.status_code in (200, 201):
                deal_id = (resp.json() or {}).get("id")
            else:
                # Don't bail — contact still synced, that's a partial win.
                error = f"deal create {resp.status_code}: {resp.text[:200]}"

            # 3. Associate contact ↔ deal (best-effort).
            assoc_ok = False
            if contact_id and deal_id:
                try:
                    a = await client.put(
                        f"{BASE}/crm/v3/objects/contacts/{contact_id}/associations/deals/{deal_id}/contact_to_deal",
                        headers=headers,
                    )
                    assoc_ok = a.status_code in (200, 201, 204)
                    if not assoc_ok:
                        print(f"[hubspot] association non-2xx: {a.status_code} {a.text[:200]}")
                except Exception as exc:
                    print(f"[hubspot] association failed: {exc}")

    except httpx.TimeoutException:
        return {"synced": False, "error": "hubspot_timeout"}
    except Exception as exc:
        return {"synced": False, "error": f"{type(exc).__name__}: {exc}"}

    return {
        "synced": bool(contact_id),
        "contact_id": contact_id,
        "deal_id": deal_id,
        "contact_action": contact_action,            # "created" | "updated"
        "contact_url": _contact_url(contact_id) if contact_id else None,
        "deal_url": _deal_url(deal_id) if deal_id else None,
        "error": error,                              # non-fatal partial errors surface here
        "portal_id": _portal_id(),
    }
