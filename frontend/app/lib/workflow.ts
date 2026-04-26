"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearPersisted, loadPersisted, savePersisted } from "./persist";
import { PipelineResults } from "./types";

const STORAGE_KEY = "bridgeflow.pipeline.workflow.v1";

// ── Shapes the backend returns ───────────────────────────────────────────
export interface Playbook {
  problem_statement: string;
  automation_goal: string;
  systems_touched: string[];
  outcome_metric: string;
  recommended_workflow_name: string;
  estimated_roi: {
    monthly_value_recovered: string;
    annualized_value_recovered: string;
    reasoning: string;
  };
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, { id?: string; name?: string }>;
}

export interface N8nWorkflow {
  name?: string;
  nodes: N8nNode[];
  connections: Record<
    string,
    {
      main?: Array<Array<{ node: string; type: string; index: number }>>;
    }
  >;
  active?: boolean;
  settings?: Record<string, unknown>;
  tags?: string[];
}

export interface CredentialItem {
  name: string;
  type: string;
  where_to_get: string;
  required: boolean;
  placeholder?: string;
  /** Whether this credential is already configured in the operator's
   *  Railway env. Falls back to false for any credential type that
   *  isn't tracked in /config (e.g. SMTP, Calendly, Google Calendar). */
  configured?: boolean;
  /** /config flag this credential maps to, if any (e.g. "telegram"). */
  config_key?: string | null;
}

export interface CredentialsResponse {
  credentials: CredentialItem[];
}

export type ValidationStatus =
  | "draft_ready"
  | "missing_inputs"
  | "safe_to_import";

export interface ValidationIssue {
  severity: "blocker" | "warning" | "info";
  node: string;
  message: string;
  fix: string;
}

export interface ValidationResponse {
  status: ValidationStatus;
  issues: ValidationIssue[];
  ready_to_copy: boolean;
  summary: string;
}

// ── Section state machine ────────────────────────────────────────────────
export type StepStatus = "idle" | "running" | "done" | "error";

export const MAX_REFINEMENT_PASSES = 2;

export interface WorkflowState {
  running: boolean;
  steps: {
    playbook: StepStatus;
    workflow: StepStatus;
    credentials: StepStatus;
    validation: StepStatus;
    refine: StepStatus;
  };
  playbook: Playbook | null;
  workflow: N8nWorkflow | null;
  credentials: CredentialsResponse | null;
  validation: ValidationResponse | null;
  error: string | null;
  /** Number of refine passes Opus 4.7 has run on the workflow this session. */
  refinementPasses: number;
  /** Snapshot of validator issues that triggered the most recent refine pass. */
  lastFixedIssues: ValidationIssue[];
}

const initialState: WorkflowState = {
  running: false,
  steps: {
    playbook: "idle",
    workflow: "idle",
    credentials: "idle",
    validation: "idle",
    refine: "idle",
  },
  playbook: null,
  workflow: null,
  credentials: null,
  validation: null,
  error: null,
  refinementPasses: 0,
  lastFixedIssues: [],
};

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    let detail: string;
    try {
      const j = await r.json();
      detail = j?.detail ?? JSON.stringify(j).slice(0, 300);
    } catch {
      detail = (await r.text()).slice(0, 300);
    }
    throw new Error(`${url} → HTTP ${r.status}: ${detail}`);
  }
  return (await r.json()) as T;
}

/** SSE reader for the streamed workflow endpoints (/workflow-draft +
 *  /workflow-refine). The backend emits `{type:'delta',...}` ticks for
 *  liveness, then a single `{type:'done', result: {...}}` carrying the
 *  parsed JSON. `onDelta` is optional progress hook for the UI. */
