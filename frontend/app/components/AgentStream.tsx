"use client";

import { useEffect, useMemo, useRef } from "react";
import { IconCheck, IconClock, IconSparkle, IconX } from "../lib/icons";
import { AGENT_LABELS, AGENT_ORDER, AgentName, AgentState } from "../lib/types";

interface Props {
  agents: Record<AgentName, AgentState>;
  running: boolean;
  /** Interrupt the in-flight pipeline. Wired to useAgentStream.reset(),
   *  which aborts the SSE fetch and resets all agent state to idle. */
  onCancel?: () => void;
}

export function AgentStream({ agents, running, onCancel }: Props) {
  const { done, total, activeIndex } = useMemo(() => {
    const total = AGENT_ORDER.length;
    const done = AGENT_ORDER.filter((n) => agents[n].status === "done").length;
    const activeIndex = AGENT_ORDER.findIndex((n) => agents[n].status === "streaming");
    return { done, total, activeIndex };
  }, [agents]);

  const pct = Math.round((done / total) * 100);

  // Esc → cancel when a run is in flight. Cheap quality-of-life win.
  useEffect(() => {
    if (!running || !onCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, onCancel]);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Agent stream</h2>
              <span className="text-[10px] font-mono text-faint px-1.5 py-0.5 rounded border border-border">
                {total} agents
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {running
                ? activeIndex >= 0
                  ? `Agent ${activeIndex + 1} thinking — live JSON streaming below.`
                  : "Pipeline starting…"
                : done === total
                ? "Pipeline complete."
                : "Idle · awaiting transcript."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {running && onCancel && (
              <button
                onClick={onCancel}
                title="Interrupt the pipeline (Esc)"
                className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2.5 py-1 rounded-md border border-amber-500/45 bg-amber-500/[0.08] text-amber-200 hover:bg-amber-500/15 active:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <StopGlyph className="w-3 h-3" />
                Cancel
                <span className="hidden xl:inline text-[9px] font-mono text-amber-300/70 uppercase tracking-wider">
                  esc
                </span>
              </button>
            )}
            <div className="text-xs font-mono text-muted">
              <span className="text-ink font-semibold">{done}</span>
              <span className="text-faint">/{total}</span>
            </div>
          </div>
        </div>

        <div className="mt-3 relative h-1 rounded-full overflow-hidden bg-border">
          <div
            className="absolute inset-y-0 left-0 bg-accent transition-[width] duration-500 ease-out shadow-glow-accent"
            style={{ width: `${pct}%` }}
          />
          {running && pct < 100 && (
            <div className="absolute inset-y-0 w-24 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          )}
        </div>
      </div>

      <ol className="divide-y divide-border">
        {AGENT_ORDER.map((name, idx) => (
          <li key={name}>
            <AgentCard index={idx + 1} agent={agents[name]} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AgentCard({ agent, index }: { agent: AgentState; index: number }) {
  const label = AGENT_LABELS[agent.name];
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (agent.status === "streaming" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [agent.raw, agent.status]);

  const duration =
    agent.startedAt && agent.completedAt
      ? ((agent.completedAt - agent.startedAt) / 1000).toFixed(1)
      : null;

  const showStream = agent.status !== "idle" || agent.raw;

  return (
    <article className="px-5 py-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StageIndicator index={index} status={agent.status} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink truncate">{label.title}</div>
            <div className="text-xs text-muted truncate">{label.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {agent.status === "streaming" && <ThinkingPill />}
          {duration && agent.status === "done" && (
            <span
              title="Agent runtime"
              className="inline-flex items-center gap-1.5 text-[12px] font-mono font-semibold px-2.5 py-1 rounded-md border border-accent/40 bg-accent/10 text-accent shadow-glow-accent"
            >
              <IconClock className="w-3.5 h-3.5" />
              {duration}s
            </span>
          )}
          <StatusBadge status={agent.status} />
        </div>
      </header>

      {showStream && (
        <div
          ref={scrollRef}
          className="mt-3 rounded-lg border border-border bg-bg max-h-56 overflow-y-auto scrollbar-thin text-[12px] leading-relaxed font-mono text-ink-muted whitespace-pre-wrap px-3 py-2.5"
        >
          {agent.raw ? agent.raw : agent.status === "streaming" ? <SkeletonLine /> : ""}
          {agent.status === "streaming" && (
            <span className="inline-block w-2 h-[13px] align-middle bg-accent ml-0.5 animate-caret" />
          )}
          {agent.error && <div className="mt-2 text-hot">Error: {agent.error}</div>}
        </div>
      )}
    </article>
  );
}

function StageIndicator({ index, status }: { index: number; status: AgentState["status"] }) {
  if (status === "done") {
    return (
      <div className="w-7 h-7 rounded-md bg-accent/15 border border-accent/40 text-accent flex items-center justify-center shadow-glow-accent">
        <IconCheck className="w-3.5 h-3.5" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="w-7 h-7 rounded-md bg-hot/15 border border-hot/40 text-hot flex items-center justify-center">
        <IconX className="w-3.5 h-3.5" />
      </div>
    );
  }
  if (status === "streaming") {
    return (
      <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/40 text-accent flex items-center justify-center relative">
        <IconSparkle className="w-3.5 h-3.5 animate-blink" />
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-md bg-bg border border-border text-muted flex items-center justify-center text-[11px] font-mono">
      {index}
    </div>
  );
}

function ThinkingPill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold px-2 py-1 rounded-md border border-accent/40 bg-accent/10 text-accent">
      <span className="flex items-center gap-0.5">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
      thinking
    </span>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="w-1 h-1 rounded-full bg-current animate-blink"
      style={{ animationDelay: delay }}
    />
  );
}

function SkeletonLine() {
  return (
    <span className="inline-block w-1/2 h-3 rounded bg-border/80 align-middle" />
  );
}

function StopGlyph({ className = "" }: { className?: string }) {
  // Filled square — universal "stop / interrupt" affordance.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function StatusBadge({ status }: { status: AgentState["status"] }) {
  const styles: Record<AgentState["status"], string> = {
    idle: "border-border bg-bg text-faint",
    streaming: "border-accent/40 bg-accent/5 text-accent",
    done: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400",
    error: "border-hot/40 bg-hot/5 text-hot",
  };
  const label: Record<AgentState["status"], string> = {
    idle: "Queued",
    streaming: "Active",
    done: "Done",
    error: "Error",
  };
  return (
    <span
      className={`text-[10px] font-mono font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${styles[status]}`}
    >
      {label[status]}
    </span>
  );
}
