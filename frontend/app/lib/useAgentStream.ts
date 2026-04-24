"use client";

import { useCallback, useRef, useState } from "react";
import {
  AGENT_ORDER,
  AgentName,
  AgentState,
  PipelineResults,
  StreamEvent,
} from "./types";

const makeIdleAgents = (): Record<AgentName, AgentState> =>
  AGENT_ORDER.reduce((acc, name) => {
    acc[name] = {
      name,
      status: "idle",
      raw: "",
      output: null,
      error: null,
      startedAt: null,
      completedAt: null,
    };
    return acc;
  }, {} as Record<AgentName, AgentState>);

export interface PipelineState {
  running: boolean;
  callId: string | null;
  agents: Record<AgentName, AgentState>;
  results: PipelineResults | null;
  error: string | null;
}

export function useAgentStream() {
  const [state, setState] = useState<PipelineState>({
    running: false,
    callId: null,
    agents: makeIdleAgents(),
    results: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({
      running: false,
      callId: null,
      agents: makeIdleAgents(),
      results: null,
      error: null,
    });
  }, []);

  const run = useCallback(async (transcript: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      running: true,
      callId: null,
      agents: makeIdleAgents(),
      results: null,
      error: null,
    });

    let response: Response;
    try {
      response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
        signal: controller.signal,
      });
    } catch (err: any) {
      setState((s) => ({ ...s, running: false, error: err?.message ?? "Network error" }));
      return;
    }

    if (!response.ok || !response.body) {
      const msg = await response.text().catch(() => "");
      setState((s) => ({
        ...s,
        running: false,
        error: `Backend error (${response.status}): ${msg.slice(0, 200)}`,
      }));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const handleEvent = (evt: StreamEvent) => {
      setState((prev) => {
        const next: PipelineState = {
          ...prev,
          agents: { ...prev.agents },
        };
        switch (evt.type) {
          case "pipeline_start":
            next.callId = evt.call_id ?? null;
            break;
          case "agent_start": {
            const existing = prev.agents[evt.agent];
            next.agents[evt.agent] = {
              ...existing,
              status: "streaming",
              raw: "",
              output: null,
              error: null,
              startedAt: Date.now(),
              completedAt: null,
            };
            break;
          }
          case "agent_delta": {
            const existing = prev.agents[evt.agent];
            next.agents[evt.agent] = {
              ...existing,
              status: "streaming",
              raw: existing.raw + evt.delta,
            };
            break;
          }
          case "agent_complete": {
            const existing = prev.agents[evt.agent];
            next.agents[evt.agent] = {
              ...existing,
              status: "done",
              output: evt.output,
              completedAt: Date.now(),
            };
            break;
          }
          case "pipeline_complete":
            next.results = evt.results;
            next.callId = evt.call_id ?? prev.callId;
            next.running = false;
            break;
          case "error":
            if (evt.agent) {
              const existing = prev.agents[evt.agent];
              next.agents[evt.agent] = {
                ...existing,
                status: "error",
                error: evt.message,
                completedAt: Date.now(),
              };
            }
            next.error = evt.message;
            next.running = false;
            break;
        }
        return next;
      });
    };

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf("\n\n");
        while (boundary !== -1) {
          const rawEvent = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          boundary = buffer.indexOf("\n\n");

          const line = rawEvent
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("");
          if (!line) continue;
          try {
            const parsed = JSON.parse(line) as StreamEvent;
            handleEvent(parsed);
          } catch {
            // ignore malformed frames
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setState((s) => ({ ...s, running: false, error: err?.message ?? "Stream error" }));
      }
    } finally {
      setState((s) => (s.running ? { ...s, running: false } : s));
    }
  }, []);

  return { ...state, run, reset };
}
