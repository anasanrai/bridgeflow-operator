from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    transcript: str = Field(..., min_length=20, description="Raw sales call transcript")
    call_id: str | None = None


# ── V2 Workflow generator ───────────────────────────────────────────────

class PlaybookRequest(BaseModel):
    """Pipeline result from /analyze (call_analysis, qualification, campaign,
    actions, reflection)."""
    pipeline: dict[str, Any] = Field(..., description="Full PipelineResults object")
    call_id: str | None = None


class WorkflowDraftRequest(BaseModel):
    playbook: dict[str, Any]
    pipeline: dict[str, Any] | None = None
    call_id: str | None = None


class CredentialsRequest(BaseModel):
    workflow: dict[str, Any]
    call_id: str | None = None


class ValidateWorkflowRequest(BaseModel):
    workflow: dict[str, Any]
    call_id: str | None = None


class WorkflowRefineRequest(BaseModel):
    """V2 self-correcting loop: feed the previous workflow + validator issues
    back to Opus 4.7 and get a corrected workflow JSON."""
    workflow: dict[str, Any]
    issues: list[dict[str, Any]] = Field(default_factory=list)
    call_id: str | None = None
    pass_number: int = 1  # 1-indexed; clamped server-side to 2 max


class TestEmailRequest(BaseModel):
    to: str = Field(..., min_length=3)
    subject: str | None = None
    content: str | None = None


# ── V2 Company identity vault ───────────────────────────────────────────

class CompanyProfile(BaseModel):
    company_name: str | None = None
    industry: str | None = None
    what_you_sell: str | None = None
    target_client: str | None = None
    agent_name: str | None = None
    agent_tone: str | None = None
    agent_persona: str | None = None
    pricing_notes: str | None = None
    objection_1_q: str | None = None
    objection_1_a: str | None = None
    objection_2_q: str | None = None
    objection_2_a: str | None = None
    objection_3_q: str | None = None
    objection_3_a: str | None = None
    booking_link: str | None = None
    custom_instructions: str | None = None


# ── V2 Consultant chat ──────────────────────────────────────────────────

class ConsultantMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ConsultantRequest(BaseModel):
    pipeline_id: str = Field(..., description="call_id from /analyze")
    message: str = Field(..., min_length=1)
    conversation_history: list[ConsultantMessage] = Field(default_factory=list)


class AgentEvent(BaseModel):
    """Server-sent event payload for the streaming pipeline."""
    type: str  # "agent_start" | "agent_delta" | "agent_complete" | "pipeline_complete" | "error"
    agent: str | None = None
    index: int | None = None
    delta: str | None = None
    output: dict | None = None
    message: str | None = None
    call_id: str | None = None
