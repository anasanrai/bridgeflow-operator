"use client";

import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MarkerType,
  MiniMap,
  Node,
  NodeProps,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  IconArchive,
  IconCalendar,
  IconCheck,
  IconChevron,
  IconClock,
  IconDot,
  IconDownload,
  IconKey,
  IconLock,
  IconMail,
  IconPlay,
  IconRefresh,
  IconRoadmap,
  IconSend,
  IconSparkle,
  IconTarget,
  IconTelegram,
  IconX,
} from "../lib/icons";
import { PipelineResults } from "../lib/types";
import {
  CredentialItem,
  N8nNode,
  N8nWorkflow,
  Playbook,
  StepStatus,
  ValidationIssue,
  ValidationResponse,
  useWorkflowGenerator,
} from "../lib/workflow";

interface Props {
  results: PipelineResults;
  pipelineId?: string | null;
}

export function WorkflowTab({ results, pipelineId }: Props) {
  const wf = useWorkflowGenerator();

  // Jarvis voice/text shortcuts: react to {action:"click",target:"…"}
  // directives the operator gave Jarvis. Idempotent — only fires when
  // the corresponding state is reachable (e.g. self-heal needs a workflow).
  useEffect(() => {
    const onClick = (e: Event) => {
      const target = (e as CustomEvent).detail?.target;
      if (target === "self_heal" && wf.workflow && !wf.running) {
        wf.refineNow(pipelineId ?? null);
      } else if (target === "regenerate_workflow" && !wf.running) {
        wf.generate(results, pipelineId ?? null);
      } else if (target === "download_json" && wf.workflow) {
        const json = JSON.stringify(wf.workflow, null, 2);
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const slug = (wf.workflow.name || "workflow")
          .replace(/[^a-z0-9-]+/gi, "-")
          .toLowerCase() || "workflow";
        a.href = url;
        a.download = `bridgeflow-${slug}-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    };
    window.addEventListener("jarvis:click", onClick);
    return () => window.removeEventListener("jarvis:click", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wf.workflow, wf.running, pipelineId]);

  return (
    <div className="space-y-5">
      <Header
        running={wf.running}
        steps={wf.steps}
        validation={wf.validation}
        refinementPasses={wf.refinementPasses}
        lastFixedIssues={wf.lastFixedIssues}
        onGenerate={() => wf.generate(results, pipelineId ?? null)}
        onRefine={() => wf.refineNow(pipelineId ?? null)}
        onReset={wf.reset}
      />

      {wf.error && (
        <div className="rounded-xl border border-hot/40 bg-hot/5 p-4 text-sm text-hot">
          {wf.error}
        </div>
      )}

      <WorkflowPreviewCard workflow={wf.workflow} status={wf.steps.workflow} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <PlaybookCard playbook={wf.playbook} status={wf.steps.playbook} />
        <CredentialsCard
          credentials={wf.credentials?.credentials ?? null}
          status={wf.steps.credentials}
        />
      </div>

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
  refinementPasses,
  lastFixedIssues,
  onGenerate,
  onRefine,
  onReset,
}: {
  running: boolean;
  steps: Record<string, StepStatus>;
  validation: ValidationResponse | null;
  refinementPasses: number;
  lastFixedIssues: ValidationIssue[];
  onGenerate: () => void;
  onRefine: () => void;
  onReset: () => void;
}) {
  const order: Array<{ key: keyof typeof steps; label: string }> = [
    { key: "playbook", label: "Playbook" },
    { key: "workflow", label: "Workflow draft" },
    { key: "credentials", label: "Credentials" },
    { key: "validation", label: "Validation" },
    { key: "refine", label: "Self-correct" },
  ];
  const allIdle = order.every((s) => steps[s.key] === "idle");
  // "Done" if every step except refine is done, AND refine is either idle
  // (no blockers, never needed) or done.
  const allDone =
    order
      .filter((s) => s.key !== "refine")
      .every((s) => steps[s.key] === "done") &&
    (steps.refine === "idle" || steps.refine === "done");

  const refining = steps.refine === "running";
  const fixedBlockerCount = (lastFixedIssues || []).filter(
    (i) => i.severity === "blocker"
  ).length;

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
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/40 text-accent bg-accent/10">
                Live
              </span>
              {validation && <ValidationBadge validation={validation} />}
              {refining && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/55 bg-amber-500/15 text-amber-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-blink" />
                  Self-correcting · pass {refinementPasses + 1}/2
                </span>
              )}
              {!refining && refinementPasses > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/45 bg-accent/10 text-accent"
                  title={
                    fixedBlockerCount > 0
                      ? `Opus 4.7 applied ${fixedBlockerCount} blocker fix${fixedBlockerCount === 1 ? "" : "es"} across ${refinementPasses} pass${refinementPasses === 1 ? "" : "es"}.`
                      : "Workflow refined automatically."
                  }
                >
                  <IconCheck className="w-3 h-3" />
                  Self-corrected ×{refinementPasses}
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5 max-w-2xl">
              Opus 4.7 turns this pipeline run into a structured playbook,
              production-ready n8n workflow JSON, credential checklist, and
              an honest validation pass — and re-prompts itself when the
              validator surfaces blockers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
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
          {(() => {
            // Manual self-heal — visible whenever validation is done and
            // there's anything left to fix (blockers OR warnings). Hidden
            // before validation runs and once we hit the 5-pass server cap.
            if (!validation) return null;
            const fixable = validation.issues.filter(
              (i) => i.severity === "blocker" || i.severity === "warning"
            ).length;
            if (fixable === 0) return null;
            const capped = refinementPasses >= 5;
            return (
              <button
                onClick={onRefine}
                disabled={running || capped}
                title={
                  capped
                    ? "Refinement cap reached (5 passes)"
                    : `Apply ${fixable} suggested fix${fixable === 1 ? "" : "es"} via Opus 4.7`
                }
                className="inline-flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-md border border-accent/45 bg-accent/[0.08] text-accent hover:bg-accent/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-glow-accent"
              >
                <IconSparkle className="w-3.5 h-3.5" />
                {running
                  ? "Refining…"
                  : capped
                  ? "Capped"
                  : `Self-heal · ${fixable} fix${fixable === 1 ? "" : "es"}`}
              </button>
            );
          })()}
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

// ── 3. Workflow preview (n8n-styled React Flow) ──────────────────────────

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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reset selection when the workflow changes (e.g. refine pass).
  useEffect(() => {
    setSelectedId(null);
  }, [workflow]);

  const selectedRaw = useMemo(() => {
    if (!workflow || !selectedId) return null;
    return workflow.nodes.find((n) => n.name === selectedId) ?? null;
  }, [workflow, selectedId]);

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
            } connections · click any node to inspect`
          : "Visual node graph rendered with React Flow, n8n-style."
      }
      icon={<IconSparkle className="w-4 h-4" />}
      status={status}
      empty={!workflow}
      bodyClassName="p-0"
    >
      {workflow && (
        <div className="relative h-[640px] bg-[#0a0a0c] border-t border-border">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.12, minZoom: 0.55, maxZoom: 1.25 }}
            minZoom={0.3}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
            onNodeClick={(_, node) =>
              setSelectedId((cur) => (cur === node.id ? null : node.id))
            }
            onPaneClick={() => setSelectedId(null)}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              animated: false,
              style: { stroke: "rgba(255,255,255,0.32)", strokeWidth: 1.6 },
              markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(255,255,255,0.45)" },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="rgba(255,255,255,0.07)"
            />
            <Controls
              showInteractive={false}
              className="!bg-[#15151a] !border !border-[#26262b] !rounded-md !shadow-none [&_button]:!bg-[#15151a] [&_button]:!border-b [&_button]:!border-[#26262b] [&_button:last-child]:!border-b-0 [&_button:hover]:!bg-[#1c1c22] [&_svg]:!fill-ink-muted"
            />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(0,0,0,0.55)"
              nodeColor={(n) =>
                (n.data as any)?.kind === "trigger"
                  ? "#00d4aa"
                  : (n.data as any)?.kind === "branch"
                  ? "#22c55e"
                  : (n.data as any)?.kind === "sub"
                  ? "#52525b"
                  : "#3f3f46"
              }
              nodeStrokeColor="transparent"
              style={{ width: 160, height: 96 }}
              className="!bg-[#15151a] !border !border-[#26262b] !rounded-md"
            />
          </ReactFlow>

          {selectedRaw && (
            <NodeDetailDrawer
              node={selectedRaw}
              workflow={workflow}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </Card>
  );
}

// ── Node detail drawer (click-to-inspect on the canvas) ────────────────

function NodeDetailDrawer({
  node,
  workflow,
  onClose,
}: {
  node: N8nNode;
  workflow: N8nWorkflow;
  onClose: () => void;
}) {
  const kind = nodeKind(
    node.type,
    countIncoming(workflow, node.name) > 0
  );
  const t = serviceTheme(node.type, node.name, kind);

  // Inbound + outbound names for context.
  const outbound = (workflow.connections?.[node.name]?.main ?? [])
    .flatMap((arr, i) => arr.map((c) => `${i > 0 ? `[${i}] ` : ""}${c.node}`));
  const inbound: string[] = [];
  Object.entries(workflow.connections ?? {}).forEach(([src, conn]) => {
    (conn.main ?? []).forEach((arr) =>
      arr.forEach((c) => {
        if (c.node === node.name) inbound.push(src);
      })
    );
  });

  const params = (node.parameters as any) ?? {};
  const paramEntries = Object.entries(params).slice(0, 24);

  const credEntries = Object.entries(node.credentials ?? {});

  return (
    <aside
      className="absolute top-0 right-0 bottom-0 w-[360px] bg-[#101013] border-l border-[#26262b] shadow-[-12px_0_30px_-12px_rgba(0,0,0,0.7)] flex flex-col z-10 animate-fade-in-up"
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-start justify-between gap-2 px-4 py-3 border-b border-[#222225]">
        <div className="flex items-start gap-2 min-w-0">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 ${t.iconBg} ${t.iconFg}`}>
            {t.glyph}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-white leading-tight truncate">
              {node.name}
            </div>
            <div className="text-[10.5px] text-ink-muted/80 leading-tight font-mono truncate">
              {t.label}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-ink p-1 -mr-1 cursor-pointer"
        >
          <IconX className="w-4 h-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-4 text-[12px] text-ink-muted">
        <DetailRow label="Type">
          <code className="text-[11px] font-mono text-ink-muted bg-bg/60 border border-border rounded px-1.5 py-0.5 break-all">
            {node.type}
          </code>
        </DetailRow>
        {node.typeVersion != null && (
          <DetailRow label="typeVersion">
            <span className="font-mono text-ink-muted">{node.typeVersion}</span>
          </DetailRow>
        )}
        {node.id && (
          <DetailRow label="id">
            <code className="text-[10.5px] font-mono text-faint break-all">{node.id}</code>
          </DetailRow>
        )}
        {Array.isArray(node.position) && node.position.length === 2 && (
          <DetailRow label="position">
            <span className="font-mono text-faint">
              [{node.position[0]}, {node.position[1]}]
            </span>
          </DetailRow>
        )}

        {(inbound.length > 0 || outbound.length > 0) && (
          <DetailSection title="Connections">
            {inbound.length > 0 && (
              <ConnList label="From" items={inbound} />
            )}
            {outbound.length > 0 && (
              <ConnList label="To" items={outbound} />
            )}
          </DetailSection>
        )}

        {credEntries.length > 0 && (
          <DetailSection title="Credentials">
            <ul className="space-y-1.5">
              {credEntries.map(([credType, ref]) => (
                <li
                  key={credType}
                  className="rounded-md border border-border bg-bg/40 px-2 py-1.5 flex items-center justify-between gap-2"
                >
                  <code className="text-[11px] font-mono text-ink-muted truncate">{credType}</code>
                  <span className="text-[10.5px] text-faint truncate">
                    {(ref as any)?.name || "(unnamed)"}
                  </span>
                </li>
              ))}
            </ul>
          </DetailSection>
        )}

        {paramEntries.length > 0 ? (
          <DetailSection title="Parameters">
            <ul className="space-y-1.5">
              {paramEntries.map(([k, v]) => (
                <li key={k} className="rounded-md border border-border bg-bg/40 px-2 py-1.5">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-faint">
                    {k}
                  </div>
                  <div className="text-[11px] font-mono text-ink-muted whitespace-pre-wrap break-words mt-0.5">
                    {formatParamValue(v)}
                  </div>
                </li>
              ))}
            </ul>
          </DetailSection>
        ) : (
          <div className="text-[11px] text-faint italic">No parameters set.</div>
        )}
      </div>

      <footer className="px-4 py-2.5 border-t border-[#222225] text-[10px] font-mono text-faint flex items-center justify-between">
        <span>tap pane to deselect</span>
        <span className="uppercase tracking-wider">{kind}</span>
      </footer>
    </aside>
  );
}

function countIncoming(wf: N8nWorkflow, name: string): number {
  let n = 0;
  Object.values(wf.connections ?? {}).forEach((c) =>
    (c.main ?? []).forEach((arr) => arr.forEach((e) => {
      if (e.node === name) n++;
    }))
  );
  return n;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-faint w-20 shrink-0">
        {label}
      </span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-[10px] font-mono uppercase tracking-wider text-faint mb-1.5">
        {title}
      </div>
      {children}
    </section>
  );
}

function ConnList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="text-[10px] font-mono text-faint mb-1">{label}</div>
      <ul className="space-y-1">
        {items.map((name, i) => (
          <li
            key={`${label}-${name}-${i}`}
            className="text-[11px] text-ink-muted bg-bg/40 border border-border rounded px-2 py-1 truncate"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatParamValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 320 ? v.slice(0, 320) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v, null, 2);
    return s.length > 480 ? s.slice(0, 480) + "\n…" : s;
  } catch {
    return String(v);
  }
}

// ── n8n node taxonomy + service icons ───────────────────────────────────

const SUB_NODE_PATTERNS =
  /lmChat|embeddings|memoryBuffer|memoryWindow|vectorStore|outputParser|toolWorkflow|toolHttpRequest|toolCode|toolCalculator|toolVectorStore/i;

const TRIGGER_PATTERNS = /webhook|cronTrigger|scheduleTrigger|formTrigger|manualTrigger|emailReadImap/i;

const BRANCH_PATTERNS = /\.(if|switch)$/i;

type NodeKind = "trigger" | "agent" | "branch" | "wait" | "merge" | "action" | "transform" | "sub" | "note";

interface SubPort {
  name: string;
  type: "Chat Model" | "Memory" | "Tool";
}

interface MainNodeData {
  kind: NodeKind;
  name: string;
  type: string;
  service: string;
  subtitle?: string;
  ports?: SubPort[];   // sub-node attachment points (only on agents)
  branches?: string[]; // multi-output labels (e.g. HOT/WARM/COLD on Switch)
}

interface SubNodeData {
  kind: "sub";
  name: string;
  type: string;
  service: string;
  attach: SubPort["type"];
}

function nodeKind(type: string, hasIncoming: boolean): NodeKind {
  if (/stickyNote/i.test(type)) return "note";
  if (SUB_NODE_PATTERNS.test(type)) return "sub";
  if (/\.wait$/i.test(type)) return "wait";
  // Trigger only when used as one — i.e. no inbound main edges.
  // Otherwise scheduleTrigger inline is treated as a "wait" node.
  if (TRIGGER_PATTERNS.test(type)) return hasIncoming ? "wait" : "trigger";
  if (/langchain\.agent/i.test(type)) return "agent";
  if (BRANCH_PATTERNS.test(type)) return "branch";
  if (/\.merge$/i.test(type)) return "merge";
  if (/emailSend|httpRequest|telegram|slack|googleCalendar|gmail|hubspot|airtable|notion|sheets/i.test(type)) return "action";
  return "transform";
}

interface ServiceTheme {
  label: string;
  iconBg: string;
  iconFg: string;
  glyph: React.ReactNode;
}

function serviceTheme(type: string, name: string, kind?: NodeKind): ServiceTheme {
  // All regexes use /i so the camelCase n8n type strings match cleanly.
  const t = type;
  const n = name;

  // Wait first — beats trigger when the node is mid-flow.
  if (kind === "wait" || /\.wait$/i.test(t))
    return { label: "Wait", iconBg: "bg-amber-500/15", iconFg: "text-amber-300", glyph: <IconClock className="w-4 h-4" /> };

  // Triggers
  if (kind === "trigger") {
    if (/scheduleTrigger|cron/i.test(t))
      return { label: "Schedule", iconBg: "bg-accent/15", iconFg: "text-accent", glyph: <IconClock className="w-4 h-4" /> };
    if (/formTrigger/i.test(t))
      return { label: "Form trigger", iconBg: "bg-accent/15", iconFg: "text-accent", glyph: <BoltGlyph className="w-4 h-4" /> };
    return { label: "Webhook", iconBg: "bg-accent/15", iconFg: "text-accent", glyph: <BoltGlyph className="w-4 h-4" /> };
  }

  // Branch / merge
  if (BRANCH_PATTERNS.test(t))
    return { label: "Switch", iconBg: "bg-emerald-500/15", iconFg: "text-emerald-400", glyph: <SignpostGlyph className="w-4 h-4" /> };
  if (/\.merge$/i.test(t))
    return { label: "Merge", iconBg: "bg-cold/15", iconFg: "text-cold", glyph: <MergeGlyph className="w-4 h-4" /> };

  // Agent
  if (/langchain\.agent/i.test(t))
    return { label: "AI Agent", iconBg: "bg-white/[0.08]", iconFg: "text-white", glyph: <RobotGlyph className="w-4 h-4" /> };

  // Sub-nodes (langchain) — kept LM/Memory/Tool tighter, brand-colored.
  if (/lmChat.*Anthropic|claude/i.test(t) || /anthropic/i.test(n))
    return { label: "Anthropic", iconBg: "bg-[#cc785c]/25", iconFg: "text-[#e6b89c]", glyph: <span className="font-bold text-[13px] leading-none">A</span> };
  if (/lmChat.*OpenAi|openai|gpt/i.test(t) || /openai|gpt/i.test(n))
    return { label: "OpenAI", iconBg: "bg-emerald-500/20", iconFg: "text-emerald-300", glyph: <span className="font-bold text-[11px] leading-none">AI</span> };
  if (/lmChat.*Google|gemini/i.test(t) || /gemini/i.test(n))
    return { label: "Gemini", iconBg: "bg-blue-500/20", iconFg: "text-blue-300", glyph: <span className="font-bold text-[12px] leading-none">G</span> };
  if (/memoryBuffer|memoryWindow|memoryRedis|memoryPostgres/i.test(t))
    return { label: "Memory", iconBg: "bg-cold/20", iconFg: "text-cold", glyph: <span className="font-bold text-[11px] leading-none">M</span> };
  if (/vectorStore/i.test(t))
    return { label: "Vector", iconBg: "bg-cold/20", iconFg: "text-cold", glyph: <span className="font-bold text-[11px] leading-none">V</span> };
  if (/outputParser/i.test(t))
    return { label: "Parser", iconBg: "bg-amber-500/20", iconFg: "text-amber-300", glyph: <span className="font-mono font-bold text-[10px] leading-none">{"{}"}</span> };
  if (/tool/i.test(t))
    return { label: "Tool", iconBg: "bg-amber-500/20", iconFg: "text-amber-300", glyph: <span className="font-bold text-[11px] leading-none">T</span> };

  // Actions — branded chips
  if (/telegram/i.test(t))
    return { label: "Telegram", iconBg: "bg-[#26a5e4]/15", iconFg: "text-[#26a5e4]", glyph: <IconTelegram className="w-4 h-4" /> };
  if (/slack/i.test(t))
    return { label: "Slack", iconBg: "bg-[#4a154b]/25", iconFg: "text-[#ecb22e]", glyph: <SlackGlyph className="w-4 h-4" /> };
  if (/googleCalendar|calendar/i.test(t))
    return { label: "Calendar", iconBg: "bg-[#4285f4]/20", iconFg: "text-[#8ab4f8]", glyph: <IconCalendar className="w-4 h-4" /> };
  if (/emailSend|gmail/i.test(t))
    return { label: "Email", iconBg: "bg-cold/15", iconFg: "text-cold", glyph: <IconMail className="w-4 h-4" /> };
  if (/httpRequest/i.test(t)) {
    if (/resend/i.test(n))
      return { label: "Resend", iconBg: "bg-white/[0.08]", iconFg: "text-white", glyph: <IconMail className="w-4 h-4" /> };
    if (/telegram/i.test(n))
      return { label: "Telegram", iconBg: "bg-[#26a5e4]/15", iconFg: "text-[#26a5e4]", glyph: <IconTelegram className="w-4 h-4" /> };
    return { label: "HTTP", iconBg: "bg-cold/15", iconFg: "text-cold", glyph: <IconSend className="w-4 h-4" /> };
  }

  // Transforms
  if (/\.set$/i.test(t))
    return { label: "Set", iconBg: "bg-white/[0.06]", iconFg: "text-ink-muted", glyph: <span className="font-mono font-bold text-[10px] leading-none">{"{ }"}</span> };
  if (/code|function/i.test(t))
    return { label: "Code", iconBg: "bg-white/[0.06]", iconFg: "text-ink-muted", glyph: <span className="font-mono font-bold text-[10px] leading-none">{"</>"}</span> };
  if (/archive/i.test(n))
    return { label: "Archive", iconBg: "bg-white/[0.06]", iconFg: "text-ink-muted", glyph: <IconArchive className="w-4 h-4" /> };
  if (/stickyNote/i.test(t))
    return { label: "Note", iconBg: "bg-amber-500/10", iconFg: "text-amber-300", glyph: <IconRoadmap className="w-4 h-4" /> };

  return { label: "Node", iconBg: "bg-white/[0.06]", iconFg: "text-ink-muted", glyph: <IconDot className="w-4 h-4" /> };
}

function subAttachType(type: string): SubPort["type"] {
  if (/lmChat|embeddings/i.test(type)) return "Chat Model";
  if (/memoryBuffer|memoryWindow/i.test(type)) return "Memory";
  return "Tool";
}

// ── Custom node renderers ────────────────────────────────────────────────

function MainNode({ data }: NodeProps<MainNodeData>) {
  const t = serviceTheme(data.type, data.name, data.kind);
  const isTrigger = data.kind === "trigger";
  const branches = data.branches ?? [];

  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[#52525b] !border-0"
        style={{ visibility: isTrigger ? "hidden" : "visible" }}
      />

      {isTrigger && (
        <div className="absolute -left-7 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-bg border border-accent/40 text-accent flex items-center justify-center shadow-glow-accent">
          <BoltGlyph className="w-3 h-3" />
        </div>
      )}

      <div
        className={`flex items-center gap-2.5 rounded-xl bg-[#15151a] border border-[#26262b] shadow-[0_2px_12px_rgba(0,0,0,0.5)] px-3 py-2.5 min-w-[210px] ${
          isTrigger ? "rounded-l-3xl" : ""
        }`}
        style={{ boxShadow: isTrigger ? "0 0 0 1px rgba(0,212,170,0.18), 0 2px 12px rgba(0,0,0,0.5)" : undefined }}
      >
        <div
          className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${t.iconBg} ${t.iconFg}`}
        >
          {t.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-white leading-tight truncate">
            {data.name}
          </div>
          <div className="text-[10.5px] text-ink-muted/80 leading-tight truncate">
            {data.subtitle ?? t.label}
          </div>
        </div>
      </div>

      {/* Sub-node attachment ports below the card (agent only) */}
      {data.ports && data.ports.length > 0 && (
        <div className="absolute left-0 right-0 top-full flex items-start justify-around pt-1.5 pointer-events-none">
          {data.ports.map((p) => (
            <div
              key={p.name}
              className="flex flex-col items-center text-[9px] font-mono uppercase tracking-wider text-ink-muted/70 leading-none"
            >
              <Handle
                type="source"
                position={Position.Bottom}
                id={`sub:${p.name}`}
                className="!w-2 !h-2 !rotate-45 !bg-transparent !border !border-ink-muted/60"
                style={{ position: "static", transform: "rotate(45deg)", marginBottom: 4 }}
              />
              <span className="mt-0.5">{p.type}</span>
            </div>
          ))}
        </div>
      )}

      {/* Branch labels for switch/if — chip + handle pair stacked tightly */}
      {branches.length > 0 ? (
        <>
          {branches.map((label, i) => {
            const top = 14 + i * 18;
            const tone =
              /hot/i.test(label)
                ? "border-hot/45 text-hot bg-hot/10"
                : /warm/i.test(label)
                ? "border-warm/45 text-warm bg-warm/10"
                : /cold/i.test(label)
                ? "border-cold/45 text-cold bg-cold/10"
                : /^true$/i.test(label)
                ? "border-accent/45 text-accent bg-accent/10"
                : /^false$/i.test(label)
                ? "border-faint/60 text-faint bg-bg"
                : "border-border text-ink-muted bg-bg";
            return (
              <span
                key={`chip-${label}-${i}`}
                className={`absolute -right-1 translate-x-full text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${tone}`}
                style={{ top, marginLeft: 6 }}
              >
                {label}
              </span>
            );
          })}
          {branches.map((label, i) => (
            <Handle
              key={`h-${label}-${i}`}
              type="source"
              position={Position.Right}
              id={`branch:${label}`}
              className="!w-2 !h-2 !bg-[#52525b] !border-0"
              style={{ top: `${20 + i * 18}px` }}
            />
          ))}
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2 !h-2 !bg-[#52525b] !border-0"
        />
      )}
    </div>
  );
}

function SubNode({ data }: NodeProps<SubNodeData>) {
  const t = serviceTheme(data.type, data.name, "sub");
  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !rotate-45 !bg-transparent !border !border-ink-muted/60"
        style={{ transform: "rotate(45deg)" }}
      />
      <div
        className={`w-11 h-11 rounded-full bg-[#15151a] border border-[#26262b] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.6)] ${t.iconBg} ${t.iconFg}`}
      >
        {t.glyph}
      </div>
      <div className="text-center max-w-[110px]">
        <div className="text-[10.5px] text-white leading-tight truncate">{data.name}</div>
        <div className="text-[9px] font-mono uppercase tracking-wider text-ink-muted/60 mt-0.5">
          {t.label}
        </div>
      </div>
    </div>
  );
}

function NoteNode({ data }: NodeProps<MainNodeData>) {
  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/[0.05] px-2.5 py-1.5">
      <div className="text-[9px] font-mono uppercase tracking-wider text-amber-300/80">
        Note
      </div>
      <div className="text-[11px] text-ink-muted leading-tight mt-0.5 max-w-[220px]">
        {data.subtitle ?? data.name}
      </div>
    </div>
  );
}

const NODE_TYPES = {
  n8nMain: MainNode,
  n8nSub: SubNode,
  n8nNote: NoteNode,
} as const;

// ── Layout + edge synthesis ──────────────────────────────────────────────

const COL_W = 290;
const MAIN_ROW_H = 120;
const SUB_ROW_OFFSET = 95;
const SUB_COL_W = 110;

function toReactFlow(wf: N8nWorkflow): { nodes: Node[]; edges: Edge[] } {
  // Pre-compute incoming-edge counts so we can correctly classify
  // scheduleTrigger nodes used inline as "wait" instead of "trigger".
  const incoming = new Map<string, number>();
  wf.nodes.forEach((n) => incoming.set(n.name, 0));
  Object.entries(wf.connections ?? {}).forEach(([, c]) =>
    (c.main ?? []).forEach((arr) =>
      arr.forEach((edge) =>
        incoming.set(edge.node, (incoming.get(edge.node) ?? 0) + 1)
      )
    )
  );

  const kinds = new Map<string, NodeKind>();
  wf.nodes.forEach((n) =>
    kinds.set(n.name, nodeKind(n.type, (incoming.get(n.name) ?? 0) > 0))
  );

  // Split sub-nodes from the main flow.
  const mainNodes = wf.nodes.filter((n) => kinds.get(n.name) !== "sub" && kinds.get(n.name) !== "note");
  const subNodes = wf.nodes.filter((n) => kinds.get(n.name) === "sub");
  const noteNodes = wf.nodes.filter((n) => kinds.get(n.name) === "note");

  // Layered layout for main flow only.
  const layout = layeredLayout(wf, mainNodes);

  // For each sub-node, find its parent agent (closest agent in main layout, or first agent).
  const agents = mainNodes.filter((n) => kinds.get(n.name) === "agent");
  const subParent = new Map<string, string>(); // subName -> parentAgentName
  if (agents.length > 0) {
    subNodes.forEach((s, i) => {
      // Heuristic: round-robin across agents if multiple.
      const parent = agents[i % agents.length];
      subParent.set(s.name, parent.name);
    });
  }

  // Branch labels — pull off Switch nodes' rule outputKeys.
  const branchLabels = new Map<string, string[]>();
  wf.nodes.forEach((n) => {
    if (BRANCH_PATTERNS.test(n.type)) {
      const rules = (n.parameters as any)?.rules?.values ?? [];
      const labels: string[] = Array.isArray(rules)
        ? rules.map((r: any, idx: number) => r?.outputKey || String(idx))
        : [];
      if (labels.length === 0 && /\.if$/i.test(n.type)) {
        labels.push("true", "false");
      }
      if (labels.length > 0) branchLabels.set(n.name, labels);
    }
  });

  // Detect ports per agent (by walking sub-nodes attached to it)
  const agentPorts = new Map<string, SubPort[]>();
  agents.forEach((a) => agentPorts.set(a.name, []));
  subNodes.forEach((s) => {
    const parent = subParent.get(s.name);
    if (!parent) return;
    const list = agentPorts.get(parent) ?? [];
    list.push({ name: s.name, type: subAttachType(s.type) });
    agentPorts.set(parent, list);
  });

  // Build React Flow nodes.
  const rfNodes: Node[] = [];

  mainNodes.forEach((n) => {
    const k = kinds.get(n.name) ?? "transform";
    const pos = layout.get(n.name) ?? { x: 0, y: 0 };
    const ports = k === "agent" ? agentPorts.get(n.name) : undefined;
    const branches = branchLabels.get(n.name);
    rfNodes.push({
      id: n.name,
      type: "n8nMain",
      position: pos,
      draggable: false,
      data: {
        kind: k,
        name: n.name,
        type: n.type,
        service: serviceTheme(n.type, n.name).label,
        subtitle: subtitleFor(n),
        ports,
        branches,
      } satisfies MainNodeData,
    });
  });

  // Position sub-nodes below their parent agent.
  agents.forEach((a) => {
    const ports = agentPorts.get(a.name) ?? [];
    const parentPos = layout.get(a.name) ?? { x: 0, y: 0 };
    const totalWidth = (ports.length - 1) * SUB_COL_W;
    const startX = parentPos.x + 105 - totalWidth / 2; // 105 ~ middle of card (210px)
    ports.forEach((p, i) => {
      rfNodes.push({
        id: p.name,
        type: "n8nSub",
        position: { x: startX + i * SUB_COL_W, y: parentPos.y + SUB_ROW_OFFSET },
        draggable: false,
        data: {
          kind: "sub",
          name: p.name,
          type: subTypeFor(p.name, wf),
          service: serviceTheme(subTypeFor(p.name, wf), p.name).label,
          attach: p.type,
        } satisfies SubNodeData,
      });
    });
  });

  // Notes: tuck above the trigger column so they don't overlap any node.
  // Compute the top of the main flow's leftmost column and float the
  // sticky there with a clear margin.
  const mainXs = Array.from(layout.values()).map((p) => p.x);
  const mainYs = Array.from(layout.values()).map((p) => p.y);
  const minX = mainXs.length ? Math.min(...mainXs) : 0;
  const minY = mainYs.length ? Math.min(...mainYs) : 0;
  noteNodes.forEach((n, i) => {
    rfNodes.push({
      id: n.name,
      type: "n8nNote",
      position: { x: minX, y: minY - 120 - i * 70 },
      draggable: false,
      data: {
        kind: "note",
        name: n.name,
        type: n.type,
        service: "note",
        subtitle: ((n.parameters as any)?.content as string) || n.name,
      } satisfies MainNodeData,
    });
  });

  // Build edges.
  const rfEdges: Edge[] = [];

  // Main flow edges — use branch handles if the source is a switch.
  Object.entries(wf.connections ?? {}).forEach(([source, conn]) => {
    const labels = branchLabels.get(source);
    (conn.main ?? []).forEach((arr, outIdx) => {
      arr.forEach((c) => {
        rfEdges.push({
          id: `${source}__${outIdx}__${c.node}__${c.index}`,
          source,
          target: c.node,
          sourceHandle: labels && labels[outIdx] ? `branch:${labels[outIdx]}` : undefined,
          type: "smoothstep",
          style: { stroke: "rgba(255,255,255,0.32)", strokeWidth: 1.6 },
        });
      });
    });
  });

  // Sub-node edges (dashed, downward).
  subNodes.forEach((s) => {
    const parent = subParent.get(s.name);
    if (!parent) return;
    rfEdges.push({
      id: `sub__${parent}__${s.name}`,
      source: parent,
      target: s.name,
      sourceHandle: `sub:${s.name}`,
      type: "smoothstep",
      style: {
        stroke: "rgba(255,255,255,0.22)",
        strokeWidth: 1.2,
        strokeDasharray: "4 4",
      },
    });
  });

  return { nodes: rfNodes, edges: rfEdges };
}

function subtitleFor(n: N8nNode): string {
  const params = (n.parameters as any) ?? {};
  // Common patterns to surface a useful one-liner under the title.
  if (params?.method && params?.url) return `${String(params.method).toUpperCase()} · ${truncate(String(params.url), 28)}`;
  if (params?.operation) return `op: ${params.operation}`;
  if (params?.path) return `path: ${truncate(String(params.path), 22)}`;
  if (params?.amount && params?.unit) return `wait ${params.amount} ${params.unit}`;
  if (params?.text) return truncate(String(params.text), 32);
  if (params?.subject) return truncate(String(params.subject), 28);
  return shortLabel(n.type);
}

function shortLabel(type: string): string {
  return type.replace(/^@n8n\//, "").replace(/^n8n-nodes-base\./, "").replace(/^n8n-nodes-langchain\./, "");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function subTypeFor(name: string, wf: N8nWorkflow): string {
  return wf.nodes.find((x) => x.name === name)?.type ?? "";
}

function layeredLayout(wf: N8nWorkflow, mainOnly: N8nNode[]): Map<string, { x: number; y: number }> {
  const mainSet = new Set(mainOnly.map((n) => n.name));
  const incoming = new Map<string, number>();
  mainOnly.forEach((n) => incoming.set(n.name, 0));
  Object.entries(wf.connections ?? {}).forEach(([src, c]) => {
    if (!mainSet.has(src)) return;
    (c.main ?? []).forEach((arr) =>
      arr.forEach((edge) => {
        if (mainSet.has(edge.node)) {
          incoming.set(edge.node, (incoming.get(edge.node) ?? 0) + 1);
        }
      })
    );
  });
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
        if (!mainSet.has(edge.node)) return;
        const next = (layer.get(cur) ?? 0) + 1;
        if ((layer.get(edge.node) ?? -1) < next) {
          layer.set(edge.node, next);
          queue.push(edge.node);
        }
      })
    );
  }
  // Group by layer to place evenly.
  const cols = new Map<number, string[]>();
  layer.forEach((l, name) => {
    if (!cols.has(l)) cols.set(l, []);
    cols.get(l)!.push(name);
  });
  // Stable ordering: original wf.nodes order.
  cols.forEach((arr) => arr.sort((a, b) => mainOnly.findIndex((n) => n.name === a) - mainOnly.findIndex((n) => n.name === b)));

  const result = new Map<string, { x: number; y: number }>();
  const colCount = Math.max(1, Math.max(...Array.from(cols.keys(), (k) => k + 1)));
  cols.forEach((names, l) => {
    const totalH = (names.length - 1) * MAIN_ROW_H;
    names.forEach((n, i) => {
      result.set(n, {
        x: l * COL_W,
        y: i * MAIN_ROW_H - totalH / 2,
      });
    });
  });
  // Orphan main-flow nodes get tucked at the bottom.
  mainOnly.forEach((n, i) => {
    if (!result.has(n.name)) result.set(n.name, { x: 0, y: (i + 1) * MAIN_ROW_H });
  });
  void colCount;
  return result;
}

// ── Inline glyphs (n8n-style minimal SVGs) ───────────────────────────────

function BoltGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

function SignpostGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3v3" />
      <path d="M12 11v3" />
      <path d="M12 19v2" />
      <path d="M5 6h12l3 2.5L17 11H5z" />
      <path d="M19 14H7l-3 2.5L7 19h12z" />
    </svg>
  );
}

function MergeGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 5l7 7 7-7" />
      <path d="M12 12v8" />
    </svg>
  );
}

function RobotGlyph({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="7" width="16" height="11" rx="2.5" />
      <circle cx="9" cy="12.5" r="1.3" fill="currentColor" />
      <circle cx="15" cy="12.5" r="1.3" fill="currentColor" />
      <path d="M9 16h6" />
      <path d="M12 4v3" />
    </svg>
  );
}

function SlackGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#36c5f0" d="M5 14a2 2 0 1 1 0-4h2v4z" />
      <path fill="#36c5f0" d="M6 14h2v2a2 2 0 1 1-2 0z" />
      <path fill="#2eb67d" d="M10 5a2 2 0 1 1 4 0v2h-2a2 2 0 0 1-2-2z" />
      <path fill="#2eb67d" d="M10 6h2a2 2 0 0 1 2 2v2h-4z" />
      <path fill="#ecb22e" d="M19 10a2 2 0 1 1 0 4h-2v-4z" />
      <path fill="#ecb22e" d="M16 10v-2a2 2 0 1 1 2 0v2z" />
      <path fill="#e01e5a" d="M14 19a2 2 0 1 1-4 0v-2h2a2 2 0 0 1 2 2z" />
      <path fill="#e01e5a" d="M10 16h4v2h-4z" />
    </svg>
  );
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
  const [toast, setToast] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
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

  const downloadJson = () => {
    if (!json) return;
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const slug =
      (workflow?.name || "workflow").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "workflow";
    a.href = url;
    a.download = `bridgeflow-${slug}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  return (
    <Card
      title="Workflow JSON"
      subtitle={
        workflow
          ? "Paste this into n8n's import dialog, or download the file."
          : "Will populate after the draft step."
      }
      icon={<IconCheck className="w-4 h-4" />}
      status={status}
      empty={!workflow}
      bodyClassName="p-0"
      headerExtra={
        workflow && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <button
              onClick={() => showToast("Zapier export coming in V3")}
              title="Available in V3"
              className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-bg text-faint hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <IconLock className="w-3 h-3 text-amber-300/80" />
              Export for Zapier <span className="text-amber-300/80">(V3)</span>
            </button>
            <button
              onClick={() => showToast("Make export coming in V3")}
              title="Available in V3"
              className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-bg text-faint hover:text-ink hover:bg-surface-2 transition-colors cursor-pointer"
            >
              <IconLock className="w-3 h-3 text-amber-300/80" />
              Export for Make <span className="text-amber-300/80">(V3)</span>
            </button>
            <button
              onClick={downloadJson}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-amber-500/40 bg-amber-500/[0.06] text-amber-200 hover:bg-amber-500/[0.12] transition-colors cursor-pointer"
            >
              <IconDownload className="w-3 h-3" />
              Download JSON
            </button>
            <button
              onClick={copyAll}
              className={`inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold px-3 py-1 rounded-md border transition-colors cursor-pointer ${
                copied
                  ? "border-accent/45 bg-accent/15 text-accent"
                  : "border-amber-500/55 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
              }`}
            >
              {copied ? "copied" : "Copy to Clipboard"}
            </button>
          </div>
        )
      }
    >
      {workflow && (
        <>
          <ValidationBlock
            validation={validation}
            status={validationStatus}
          />
          <button
            onClick={() => setShowRaw((r) => !r)}
            className="w-full flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-bg/30 hover:bg-bg/50 transition-colors cursor-pointer"
          >
            <span className="text-[11px] font-mono uppercase tracking-wider text-faint">
              Raw JSON
            </span>
            <span className="flex items-center gap-2 text-[11px] font-mono text-muted">
              <span>
                {workflow.nodes.length} nodes ·{" "}
                {Object.values(workflow.connections ?? {}).reduce(
                  (n, c) => n + (c.main?.reduce((m, arr) => m + arr.length, 0) ?? 0),
                  0
                )}{" "}
                connections · {(json.length / 1024).toFixed(1)} KB
              </span>
              <span className="text-ink-muted">{showRaw ? "hide ▴" : "show ▾"}</span>
            </span>
          </button>
          {showRaw && (
            <pre className="text-[11px] leading-relaxed font-mono text-ink-muted bg-bg/40 border-t border-border p-4 max-h-[440px] overflow-auto scrollbar-thin">
              <Highlight code={json} />
            </pre>
          )}
          {toast && (
            <div className="fixed bottom-6 right-6 z-50 rounded-md border border-amber-500/45 bg-bg/95 backdrop-blur text-amber-200 text-[12px] font-mono px-3 py-2 shadow-glow-accent animate-fade-in-up">
              {toast}
            </div>
          )}
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
  const [expandedSev, setExpandedSev] = useState<Record<string, boolean>>({
    blocker: true,
    warning: false,
    info: false,
  });

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

  // Group issues by severity for a compact summary line + per-severity expand.
  const grouped: Record<"blocker" | "warning" | "info", typeof validation.issues> = {
    blocker: [],
    warning: [],
    info: [],
  };
  validation.issues.forEach((i) => grouped[i.severity]?.push(i));

  const sevMeta: Record<
    "blocker" | "warning" | "info",
    { label: string; cls: string; chip: string }
  > = {
    blocker: {
      label: "blockers",
      cls: "text-hot",
      chip: "border-hot/45 bg-hot/10 text-hot",
    },
    warning: {
      label: "warnings",
      cls: "text-warm",
      chip: "border-warm/45 bg-warm/10 text-warm",
    },
    info: {
      label: "info",
      cls: "text-faint",
      chip: "border-border bg-bg text-muted",
    },
  };

  const toggle = (sev: string) =>
    setExpandedSev((s) => ({ ...s, [sev]: !s[sev] }));

  return (
    <div className={`border-t ${cls} px-4 py-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <ValidationStatusPill status={validation.status} />
        <span className="text-[11px] font-mono text-muted">
          ready_to_copy: {String(validation.ready_to_copy)}
        </span>
        {(["blocker", "warning", "info"] as const).map((sev) =>
          grouped[sev].length > 0 ? (
            <button
              key={sev}
              onClick={() => toggle(sev)}
              className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border cursor-pointer ${sevMeta[sev].chip}`}
            >
              <span className="font-bold tabular-nums">{grouped[sev].length}</span>
              {sevMeta[sev].label}
              <span className="opacity-70">
                {expandedSev[sev] ? "▴" : "▾"}
              </span>
            </button>
          ) : null
        )}
      </div>
      <p className="mt-1.5 text-[12px] text-ink-muted leading-relaxed">
        {validation.summary}
      </p>

      {(["blocker", "warning", "info"] as const).map((sev) => {
        if (!expandedSev[sev] || grouped[sev].length === 0) return null;
        return (
          <ul key={sev} className="mt-2 space-y-1.5">
            {grouped[sev].map((i, idx) => (
              <li
                key={`${sev}-${i.node}-${idx}`}
                className="text-[11px] font-mono leading-relaxed text-ink-muted"
              >
                <span className={`inline-block w-14 mr-2 text-[10px] uppercase tracking-wider ${sevMeta[sev].cls}`}>
                  {sev}
                </span>
                <span className="text-ink">{i.node}:</span> {i.message}
                <div className="ml-16 text-faint">→ {i.fix}</div>
              </li>
            ))}
          </ul>
        );
      })}
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
