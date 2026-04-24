"use client";

import { useEffect, useMemo, useState } from "react";
import { IconChevron, IconRefresh, IconSearch } from "../lib/icons";
import {
  demoLeads,
  fmtDecision,
  fmtRelative,
  Lead,
  LeadsResponse,
} from "../lib/leads";
import { ScoreBadge } from "./ScoreBadge";

const SCORES = ["all", "hot", "warm", "cold"] as const;
type ScoreFilter = (typeof SCORES)[number];

export function LeadsTable() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [source, setSource] = useState<"supabase" | "demo">("demo");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ScoreFilter>("all");

  const load = () => {
    setLoading(true);
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
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter !== "all" && (l.score ?? "").toLowerCase() !== filter) return false;
      if (!q) return true;
      return (
        (l.name ?? "").toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        (l.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, query, filter]);

  const counts = useMemo(() => {
    const c = { all: leads.length, hot: 0, warm: 0, cold: 0 };
    for (const l of leads) {
      const s = (l.score ?? "").toLowerCase();
      if (s === "hot" || s === "warm" || s === "cold") c[s]++;
    }
    return c;
  }, [leads]);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px]">
          <div className="relative">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, or email…"
              className="w-full pl-9 pr-3 py-2 rounded-md bg-bg border border-border text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-border bg-bg p-1">
          {SCORES.map((s) => {
            const active = filter === s;
            const count = counts[s];
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`text-xs px-2.5 py-1 rounded capitalize transition-colors cursor-pointer ${
                  active
                    ? "bg-surface text-ink shadow-inset-hair"
                    : "text-muted hover:text-ink"
                }`}
              >
                {s} <span className="font-mono text-faint ml-0.5">{count}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={load}
          disabled={loading}
          title="Refresh"
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
        >
          <IconRefresh
            className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-[10px] font-medium uppercase tracking-wider text-faint">
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Score</Th>
              <Th>Decision</Th>
              <Th className="text-right">Est. value</Th>
              <Th className="text-right">Date</Th>
              <Th className="w-8"></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && leads.length === 0 ? (
              <SkeletonRows />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted text-sm">
                  No leads match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((lead) => <Row key={lead.id} lead={lead} />)
            )}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-[11px] font-mono">
        <span className="text-muted">
          Showing <span className="text-ink">{filtered.length}</span>
          {filtered.length !== leads.length && (
            <span className="text-faint"> of {leads.length}</span>
          )}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border ${
            source === "supabase"
              ? "text-accent border-accent/30 bg-accent/5"
              : "text-muted border-border bg-bg"
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
    </section>
  );
}

function Row({ lead }: { lead: Lead }) {
  return (
    <tr className="text-sm hover:bg-white/[0.015] transition-colors cursor-pointer group">
      <Td>
        <div className="text-ink font-medium">{lead.name || "Unknown"}</div>
        <div className="text-[11px] text-muted truncate">{lead.email || "—"}</div>
      </Td>
      <Td className="text-ink-muted">{lead.company || "—"}</Td>
      <Td>
        <ScoreBadge score={lead.score ?? "unknown"} size="sm" />
      </Td>
      <Td className="text-ink-muted capitalize">{fmtDecision(lead.decision)}</Td>
      <Td className="text-right text-ink font-mono">
        {lead.estimated_deal_value ?? "—"}
      </Td>
      <Td className="text-right text-muted font-mono">
        {fmtRelative(lead.created_at)}
      </Td>
      <Td className="text-faint">
        <IconChevron className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </Td>
    </tr>
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
    <th
      scope="col"
      className={`px-5 py-2.5 text-left font-medium ${className}`}
    >
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

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={7} className="px-5 py-3">
            <div className="h-4 rounded bg-border/60 animate-pulse w-full max-w-md" />
          </td>
        </tr>
      ))}
    </>
  );
}
