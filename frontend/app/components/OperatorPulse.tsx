"use client";

/**
 * Live operator pulse — a real-time activity panel for the dashboard.
 *
 * Visual concept inspired by the live-sales-dashboard component the user
 * shared: live indicator dot, 4 metric cards, dual-line chart, recent
 * activity feed. Adapted to BridgeFlow's actual domain (pipeline runs +
 * lead scores) and our existing token system instead of dropping in
 * shadcn primitives — keeps one design system across the dashboard.
 *
 * Data: polls /api/history every 6s, derives windowed metrics + a
 * per-bucket time series for the last hour at 5-min granularity.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  IconActivity,
  IconChevron,
  IconClock,
  IconFlame,
  IconRefresh,
  IconTarget,
  IconUsers,
} from "../lib/icons";
import { ScoreBadge } from "./ScoreBadge";
import { fmtDecision, fmtRelative } from "../lib/leads";

interface PipelineRun {
  id: string;
  call_id: string | null;
  prospect_name: string | null;
  company: string | null;
  score: string | null;
  decision: string | null;
  status: string | null;
  approval_state: string | null;
  created_at: string;
}

interface HistoryResponse {
  runs: PipelineRun[];
  source: "supabase" | "demo";
}

const POLL_MS = 6_000;
const WINDOW_MIN = 60; // last 60 minutes for the chart
const BUCKET_MIN = 5;  // 5-minute buckets → 12 points

export function OperatorPulse() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [source, setSource] = useState<"supabase" | "demo">("supabase");
  const [loading, setLoading] = useState(true);
  const [lastTickAt, setLastTickAt] = useState<number | null>(null);

  useEffect(() => {
    let abort = false;
    const tick = () =>
      fetch("/api/history?limit=200", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { runs: [], source: "demo" }))
        .then((d: HistoryResponse) => {
          if (abort) return;
          setRuns(d.runs ?? []);
          setSource(d.source ?? "supabase");
          setLastTickAt(Date.now());
          setLoading(false);
        })
        .catch(() => {
          if (abort) return;
          setLoading(false);
        });
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      abort = true;
      clearInterval(id);
    };
  }, []);

  const metrics = useMemo(() => deriveMetrics(runs), [runs]);
  const chartData = useMemo(() => deriveTimeSeries(runs), [runs]);
  const recent = runs.slice(0, 8);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
      <PulseHeader source={source} runs={runs.length} lastTickAt={lastTickAt} loading={loading} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
        <Metric
          label="Runs · 24h"
          value={loading ? "—" : metrics.runs24h.toLocaleString()}
          icon={<IconActivity className="w-3.5 h-3.5" />}
          accent="accent"
          hint={`${metrics.runs1h} in last hour`}
        />
        <Metric
          label="HOT leads"
          value={loading ? "—" : metrics.hot.toLocaleString()}
          icon={<IconFlame className="w-3.5 h-3.5" />}
          accent="hot"
          hint={`${metrics.hotPct}% of all runs`}
        />
        <Metric
          label="Conversion"
          value={loading ? "—" : `${metrics.convRate}%`}
          icon={<IconTarget className="w-3.5 h-3.5" />}
          accent="warm"
          hint="HOT + WARM ÷ total"
        />
        <Metric
          label="Awaiting approval"
          value={loading ? "—" : metrics.pendingApproval.toLocaleString()}
          icon={<IconClock className="w-3.5 h-3.5" />}
          accent="cold"
          hint={metrics.pendingApproval > 0 ? "Held emails in queue" : "All caught up"}
          pulse={metrics.pendingApproval > 0}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-px bg-border">
        <div className="xl:col-span-3 bg-surface p-5">
          <ChartHeader
            title="Pipeline activity · last hour"
            sub="5-minute buckets · runs vs HOT leads"
          />
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 6, right: 8, left: -10, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.06)"
                />
                <XAxis
                  dataKey="t"
                  stroke="#8a8c94"
                  fontSize={10}
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#8a8c94"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#161618",
                    border: "1px solid #222225",
                    borderRadius: 6,
                    fontSize: 12,
                    boxShadow: "0 8px 20px -4px rgba(0,0,0,0.5)",
                  }}
                  itemStyle={{ color: "#f5f5f5", padding: "1px 0" }}
                  labelStyle={{ color: "#8a8c94", fontFamily: "ui-monospace" }}
                  cursor={{ stroke: "rgba(0,212,170,0.35)", strokeWidth: 1 }}
                />
                <Legend
                  iconType="line"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 11, color: "#a1a1a6", paddingTop: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="runs"
                  name="Runs"
                  stroke="#00d4aa"
                  strokeWidth={1.8}
                  dot={false}
                  activeDot={{ r: 3, fill: "#00d4aa", stroke: "#0f0f10", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="hot"
                  name="HOT"
                  stroke="#ef4444"
                  strokeWidth={1.6}
                  dot={false}
                  activeDot={{ r: 3, fill: "#ef4444", stroke: "#0f0f10", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-2 bg-surface flex flex-col">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <ChartHeader title="Latest runs" sub={`${recent.length} most recent`} compact />
            <a
              href="/history"
              className="text-[11px] text-accent hover:underline font-medium inline-flex items-center gap-1"
            >
              View all <IconChevron className="w-3 h-3" />
            </a>
          </div>
          <ul className="flex-1 max-h-[260px] overflow-y-auto scrollbar-thin divide-y divide-border">
            {loading && recent.length === 0
              ? Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="px-5 py-3">
                    <div className="h-4 rounded bg-border/60 animate-pulse" />
                  </li>
                ))
              : recent.length === 0
              ? (
                <li className="px-5 py-8 text-center text-[12px] text-muted">
                  No pipeline runs yet — kick one off from{" "}
                  <a href="/pipeline" className="text-accent hover:underline">
                    /pipeline
                  </a>
                  .
                </li>
              )
              : recent.map((r) => <RunRow key={r.id} run={r} />)}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function PulseHeader({
  source,
  runs,
  lastTickAt,
  loading,
}: {
  source: "supabase" | "demo";
  runs: number;
  lastTickAt: number | null;
  loading: boolean;
}) {
  const [tick, setTick] = useState(0);
  // Force a 5s re-render so "last tick 4s ago" stays fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const ago = lastTickAt ? Math.max(0, Math.round((Date.now() - lastTickAt) / 1000)) : null;
  const live = source === "supabase" && runs > 0;

  return (
    <header className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`relative inline-flex items-center justify-center w-9 h-9 rounded-lg border ${
            live
              ? "bg-accent/10 border-accent/40 text-accent shadow-glow-accent"
              : "bg-surface border-border text-muted"
          }`}
        >
          <IconActivity className="w-4 h-4" />
          {live && (
            <span className="absolute top-1 right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-70" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-ink">Operator pulse</h2>
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                live
                  ? "border-accent/40 text-accent bg-accent/10"
                  : "border-border text-muted bg-surface"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  live ? "bg-accent shadow-glow-accent animate-blink" : "bg-faint"
                }`}
              />
              {live ? "live" : runs > 0 ? "demo data" : loading ? "loading…" : "no data"}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Real-time view of pipeline runs + lead conversion. Polls every {POLL_MS / 1000}s.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] font-mono text-faint">
        {ago !== null && (
          <span className="inline-flex items-center gap-1.5">
            <IconRefresh className={`w-3 h-3 ${ago < 1 ? "animate-spin" : ""}`} />
            tick {ago}s ago
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <IconUsers className="w-3 h-3" />
          {runs} run{runs === 1 ? "" : "s"} · 7d
        </span>
      </div>
    </header>
  );
}

// ── Metric card (dense row variant for the strip under the header) ─────

function Metric({
  label,
  value,
  icon,
  accent,
  hint,
  pulse,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "accent" | "hot" | "warm" | "cold";
  hint?: string;
  pulse?: boolean;
}) {
  const tone = {
    accent: "text-accent",
    hot: "text-hot",
    warm: "text-warm",
    cold: "text-cold",
  }[accent];
  return (
    <div className="bg-surface px-5 py-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
          {label}
        </span>
        <span className={`${tone} ${pulse ? "animate-blink" : ""}`}>{icon}</span>
      </div>
      <div className="text-2xl font-semibold text-ink tabular-nums tracking-tight leading-none">
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-muted leading-tight">{hint}</div>
      )}
    </div>
  );
}

// ── Chart header ───────────────────────────────────────────────────────

function ChartHeader({
  title,
  sub,
  compact,
}: {
  title: string;
  sub?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : ""}>
      <div className="text-sm font-semibold text-ink leading-tight">{title}</div>
      {sub && (
        <div className="text-[11px] text-muted leading-tight mt-0.5">{sub}</div>
      )}
    </div>
  );
}

// ── Recent run row ─────────────────────────────────────────────────────

function RunRow({ run }: { run: PipelineRun }) {
  return (
    <li className="px-5 py-2.5 hover:bg-white/[0.015] transition-colors">
      <div className="flex items-center gap-2.5 min-w-0">
        <ScoreBadge score={run.score ?? "unknown"} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink truncate">
            {run.prospect_name ?? "Unknown"}
          </div>
          <div className="text-[11px] text-muted truncate">
            {run.company ?? "—"} · {fmtDecision(run.decision)}
          </div>
        </div>
        <span className="text-[10px] font-mono text-faint shrink-0">
          {fmtRelative(run.created_at)}
        </span>
      </div>
    </li>
  );
}

// ── Data derivation ────────────────────────────────────────────────────

function deriveMetrics(runs: PipelineRun[]) {
  const now = Date.now();
  const day = now - 24 * 3600_000;
  const hour = now - 3600_000;

  let runs24h = 0;
  let runs1h = 0;
  let hot = 0;
  let warm = 0;
  let cold = 0;
  let pendingApproval = 0;

  for (const r of runs) {
    const t = new Date(r.created_at).getTime();
    if (t >= day) runs24h += 1;
    if (t >= hour) runs1h += 1;
    const score = (r.score ?? "").toLowerCase();
    if (score === "hot") hot += 1;
    else if (score === "warm") warm += 1;
    else if (score === "cold") cold += 1;
    if (r.approval_state === "pending") pendingApproval += 1;
  }

  const total = Math.max(1, runs.length);
  const hotPct = Math.round((hot / total) * 100);
  const convRate = Math.round(((hot + warm) / total) * 100);

  return { runs24h, runs1h, hot, warm, cold, hotPct, convRate, pendingApproval };
}

function deriveTimeSeries(runs: PipelineRun[]) {
  const now = new Date();
  // Snap "now" to the next bucket boundary so the rightmost label always
  // reads as a clean :00 / :05 / :10.
  const buckets: Array<{ start: number; end: number; label: string }> = [];
  const ms = BUCKET_MIN * 60_000;
  const end = Math.floor(now.getTime() / ms) * ms + ms;
  for (let i = WINDOW_MIN / BUCKET_MIN - 1; i >= 0; i--) {
    const e = end - i * ms;
    const s = e - ms;
    buckets.push({ start: s, end: e, label: fmtBucket(new Date(e - ms)) });
  }

  return buckets.map((b) => {
    let runsCount = 0;
    let hotCount = 0;
    for (const r of runs) {
      const t = new Date(r.created_at).getTime();
      if (t >= b.start && t < b.end) {
        runsCount += 1;
        if ((r.score ?? "").toLowerCase() === "hot") hotCount += 1;
      }
    }
    return { t: b.label, runs: runsCount, hot: hotCount };
  });
}

function fmtBucket(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
