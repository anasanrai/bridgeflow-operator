"use client";

import { useCallback, useState } from "react";
import { PipelineResults } from "./types";

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

export function useWorkflowGenerator() {
  const [state, setState] = useState<WorkflowState>(initialState);
  const reset = useCallback(() => setState(initialState), []);

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

      // 2. Workflow draft
      const workflow = await postJson<N8nWorkflow>(
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
          refinedWorkflow = await postJson<N8nWorkflow>(
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

  return { ...state, generate, reset };
}
