from __future__ import annotations

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    transcript: str = Field(..., min_length=20, description="Raw sales call transcript")
    call_id: str | None = None


class AgentEvent(BaseModel):
    """Server-sent event payload for the streaming pipeline."""
    type: str  # "agent_start" | "agent_delta" | "agent_complete" | "pipeline_complete" | "error"
    agent: str | None = None
    index: int | None = None
    delta: str | None = None
    output: dict | None = None
    message: str | None = None
    call_id: str | None = None
