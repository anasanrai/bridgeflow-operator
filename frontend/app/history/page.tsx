"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconChevron,
  IconClock,
  IconRefresh,
  IconSearch,
} from "../lib/icons";
import { fmtDecision, fmtRelative } from "../lib/leads";
import { ScoreBadge } from "../components/ScoreBadge";

interface Run {
  id: string;
  call_id: string | null;
  transcript_preview: string | null;
  prospect_name: string | null;
  company: string | null;
  score: string | null;
  decision: string | null;
  status: string | null;
  approval_state: string | null;
  created_at: string;
}

const FILTERS = ["all", "hot", "warm", "cold"] as const;
type Filter = (typeof FILTERS)[number];

export default function HistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"supabase" | "demo">("supabase");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/history", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { runs: [], source: "demo" }))
      .then((d) => {
        setRuns(d.runs ?? []);
        setSource(d.source ?? "supabase");
      })
      .catch(() => {
        setRuns([]);
        setSource("demo");
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      if (filter !== "all" && (r.score ?? "").toLowerCase() !== filter) return false;
      if (!q) return true;
      return (
        (r.prospect_name ?? "").toLowerCase().includes(q) ||
        (r.company ?? "").toLowerCase().includes(q) ||
        (r.transcript_preview ?? "").toLowerCase().includes(q)
      );
    });
  }, [runs, query, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink flex items-center gap-2">
            <IconClock className="w-5 h-5 text-accent" />
            History
          </h1>
          <p className="text-sm text-muted mt-1">
            Every pipeline run, newest first. Click a row for the full result.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border ${
            source === "supabase" && runs.length > 0
              ? "text-accent border-accent/30 bg-accent/5"
              : "text-muted border-border bg-surface"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              source === "supabase" && runs.length > 0 ? "bg-accent" : "bg-faint"
            }`}
          />
          {source === "supabase" && runs.length > 0
            ? `${runs.length} runs · supabase`
            : "no runs yet"}
        </span>
      </div>

      <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px] relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prospect, company, or transcript…"
              className="w-full pl-9 pr-3 py-2 rounded-md bg-bg border border-border text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-bg p-1">
            {FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-xs px-2.5 py-1 rounded capitalize transition-colors cursor-pointer ${
                  filter === s
                    ? "bg-surface text-ink shadow-inset-hair"
                    : "text-muted hover:text-ink"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 cursor-pointer"
          >
            <IconRefresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-[10px] font-medium uppercase tracking-wider text-faint">
                <Th>Date</Th>
                <Th>Prospect</Th>
                <Th>Company</Th>
                <Th>Score</Th>
                <Th>Decision</Th>
                <Th>Status</Th>
                <Th className="w-8"></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && runs.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <div className="h-4 rounded bg-border/60 animate-pulse w-full max-w-md" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted text-sm">
                    {runs.length === 0
                      ? "No pipeline runs yet — run one from /pipeline."
                      : "No runs match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <RunRow
                    key={r.id}
                    run={r}
                    open={openId === r.id}
                    onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function RunRow({ run, open, onToggle }: { run: Run; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="text-sm hover:bg-white/[0.015] transition-colors cursor-pointer group"
      >
        <Td className="text-muted font-mono text-[12px]">{fmtRelative(run.created_at)}</Td>
        <Td className="text-ink font-medium">{run.prospect_name ?? "Unknown"}</Td>
        <Td className="text-ink-muted">{run.company ?? "—"}</Td>
        <Td>
          <ScoreBadge score={run.score ?? "unknown"} size="sm" />
        </Td>
        <Td className="text-ink-muted capitalize">{fmtDecision(run.decision)}</Td>
        <Td>
          <StatusPill status={run.status ?? "complete"} approval={run.approval_state} />
        </Td>
        <Td className="text-faint">
          <IconChevron
            className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : "rotate-0 opacity-0 group-hover:opacity-100"}`}
          />
        </Td>
      </tr>
      {open && (
        <tr className="bg-bg/40">
          <td colSpan={7} className="px-5 py-4 border-t border-border">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Detail label="call_id">
                <code className="text-[11px] font-mono text-ink-muted break-all">
                  {run.call_id ?? "—"}
                </code>
              </Detail>
              <Detail label="created_at">
                <code className="text-[11px] font-mono text-ink-muted">
                  {new Date(run.created_at).toLocaleString()}
                </code>
              </Detail>
              <Detail label="approval">
                <span className="text-[12px] capitalize text-ink-muted">
                  {run.approval_state ?? "—"}
                </span>
              </Detail>
              <div className="lg:col-span-3">
                <div className="text-[10px] font-mono uppercase tracking-wider text-faint mb-1">
                  Transcript preview
                </div>
                <pre className="text-[12px] font-mono leading-relaxed text-ink-muted bg-bg/60 border border-border rounded p-3 whitespace-pre-wrap">
                  {run.transcript_preview ?? "(no preview captured)"}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function StatusPill({ status, approval }: { status: string; approval: string | null }) {
  let cls = "border-border text-faint bg-surface";
  let label = status;
  if (approval && approval !== "none") {
    label = approval;
    if (approval === "approved") cls = "border-accent/40 text-accent bg-accent/10";
    else if (approval === "skipped") cls = "border-border text-faint bg-bg";
    else if (approval === "pending") cls = "border-amber-500/40 text-amber-200 bg-amber-500/10";
  } else if (status === "complete") {
    cls = "border-accent/40 text-accent bg-accent/10";
  } else if (status === "error") {
    cls = "border-hot/40 text-hot bg-hot/10";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${cls}`}
    >
      {label}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-faint mb-1">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" className={`px-5 py-2.5 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-5 py-3 align-middle ${className}`}>{children}</td>;
}