async function streamSseResult<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
  onDelta?: (info: { chunks: number; chars: number }) => void
): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok || !r.body) {
    let detail: string;
    try {
      const j = await r.json();
      detail = j?.detail ?? JSON.stringify(j).slice(0, 300);
    } catch {
      detail = (await r.text().catch(() => "")).slice(0, 300);
    }
    throw new Error(`${url} → HTTP ${r.status}: ${detail || "stream error"}`);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;
  let streamError: string | null = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      const dataLine = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("");
      if (!dataLine) continue;

      try {
        const ev = JSON.parse(dataLine);
        if (ev?.type === "delta") {
          if (onDelta) onDelta({ chunks: ev.chunks ?? 0, chars: ev.chars ?? 0 });
        } else if (ev?.type === "done") {
          result = ev.result as T;
        } else if (ev?.type === "error") {
          streamError = String(ev.message ?? "stream error");
        }
        // start / unknown types are ignored
      } catch {
        // ignore malformed frames — Anthropic's SDK occasionally splits
        // multi-byte chars across chunks; the next loop will recover.
      }
    }
  }

  if (streamError) throw new Error(`${url} → ${streamError}`);
  if (!result) throw new Error(`${url} → no done event`);
  return result;
}

export function useWorkflowGenerator() {
  const [state, setState] = useState<WorkflowState>(initialState);
  const hydratedRef = useRef(false);

  // Hydrate from localStorage on first mount so leaving /pipeline mid-run
  // (or just navigating away after generation) doesn't lose the playbook,
  // workflow JSON, credentials, or validation. Force any in-flight step
  // back to "idle" since the actual streams are dead.
  useEffect(() => {
    const persisted = loadPersisted<WorkflowState>(STORAGE_KEY);
    if (persisted) {
      const sanitizedSteps = Object.fromEntries(
        Object.entries(persisted.steps || {}).map(([k, v]) => [
          k,
          v === "running" ? "idle" : v,
        ])
      ) as WorkflowState["steps"];
      setState({ ...persisted, running: false, steps: sanitizedSteps });
    }
    hydratedRef.current = true;
  }, []);

  // Persist every transition after hydration.
  useEffect(() => {
    if (!hydratedRef.current) return;
    savePersisted(STORAGE_KEY, state);
  }, [state]);

  const reset = useCallback(() => {
    setState(initialState);
    clearPersisted(STORAGE_KEY);
  }, []);

  const generate = useCallback(async (results: PipelineResults, callId?: string | null) => {
    const ctrl = new AbortController();
    setState({ ...initialState, running: true });

    try {
      // 1. Playbook
      setState((s) => ({ ...s, steps: { ...s.steps, playbook: "running" } }));
      const playbook = await postJson<Playbook>(
        "/api/playbook",
        { pipeline: results, call_id: callId },
        ctrl.signal
      );
      setState((s) => ({
        ...s,
        playbook,
        steps: { ...s.steps, playbook: "done", workflow: "running" },
      }));

      // 2. Workflow draft (streamed — Opus 4.7 generation is ~55s, would
      // otherwise hit Railway's 60s edge-proxy idle timeout).
      const workflow = await streamSseResult<N8nWorkflow>(
        "/api/workflow-draft",
        { playbook, pipeline: results, call_id: callId },
        ctrl.signal
      );
      setState((s) => ({
        ...s,
        workflow,
        steps: { ...s.steps, workflow: "done", credentials: "running" },
      }));

      // 3. Credentials
      const credentials = await postJson<CredentialsResponse>(
        "/api/credentials",
        { workflow, call_id: callId },
        ctrl.signal
      );
      setState((s) => ({
        ...s,
        credentials,
        steps: { ...s.steps, credentials: "done", validation: "running" },
      }));

      // 4. Validation
      let validation = await postJson<ValidationResponse>(
        "/api/validate-workflow",
        { workflow, call_id: callId },
        ctrl.signal
      );
      setState((s) => ({
        ...s,
        validation,
        steps: { ...s.steps, validation: "done" },
      }));

      // 5. Self-correcting loop — when validation surfaces blockers, feed
      // the workflow + issues back to Opus 4.7 and retry. Cap at
      // MAX_REFINEMENT_PASSES so we don't infinite-loop on a stubborn
      // workflow.
      let refinedWorkflow = workflow;
      let pass = 0;
      while (
        validation.status === "missing_inputs" &&
        pass < MAX_REFINEMENT_PASSES
      ) {
        pass += 1;
        const blockerCount = validation.issues.filter((i) => i.severity === "blocker").length;
        const fixedSnapshot = validation.issues;

        setState((s) => ({
          ...s,
          steps: { ...s.steps, refine: "running", validation: "running" },
          lastFixedIssues: fixedSnapshot,
        }));

        try {
          refinedWorkflow = await streamSseResult<N8nWorkflow>(
            "/api/workflow-refine",
            {
              workflow: refinedWorkflow,
              issues: fixedSnapshot,
              call_id: callId,
              pass_number: pass,
            },
            ctrl.signal
          );
        } catch (refineErr) {
          // Refine failed — keep the previous workflow + validation, surface
          // the error, but don't lose the rest of the result.
          setState((s) => ({
            ...s,
            steps: { ...s.steps, refine: "error" },
            error: `refine pass ${pass}: ${(refineErr as Error).message}`,
          }));
          break;
        }

        setState((s) => ({
          ...s,
          workflow: refinedWorkflow,
          refinementPasses: pass,
          steps: { ...s.steps, refine: "done" },
        }));

        // Re-validate the refined workflow.
        validation = await postJson<ValidationResponse>(
          "/api/validate-workflow",
          { workflow: refinedWorkflow, call_id: callId },
          ctrl.signal
        );
        setState((s) => ({
          ...s,
          validation,
          steps: { ...s.steps, validation: "done" },
        }));

        // Surface what got fixed in console for debug visibility.
        // eslint-disable-next-line no-console
        console.info(
          `[workflow] refine pass ${pass} applied to ${blockerCount} blocker(s); new status=${validation.status}`
        );
      }

      setState((s) => ({ ...s, running: false }));
    } catch (err) {
      // (auto-loop wraps this catch — see below)
      if ((err as any)?.name === "AbortError") return;
      setState((s) => {
        const next = { ...s, running: false, error: (err as Error).message };
        // mark current running step as error
        (Object.keys(next.steps) as Array<keyof WorkflowState["steps"]>).forEach((k) => {
          if (next.steps[k] === "running") next.steps[k] = "error";
        });
        return next;
      });
    }
  }, []);

  /** Manual refine — triggered by the "Refine again" button in the
   *  WorkflowTab header. Takes the current workflow + the most recent
   *  validation issues and asks Opus 4.7 to apply blocker + warning
   *  fixes verbatim. Then re-validates. Cap is 5 server-side. */
  const refineNow = useCallback(
    async (callId?: string | null) => {
      // Snapshot the current state (avoid stale closure capture).
      let snapshot: WorkflowState | null = null;
      setState((s) => {
        snapshot = s;
        return s;
      });
      const cur = snapshot as WorkflowState | null;
      if (!cur || !cur.workflow || !cur.validation) return;
      if (cur.refinementPasses >= 5) return; // server cap

      const ctrl = new AbortController();
      setState((s) => ({
        ...s,
        running: true,
        error: null,
        steps: { ...s.steps, refine: "running", validation: "running" },
        lastFixedIssues: cur.validation!.issues,
      }));

      try {
        const refined = await streamSseResult<N8nWorkflow>(
          "/api/workflow-refine",
          {
            workflow: cur.workflow,
            issues: cur.validation.issues,
            call_id: callId,
            pass_number: cur.refinementPasses + 1,
          },
          ctrl.signal
        );
        setState((s) => ({
          ...s,
          workflow: refined,
          refinementPasses: s.refinementPasses + 1,
          steps: { ...s.steps, refine: "done" },
        }));
        const validation = await postJson<ValidationResponse>(
          "/api/validate-workflow",
          { workflow: refined, call_id: callId },
          ctrl.signal
        );
        setState((s) => ({
          ...s,
          validation,
          running: false,
          steps: { ...s.steps, validation: "done" },
        }));
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setState((s) => ({
          ...s,
          running: false,
          error: (err as Error).message,
          steps: {
            ...s.steps,
            refine: "error",
            validation: s.validation ? "done" : "error",
          },
        }));
      }
    },
    []
  );

  return { ...state, generate, refineNow, reset };
}
