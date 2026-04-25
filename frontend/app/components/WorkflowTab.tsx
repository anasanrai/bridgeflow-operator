"use client";

import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  IconCheck,
  IconKey,
  IconPlay,
  IconRefresh,
  IconSparkle,
  IconTarget,
  IconX,
} from "../lib/icons";
import { PipelineResults } from "../lib/types";
import {
  CredentialItem,
  N8nNode,
  N8nWorkflow,
  Playbook,
  StepStatus,
  ValidationResponse,
  useWorkflowGenerator,
} from "../lib/workflow";

interface Props {
  results: PipelineResults;
}

export function WorkflowTab({ results }: Props) {
  const wf = useWorkflowGenerator();

  return (
    <div className="space-y-5">
      <Header
        running={wf.running}
        steps={wf.steps}
        validation={wf.validation}
        onGenerate={() => wf.generate(results)}
        onReset={wf.reset}
      />

      {wf.error && (
        <div className="rounded-xl border border-hot/40 bg-hot/5 p-4 text-sm text-hot">
          {wf.error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <PlaybookCard playbook={wf.playbook} status={wf.steps.playbook} />
        <CredentialsCard
          credentials={wf.credentials?.credentials ?? null}
          status={wf.steps.credentials}
        />
      </div>

      <WorkflowPreviewCard workflow={wf.workflow} status={wf.steps.workflow} />

      <WorkflowJsonCard
        workflow={wf.workflow}
        status={wf.steps.workflow}
        validation={wf.validation}
        validationStatus={wf.steps.validation}
      />
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header({
  running,
  steps,
  validation,
  onGenerate,
  onReset,
}: {
  running: boolean;
  steps: Record<string, StepStatus>;
  validation: ValidationResponse | null;
  onGenerate: () => void;
  onReset: () => void;
}) {
  const order: Array<{ key: keyof typeof steps; label: string }> = [
    { key: "playbook", label: "Playbook" },
    { key: "workflow", label: "Workflow draft" },
    { key: "credentials", label: "Credentials" },
    { key: "validation", label: "Validation" },
  ];
  const allIdle = order.every((s) => steps[s.key] === "idle");
  const allDone = order.every((s) => steps[s.key] === "done");

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/[0.04] p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-center shrink-0">
            <IconSparkle className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-ink">
                Workflow Generator
              </h2>
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
                V2 · Building Now
              </span>
              {validation && <ValidationBadge validation={validation} />}
            </div>
            <p className="text-xs text-muted mt-0.5 max-w-2xl">
              Opus 4.7 turns this pipeline run into a structured playbook,
              production-ready n8n workflow JSON, credential checklist, and
              an honest validation pass.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!allIdle && (
            <button
              onClick={onReset}
              disabled={running}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
            >
              <IconRefresh className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
          <button
            onClick={onGenerate}
            disabled={running}
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-md border border-amber-500/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <IconPlay className="w-3.5 h-3.5" />
            {running
              ? "Generating…"
              : allDone
              ? "Re-generate"
              : "Generate Workflow"}
          </button>
        </div>
      </div>

      <ol className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
        {order.map((s) => (
          <StepPill key={s.key} label={s.label} status={steps[s.key]} />
        ))}
      </ol>
    </div>
  );
}

function StepPill({ label, status }: { label: string; status: StepStatus }) {
  const map: Record<StepStatus, { wrap: string; dot: string }> = {
    idle: { wrap: "border-border bg-surface text-faint", dot: "bg-faint/60" },
    running: {
      wrap: "border-amber-500/50 bg-amber-500/10 text-amber-200",
      dot: "bg-amber-300 animate-blink",
    },
    done: {
      wrap: "border-accent/40 bg-accent/[0.07] text-accent",
      dot: "bg-accent shadow-glow-accent",
    },
    error: { wrap: "border-hot/40 bg-hot/5 text-hot", dot: "bg-hot" },
  };
  const s = map[status];
  return (
    <li className={`flex items-center gap-2 px-2 py-1.5 rounded-md border ${s.wrap}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      <span className="truncate">{label}</span>
      <span className="ml-auto uppercase text-[9px] tracking-wider opacity-80">
        {status === "idle" ? "queued" : status}
      </span>
    </li>
  );
}

function ValidationBadge({ validation }: { validation: ValidationResponse }) {
  const map = {
    safe_to_import: {
      cls: "border-accent/40 bg-accent/10 text-accent",
      label: "safe to import",
    },
    draft_ready: {
      cls: "border-amber-500/45 bg-amber-500/10 text-amber-200",
      label: "draft ready",
    },
    missing_inputs: {
      cls: "border-hot/40 bg-hot/10 text-hot",
      label: "missing inputs",
    },
  } as const;
  const v = map[validation.status];
  return (
    <span
      className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

// ── 1. Playbook card ─────────────────────────────────────────────────────

function PlaybookCard({
  playbook,
  status,
}: {
  playbook: Playbook | null;
  status: StepStatus;
}) {
  return (
    <Card
      title="Playbook summary"
      subtitle="The business case Opus 4.7 extracted from the pipeline."
      icon={<IconTarget className="w-4 h-4" />}
      status={status}
      empty={!playbook}
    >
      {playbook && (
        <dl className="space-y-3 text-sm">
          <Row label="Workflow name">
            <code className="text-[12px] font-mono text-ink-muted bg-bg/60 px-1.5 py-0.5 rounded border border-border">
              {playbook.recommended_workflow_name}
            </code>
          </Row>
          <Row label="Problem">
            <p className="text-ink-muted leading-relaxed">{playbook.problem_statement}</p>
          </Row>
          <Row label="Automation goal">
            <p className="text-ink-muted leading-relaxed">{playbook.automation_goal}</p>
          </Row>
          <Row label="Outcome metric">
            <p className="text-ink-muted leading-relaxed">{playbook.outcome_metric}</p>
          </Row>
          <Row label="Systems touched">
            <div className="flex flex-wrap gap-1.5">
              {playbook.systems_touched.map((s) => (
                <span
                  key={s}
                  className="text-[11px] font-mono text-ink-muted bg-bg/60 border border-border rounded px-1.5 py-0.5"
                >
                  {s}
                </span>
              ))}
            </div>
          </Row>
          <Row label="Estimated ROI">
            <div className="space-y-1">
              <div className="text-ink-muted text-[13px]">
                <span className="font-semibold text-ink">
                  {playbook.estimated_roi.monthly_value_recovered}
                </span>{" "}
                / month —{" "}
                <span className="font-semibold text-ink">
                  {playbook.estimated_roi.annualized_value_recovered}
                </span>{" "}
                / year
              </div>
              <div className="text-[11px] text-faint leading-relaxed">
                {playbook.estimated_roi.reasoning}
              </div>
            </div>
          </Row>
        </dl>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-faint pt-0.5">
        {label}
      </dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

// ── 2. Credentials card ──────────────────────────────────────────────────

function CredentialsCard({
  credentials,
  status,
}: {
  credentials: CredentialItem[] | null;
  status: StepStatus;
}) {
  return (
    <Card
      title="Credential checklist"
      subtitle="What the operator must wire up in n8n before importing."
      icon={<IconKey className="w-4 h-4" />}
      status={status}
      empty={!credentials || credentials.length === 0}
    >
      {credentials && credentials.length > 0 && (
        <ul className="space-y-2">
          {credentials.map((c) => (
            <CredentialRow key={`${c.type}-${c.name}`} cred={c} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CredentialRow({ cred }: { cred: CredentialItem }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!cred.placeholder) return;
    try {
      await navigator.clipboard.writeText(cred.placeholder);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <li className="rounded-md border border-border bg-bg/40 p-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`inline-flex items-center justify-center w-5 h-5 rounded border text-[10px] font-mono ${
              cred.required
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-border bg-surface text-faint"
            }`}
          >
            {cred.required ? "!" : "·"}
          </span>
          <span className="text-sm font-medium text-ink truncate">{cred.name}</span>
          <span className="text-[10px] font-mono text-faint px-1.5 py-0.5 rounded border border-border">
            {cred.type}
          </span>
        </div>
        {cred.placeholder && (
          <button
            onClick={handleCopy}
            className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors cursor-pointer ${
              copied
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-bg hover:bg-surface-2 text-muted hover:text-ink"
            }`}
          >
            {copied ? "copied" : "copy placeholder"}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-muted leading-relaxed">
        {cred.where_to_get}
      </p>
      {cred.placeholder && (
        <code className="mt-1.5 block text-[11px] font-mono text-faint bg-bg/60 border border-border rounded px-2 py-1 truncate">
          {cred.placeholder}
        </code>
      )}
    </li>
  );
}

// ── 3. Workflow preview (React Flow) ─────────────────────────────────────

function WorkflowPreviewCard({
  workflow,
  status,
}: {
  workflow: N8nWorkflow | null;
  status: StepStatus;
}) {
  const { nodes, edges } = useMemo(
    () => (workflow ? toReactFlow(workflow) : { nodes: [], edges: [] }),
    [workflow]
  );

  return (
    <Card
      title="Workflow preview"
      subtitle={
        workflow
          ? `${workflow.nodes.length} nodes · ${
              Object.values(workflow.connections ?? {}).reduce(
                (n, c) =>
                  n + (c.main?.reduce((m, arr) => m + arr.length, 0) ?? 0),
                0
              )
            } connections`
          : "Visual node graph rendered with React Flow."
      }
      icon={<IconSparkle className="w-4 h-4" />}
      status={status}
      empty={!workflow}
      bodyClassName="p-0"
    >
      {workflow && (
        <div className="h-[480px] bg-bg/40 border-t border-border">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: true,
              style: { stroke: "rgba(245,158,11,0.55)", strokeWidth: 1.4 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(245,158,11,0.8)" },
            }}
          >
            <Background gap={18} color="rgba(255,255,255,0.05)" />
            <Controls
              showInteractive={false}
              className="!bg-surface !border !border-border !rounded-md !shadow-none [&_button]:!bg-surface [&_button]:!border-b [&_button]:!border-border [&_button:last-child]:!border-b-0 [&_button:hover]:!bg-bg [&_svg]:!fill-ink-muted"
            />
          </ReactFlow>
        </div>
      )}
    </Card>
  );
}

const NODE_PALETTE: Array<{ match: RegExp; cls: string; label: string }> = [
  { match: /webhook|scheduleTrigger/, cls: "border-accent/45 bg-accent/[0.08] text-accent", label: "trigger" },
  { match: /langchain\.agent|langchain\.lmChat/, cls: "border-amber-500/45 bg-amber-500/[0.08] text-amber-200", label: "ai" },
  { match: /switch|if|merge/, cls: "border-warm/40 bg-warm/[0.08] text-warm", label: "logic" },
  { match: /emailSend|httpRequest|telegram|googleCalendar|slack/, cls: "border-cold/45 bg-cold/[0.08] text-cold", label: "action" },
  { match: /set|stickyNote|wait|code/, cls: "border-border bg-surface text-ink-muted", label: "transform" },
];

function nodeClass(type: string): string {
  for (const p of NODE_PALETTE) if (p.match.test(type)) return p.cls;
  return "border-border bg-surface text-ink-muted";
}

function shortLabel(type: string): string {
  return type.replace(/^@n8n\//, "").replace(/^n8n-nodes-base\./, "").replace(/^n8n-nodes-langchain\./, "");
}

function toReactFlow(wf: N8nWorkflow): { nodes: Node[]; edges: Edge[] } {
  const COL_W = 240;
  const ROW_H = 110;

  // Use n8n-provided positions when available; otherwise derive a layered layout.
  const hasPos = wf.nodes.every((n) => Array.isArray(n.position) && n.position.length === 2);
  const layout = hasPos ? n8nPositions(wf.nodes) : layeredLayout(wf);

  const nodes: Node[] = wf.nodes.map((n) => {
    const cls = nodeClass(n.type);
    const { x, y } = layout.get(n.name) ?? { x: 0, y: 0 };
    return {
      id: n.name,
      position: { x, y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        label: (
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="text-[10px] font-mono uppercase tracking-wider opacity-70">
              {shortLabel(n.type)}
            </span>
            <span className="text-[12px] font-medium text-ink leading-tight truncate max-w-[200px]">
              {n.name}
            </span>
          </div>
        ),
      },
      style: {
        width: 220,
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        background: "transparent",
      },
      className: `border ${cls} text-left`,
    };
  });

  const edges: Edge[] = [];
  Object.entries(wf.connections ?? {}).forEach(([source, conn]) => {
    (conn.main ?? []).forEach((arr, outIdx) =>
      arr.forEach((c) => {
        edges.push({
          id: `${source}__${outIdx}__${c.node}__${c.index}`,
          source,
          target: c.node,
          sourceHandle: undefined,
          targetHandle: undefined,
          type: "smoothstep",
        });
      })
    );
  });

  // Compact a bit if n8n positions span huge ranges
  if (hasPos) {
    const xs = [...layout.values()].map((p) => p.x);
    const ys = [...layout.values()].map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    nodes.forEach((n) => {
      n.position = {
        x: (n.position.x - minX) * 0.8,
        y: (n.position.y - minY) * 0.8,
      };
    });
  }
  void COL_W;
  void ROW_H;
  return { nodes, edges };
}

function n8nPositions(nodes: N8nNode[]): Map<string, { x: number; y: number }> {
  const m = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const [x = 0, y = 0] = n.position ?? [];
    m.set(n.name, { x, y });
  }
  return m;
}

function layeredLayout(wf: N8nWorkflow): Map<string, { x: number; y: number }> {
  // BFS layering from nodes with no incoming edge
  const byName = new Map(wf.nodes.map((n) => [n.name, n]));
  const incoming = new Map<string, number>();
  wf.nodes.forEach((n) => incoming.set(n.name, 0));
  Object.values(wf.connections ?? {}).forEach((c) =>
    (c.main ?? []).forEach((arr) =>
      arr.forEach((edge) =>
        incoming.set(edge.node, (incoming.get(edge.node) ?? 0) + 1)
      )
    )
  );
  const layer = new Map<string, number>();
  const queue: string[] = [];
  incoming.forEach((v, k) => {
    if (v === 0) {
      layer.set(k, 0);
      queue.push(k);
    }
  });
  while (queue.length) {
    const cur = queue.shift()!;
    const out = wf.connections?.[cur]?.main ?? [];
    out.forEach((arr) =>
      arr.forEach((edge) => {
        const next = (layer.get(cur) ?? 0) + 1;
        if ((layer.get(edge.node) ?? -1) < next) {
          layer.set(edge.node, next);
          queue.push(edge.node);
        }
      })
    );
  }
  // group by layer
  const cols = new Map<number, string[]>();
  layer.forEach((l, name) => {
    if (!cols.has(l)) cols.set(l, []);
    cols.get(l)!.push(name);
  });
  const result = new Map<string, { x: number; y: number }>();
  cols.forEach((names, l) => {
    names.forEach((n, i) => {
      result.set(n, { x: l * 260, y: i * 110 });
    });
  });
  // any orphans
  wf.nodes.forEach((n, i) => {
    if (!result.has(n.name))
      result.set(n.name, { x: 0, y: (i + 1) * 110 });
  });
  void byName;
  return result;
}

// ── 4. Workflow JSON + validation card ───────────────────────────────────

function WorkflowJsonCard({
  workflow,
  status,
  validation,
  validationStatus,
}: {
  workflow: N8nWorkflow | null;
  status: StepStatus;
  validation: ValidationResponse | null;
  validationStatus: StepStatus;
}) {
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => (workflow ? JSON.stringify(workflow, null, 2) : ""), [workflow]);

  const copyAll = async () => {
    if (!json) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Card
      title="Workflow JSON"
      subtitle={
        workflow
          ? "Paste this into n8n's import dialog."
          : "Will populate after the draft step."
      }
      icon={<IconCheck className="w-4 h-4" />}
      status={status}
      empty={!workflow}
      bodyClassName="p-0"
      headerExtra={
        workflow && (
          <button
            onClick={copyAll}
            className={`text-[11px] font-mono px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
              copied
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
            }`}
          >
            {copied ? "copied to clipboard" : "Copy to Clipboard"}
          </button>
        )
      }
    >
      {workflow && (
        <>
          <ValidationBlock
            validation={validation}
            status={validationStatus}
          />
          <pre className="text-[11px] leading-relaxed font-mono text-ink-muted bg-bg/40 border-t border-border p-4 max-h-[420px] overflow-auto scrollbar-thin">
            <Highlight code={json} />
          </pre>
        </>
      )}
    </Card>
  );
}

function ValidationBlock({
  validation,
  status,
}: {
  validation: ValidationResponse | null;
  status: StepStatus;
}) {
  if (status === "running") {
    return (
      <div className="px-4 py-3 border-t border-border text-[11px] font-mono text-amber-200 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-blink" />
        Validating with Opus 4.7…
      </div>
    );
  }
  if (!validation) return null;
  const cls = {
    safe_to_import: "border-accent/40 bg-accent/[0.05]",
    draft_ready: "border-amber-500/45 bg-amber-500/[0.05]",
    missing_inputs: "border-hot/40 bg-hot/5",
  }[validation.status];
  return (
    <div className={`border-t ${cls} px-4 py-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <ValidationStatusPill status={validation.status} />
        <span className="text-[11px] font-mono text-muted">
          ready_to_copy: {String(validation.ready_to_copy)}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-muted leading-relaxed">
        {validation.summary}
      </p>
      {validation.issues.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {validation.issues.map((i, idx) => (
            <li
              key={`${i.node}-${idx}`}
              className="text-[11px] font-mono leading-relaxed text-ink-muted"
            >
              <span
                className={`inline-block w-12 mr-2 text-[10px] uppercase tracking-wider ${
                  i.severity === "blocker"
                    ? "text-hot"
                    : i.severity === "warning"
                    ? "text-warm"
                    : "text-faint"
                }`}
              >
                {i.severity}
              </span>
              <span className="text-ink">{i.node}:</span> {i.message}
              <div className="ml-14 text-faint">→ {i.fix}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ValidationStatusPill({ status }: { status: ValidationResponse["status"] }) {
  const map = {
    safe_to_import: { cls: "border-accent/40 text-accent bg-accent/10", icon: <IconCheck className="w-3 h-3" />, label: "safe to import" },
    draft_ready: { cls: "border-amber-500/40 text-amber-200 bg-amber-500/10", icon: <IconSparkle className="w-3 h-3" />, label: "draft ready" },
    missing_inputs: { cls: "border-hot/40 text-hot bg-hot/10", icon: <IconX className="w-3 h-3" />, label: "missing inputs" },
  } as const;
  const m = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${m.cls}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

// Lightweight JSON syntax highlighter — string/number/literal/key.
function Highlight({ code }: { code: string }) {
  const parts = useMemo(() => tokenizeJson(code), [code]);
  return (
    <code>
      {parts.map((p, i) => (
        <span key={i} className={p.cls}>
          {p.text}
        </span>
      ))}
    </code>
  );
}

function tokenizeJson(src: string): Array<{ text: string; cls: string }> {
  const tokens: Array<{ text: string; cls: string }> = [];
  const re =
    /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],])|(\s+)|([^\s{}\[\],]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) tokens.push({ text: m[1], cls: "text-amber-300/90" });        // key
    else if (m[2]) tokens.push({ text: m[2], cls: "text-emerald-300/90" }); // string
    else if (m[3]) tokens.push({ text: m[3], cls: "text-purple-300/90" });  // literal
    else if (m[4]) tokens.push({ text: m[4], cls: "text-cyan-300/90" });    // number
    else if (m[5]) tokens.push({ text: m[5], cls: "text-ink-muted" });      // structure
    else if (m[6]) tokens.push({ text: m[6], cls: "" });                    // whitespace
    else if (m[7]) tokens.push({ text: m[7], cls: "text-ink-muted" });
  }
  return tokens;
}

// ── Generic card wrapper ────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  icon,
  status,
  empty,
  children,
  bodyClassName,
  headerExtra,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  status: StepStatus;
  empty: boolean;
  children: React.ReactNode;
  bodyClassName?: string;
  headerExtra?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-bg border border-border text-ink-muted flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink truncate">{title}</h2>
            <p className="text-[11px] text-muted mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusDot status={status} />
          {headerExtra}
        </div>
      </div>
      <div className={bodyClassName ?? "p-5"}>
        {empty ? <Skeleton status={status} /> : children}
      </div>
    </section>
  );
}

function StatusDot({ status }: { status: StepStatus }) {
  if (status === "idle") return null;
  const cls: Record<Exclude<StepStatus, "idle">, string> = {
    running: "text-amber-200 border-amber-500/40 bg-amber-500/10",
    done: "text-accent border-accent/40 bg-accent/10",
    error: "text-hot border-hot/40 bg-hot/10",
  };
  const dot: Record<Exclude<StepStatus, "idle">, string> = {
    running: "bg-amber-300 animate-blink",
    done: "bg-accent shadow-glow-accent",
    error: "bg-hot",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls[status]}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot[status]}`} />
      {status}
    </span>
  );
}

function Skeleton({ status }: { status: StepStatus }) {
  if (status === "running") {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-4 rounded bg-amber-500/10 border border-amber-500/20 animate-pulse"
          />
        ))}
      </div>
    );
  }
  return (
    <div className="text-[12px] text-faint italic py-6 text-center">
      {status === "error" ? "Step failed — see error above." : "Run Generate to populate."}
    </div>
  );
}

// silence "unused" complaint when reactflow is the only consumer of useEffect import
void useEffect;
