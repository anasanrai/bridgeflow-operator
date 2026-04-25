"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconArchive,
  IconChevron,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconX,
} from "../lib/icons";
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
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const load = () => {
    setLoading(true);
    const qs = showArchived ? "?include_archived=1" : "";
    fetch(`/api/leads${qs}`, { cache: "no-store" })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter !== "all" && (l.score ?? "").toLowerCase() !== filter) return false;
      if (!q) return true;
      return (
        (l.name ?? "").toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        (l.email ?? "").toLowerCase().includes(q) ||
        (l.phone ?? "").toLowerCase().includes(q)
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

  const onSave = async (id: string, fields: Partial<Lead>) => {
    if (source !== "supabase") {
      // demo mode: mutate locally
      setLeads((rows) => rows.map((r) => (r.id === id ? { ...r, ...fields } : r)));
      setEditing(null);
      return;
    }
    try {
      const r = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!r.ok) throw new Error(await r.text());
      load();
      setEditing(null);
    } catch (err) {
      alert("Save failed: " + (err as Error).message);
    }
  };

  const onArchive = async (id: string) => {
    if (source !== "supabase") {
      setLeads((rows) =>
        rows.map((r) => (r.id === id ? { ...r, status: "archived" } : r))
      );
      return;
    }
    try {
      const r = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      load();
    } catch (err) {
      alert("Archive failed: " + (err as Error).message);
    }
  };

  return (
    <>
      <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, company, email, or phone…"
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

          <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-accent"
            />
            Show archived
          </label>

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
                <Th>Phone</Th>
                <Th>Score</Th>
                <Th>Decision</Th>
                <Th className="text-right">Date</Th>
                <Th className="text-right w-32">Actions</Th>
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
                filtered.map((lead) => (
                  <Row
                    key={lead.id}
                    lead={lead}
                    onEdit={() => setEditing(lead)}
                    onArchive={() => onArchive(lead.id)}
                  />
                ))
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
            {showArchived && (
              <span className="text-faint"> · including archived</span>
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

      {editing && (
        <EditModal
          lead={editing}
          onCancel={() => setEditing(null)}
          onSave={(fields) => onSave(editing.id, fields)}
        />
      )}
    </>
  );
}

function Row({
  lead,
  onEdit,
  onArchive,
}: {
  lead: Lead;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const archived = (lead.status ?? "").toLowerCase() === "archived";
  return (
    <tr
      className={`text-sm transition-colors group ${
        archived ? "opacity-60" : "hover:bg-white/[0.015]"
      }`}
    >
      <Td>
        <div className="flex items-center gap-1.5">
          <div className="text-ink font-medium">{lead.name || "Unknown"}</div>
          {archived && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border border-border text-faint bg-bg">
              archived
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted truncate">{lead.email || "—"}</div>
      </Td>
      <Td className="text-ink-muted">{lead.company || "—"}</Td>
      <Td className="text-ink-muted font-mono text-[12px]">{lead.phone || "—"}</Td>
      <Td>
        <ScoreBadge score={lead.score ?? "unknown"} size="sm" />
      </Td>
      <Td className="text-ink-muted capitalize">{fmtDecision(lead.decision)}</Td>
      <Td className="text-right text-muted font-mono">
        {fmtRelative(lead.created_at)}
      </Td>
      <Td className="text-right">
        <div className="inline-flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            title="Edit"
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-bg hover:bg-surface-2 text-muted hover:text-ink cursor-pointer"
          >
            edit
          </button>
          {!archived && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Archive "${lead.name || "this lead"}"?`)) onArchive();
              }}
              title="Archive"
              className="inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-bg hover:bg-hot/10 hover:border-hot/40 hover:text-hot text-muted cursor-pointer"
            >
              <IconArchive className="w-3 h-3" />
            </button>
          )}
        </div>
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

// ── Edit modal ──────────────────────────────────────────────────────────

function EditModal({
  lead,
  onCancel,
  onSave,
}: {
  lead: Lead;
  onCancel: () => void;
  onSave: (fields: Partial<Lead>) => void;
}) {
  const [draft, setDraft] = useState<Lead>(lead);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-border bg-surface shadow-inset-hair"
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-bg border border-border text-ink-muted flex items-center justify-center">
              <IconSettings className="w-3.5 h-3.5" />
            </div>
            <h3 className="text-sm font-semibold text-ink">Edit lead</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-muted hover:text-ink p-1 -mr-1 cursor-pointer"
            aria-label="Close"
          >
            <IconX className="w-4 h-4" />
          </button>
        </header>
        <div className="p-5 space-y-3">
          <ModalField label="Name" value={draft.name ?? ""} onChange={(v) => setDraft({ ...draft, name: v })} />
          <ModalField label="Company" value={draft.company ?? ""} onChange={(v) => setDraft({ ...draft, company: v })} />
          <ModalField label="Email" value={draft.email ?? ""} onChange={(v) => setDraft({ ...draft, email: v })} />
          <ModalField label="Phone" value={draft.phone ?? ""} onChange={(v) => setDraft({ ...draft, phone: v })} mono />
          <ModalSelect
            label="Score"
            value={(draft.score ?? "") as string}
            onChange={(v) => setDraft({ ...draft, score: v })}
            options={["hot", "warm", "cold", "unknown"]}
          />
        </div>
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSave({
                name: draft.name,
                company: draft.company,
                email: draft.email,
                phone: draft.phone,
                score: draft.score,
              })
            }
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-accent text-bg hover:bg-accent/90 cursor-pointer shadow-glow-accent"
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint mb-1">
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent/45 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

function ModalSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint mb-1">
        {label}
      </div>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent/45 capitalize"
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o} value={o} className="capitalize">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

// silence unused-import lint (IconChevron is referenced indirectly elsewhere)
void IconChevron;
