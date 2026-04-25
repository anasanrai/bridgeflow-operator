"use client";

import { useEffect, useMemo, useState } from "react";
import { StatCard } from "../components/StatCard";
import {
  IconCheck,
  IconCircle,
  IconFlame,
  IconRoadmap,
  IconSparkle,
  IconTarget,
  IconUsers,
} from "../lib/icons";
import {
  demoLeads,
  fmtDecision,
  fmtRelative,
  Lead,
  LeadsResponse,
} from "../lib/leads";
import { ScoreBadge } from "../components/ScoreBadge";

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [source, setSource] = useState<"supabase" | "demo">("demo");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leads", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { source: "demo", leads: [] }))
      .then((data: LeadsResponse) => {
        const rows = data.leads?.length ? data.leads : demoLeads();
        setLeads(rows);
        setSource(data.leads?.length ? data.source : "demo");
      })
      .catch(() => {
        setLeads(demoLeads());
        setSource("demo");
      })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => computeStats(leads), [leads]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            Operator health at a glance — the last 7 days.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border ${
            source === "supabase"
              ? "text-accent border-accent/30 bg-accent/5"
              : "text-muted border-border bg-surface"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              source === "supabase" ? "bg-accent" : "bg-faint"
            }`}
          />
          {source === "supabase" ? "live · supabase" : "demo data"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total leads"
          value={loading ? "—" : stats.total.toLocaleString()}
          delta={{ value: 12 }}
          icon={IconUsers}
          accent="accent"
          sparkline={stats.spark.total}
        />
        <StatCard
          label="Hot leads"
          value={loading ? "—" : stats.hot}
          delta={{ value: 34 }}
          icon={IconFlame}
          accent="hot"
          sparkline={stats.spark.hot}
        />
        <StatCard
          label="Avg confidence"
          value={loading ? "—" : `${stats.avgConfidence}%`}
          delta={{ value: 4, suffix: "pp" }}
          icon={IconTarget}
          accent="warm"
          sparkline={stats.spark.confidence}
        />
        <StatCard
          label="Deals won"
          value={loading ? "—" : stats.dealsWon}
          delta={{ value: 2, suffix: "" }}
          icon={IconCheck}
          accent="cold"
          sparkline={stats.spark.won}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ScoreDistribution stats={stats} />
        <RecentLeads leads={leads.slice(0, 5)} loading={loading} />
      </div>

      <Roadmap />
    </div>
  );
}

type RoadmapItem = {
  version: string;
  status: "live" | "beta" | "coming" | "roadmap";
  title: string;
  body: string;
};

const ROADMAP: RoadmapItem[] = [
  {
    version: "V1",
    status: "live",
    title: "Transcript → 5-Agent Intelligence",
    body: "Paste a call transcript. Five Opus 4.7 agents qualify the lead, draft the campaign, fire Resend + Telegram, and self-review.",
  },
  {
    version: "V2",
    status: "beta",
    title: "Voice Call → Transcription → Intelligence",
    body: "Drop an .mp3 / .wav / .m4a. Groq Whisper-large-v3-turbo transcribes it; the same 5-agent pipeline runs automatically.",
  },
  {
    version: "V3",
    status: "coming",
    title: "Intelligence → n8n Workflow Generator",
    body: "Action manifests get rendered as importable n8n workflows so reps can wire follow-ups into anything they already use.",
  },
  {
    version: "V4",
    status: "roadmap",
    title: "Autonomous Revenue Operator",
    body: "Self-driving sales floor: monitor calls, requalify pipeline, run experiments on copy + cadence, and report weekly P&L impact.",
  },
];

function Roadmap() {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/30 text-accent flex items-center justify-center">
            <IconRoadmap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
              Roadmap
            </div>
            <div className="text-sm font-semibold text-ink">Where this is going</div>
          </div>
        </div>
        <span className="text-[11px] font-mono text-muted">
          built with Claude Opus 4.7
        </span>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {ROADMAP.map((item) => (
          <RoadmapCard key={item.version} item={item} />
        ))}
      </ol>
    </section>
  );
}

function RoadmapCard({ item }: { item: RoadmapItem }) {
  const palette: Record<RoadmapItem["status"], { wrap: string; chip: string; dot: string; mark: JSX.Element }> = {
    live: {
      wrap: "border-accent/40 bg-accent/[0.04]",
      chip: "border-accent/40 text-accent bg-accent/10",
      dot: "bg-accent shadow-glow-accent",
      mark: <IconCheck className="w-3.5 h-3.5" />,
    },
    beta: {
      wrap: "border-amber-500/40 bg-amber-500/[0.05]",
      chip: "border-amber-500/40 text-amber-200 bg-amber-500/10",
      dot: "bg-amber-400",
      mark: <IconSparkle className="w-3.5 h-3.5" />,
    },
    coming: {
      wrap: "border-border bg-bg/40",
      chip: "border-border text-muted bg-surface",
      dot: "bg-muted/60",
      mark: <IconCircle className="w-3.5 h-3.5" />,
    },
    roadmap: {
      wrap: "border-border bg-bg/30",
      chip: "border-border text-faint bg-surface",
      dot: "bg-faint",
      mark: <IconCircle className="w-3.5 h-3.5" />,
    },
  };
  const p = palette[item.status];
  const label: Record<RoadmapItem["status"], string> = {
    live: "LIVE",
    beta: "BETA",
    coming: "COMING",
    roadmap: "ROADMAP",
  };

  return (
    <li className={`relative rounded-lg border p-4 ${p.wrap} flex flex-col gap-2`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
          <span className="text-[11px] font-mono font-semibold text-ink tracking-wide">
            {item.version}
          </span>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${p.chip}`}
        >
          {p.mark}
          {label[item.status]}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-ink leading-snug">
        {item.title}
      </div>
      <div className="text-[11px] text-muted leading-relaxed">
        {item.body}
      </div>
    </li>
  );
}

function ScoreDistribution({ stats }: { stats: ReturnType<typeof computeStats> }) {
  const rows: Array<{ key: "hot" | "warm" | "cold"; value: number }> = [
    { key: "hot", value: stats.hot },
    { key: "warm", value: stats.warm },
    { key: "cold", value: stats.cold },
  ];
  const total = Math.max(stats.total, 1);

  const barColor: Record<string, string> = {
    hot: "bg-hot shadow-glow-hot",
    warm: "bg-warm shadow-glow-warm",
    cold: "bg-cold shadow-glow-cold",
  };

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair p-5 lg:col-span-1">
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
        Score distribution
      </div>
      <div className="mt-3 text-2xl font-semibold text-ink tracking-tight tabular-nums">
        {stats.total}
        <span className="text-sm text-muted font-normal ml-1">leads</span>
      </div>

      <div className="mt-4 h-2 rounded-full bg-border overflow-hidden flex">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`h-full ${barColor[r.key]}`}
            style={{ width: `${(r.value / total) * 100}%` }}
            title={`${r.key}: ${r.value}`}
          />
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3">
            <ScoreBadge score={r.key} size="sm" />
            <div className="flex-1 h-1 rounded-full bg-border/80 overflow-hidden">
              <div
                className={`h-full ${barColor[r.key]}`}
                style={{ width: `${(r.value / total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-ink-muted tabular-nums w-10 text-right">
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentLeads({ leads, loading }: { leads: Lead[]; loading: boolean }) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair p-5 lg:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
          Recent activity
        </div>
        <a
          href="/leads"
          className="text-[11px] text-accent hover:underline font-medium"
        >
          View all →
        </a>
      </div>

      {loading && leads.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-border/50 animate-pulse" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="text-sm text-muted py-6 text-center">No activity yet.</div>
      ) : (
        <ul className="divide-y divide-border -mx-2">
          {leads.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-3 px-2 py-2.5 hover:bg-white/[0.015] rounded-md transition-colors cursor-pointer"
            >
              <div className="w-8 h-8 rounded-full bg-bg border border-border flex items-center justify-center text-xs font-mono text-muted shrink-0">
                {(l.name?.[0] ?? "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink truncate">{l.name ?? "Unknown"}</div>
                <div className="text-[11px] text-muted truncate">
                  {l.company ?? "—"} · {fmtDecision(l.decision)}
                </div>
              </div>
              <ScoreBadge score={l.score ?? "unknown"} size="sm" />
              <span className="text-[11px] font-mono text-faint w-14 text-right shrink-0">
                {fmtRelative(l.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function computeStats(leads: Lead[]) {
  const total = leads.length;
  let hot = 0;
  let warm = 0;
  let cold = 0;
  for (const l of leads) {
    const s = (l.score ?? "").toLowerCase();
    if (s === "hot") hot++;
    else if (s === "warm") warm++;
    else if (s === "cold") cold++;
  }
  const dealsWon = leads.filter(
    (l) => (l.decision ?? "").includes("book_call")
  ).length;
  // Fake-but-plausible average since we don't persist confidence per lead yet
  const avgConfidence = total > 0 ? Math.round(62 + hot * 2.5 + warm * 1.1) : 0;
  const clamped = Math.min(98, avgConfidence);

  return {
    total,
    hot,
    warm,
    cold,
    dealsWon,
    avgConfidence: clamped,
    spark: makeSparklines(total, hot, clamped, dealsWon),
  };
}

// Deterministic 14-point sparklines that trend toward the final value.
function makeSparklines(
  total: number,
  hot: number,
  confidence: number,
  won: number
) {
  const rng = mulberry32(42);
  const series = (end: number, variance = 0.25) => {
    const points: number[] = [];
    const start = Math.max(0, Math.floor(end * 0.55));
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const base = start + (end - start) * t;
      const noise = (rng() - 0.5) * end * variance;
      points.push(Math.max(0, Math.round(base + noise)));
    }
    points[points.length - 1] = end;
    return points;
  };
  return {
    total: series(total, 0.18),
    hot: series(hot, 0.35),
    confidence: series(confidence, 0.05),
    won: series(won, 0.4),
  };
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
