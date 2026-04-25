"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  IconArchive,
  IconCheck,
  IconHourglass,
  IconMail,
  IconRefresh,
  IconSettings,
  IconSparkle,
  IconTelegram,
  IconX,
} from "../lib/icons";

interface EmailPayload {
  to?: string;
  subject?: string;
  content?: string;
  sequence?: number;
  sent_message_id?: string;
}

interface Approval {
  id: string;
  call_id: string;
  status: "pending" | "approved" | "skipped" | "edited";
  email_payload: EmailPayload;
  telegram_message_id: number | null;
  created_at: string;
  updated_at?: string | null;
}

type Filter = "pending" | "approved" | "skipped" | "all";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "skipped", label: "Skipped" },
  { key: "all", label: "All" },
];

export default function ReviewPage() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Approval | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/approvals?status=${filter}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { approvals: [] }))
      .then((d) => setRows(d.approvals ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(load, [load]);

  // Auto-refresh pending tab every 12s — catches Telegram-side approvals.
  useEffect(() => {
    if (filter !== "pending") return;
    const id = setInterval(load, 12_000);
    return () => clearInterval(id);
  }, [filter, load]);

  const setBusyOn = (id: string, on: boolean) =>
    setBusy((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 2800);
  };

  const act = async (a: Approval, action: "approve" | "skip") => {
    setBusyOn(a.id, true);
    try {
      const r = await fetch(`/api/approvals/${a.id}/${action}`, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.detail || `HTTP ${r.status}`);
      showToast(
        "ok",
        action === "approve"
          ? `Sent to ${a.email_payload.to ?? "recipient"}.`
          : "Skipped."
      );
      load();
    } catch (err) {
      showToast("err", (err as Error).message);
    } finally {
      setBusyOn(a.id, false);
    }
  };

  const counts = useMemo(() => {
    // Doesn't reflect server reality across all statuses, just current view.
    const c = { pending: 0, approved: 0, skipped: 0 };
    rows.forEach((r) => {
      if (r.status in c) (c as any)[r.status]++;
    });
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <Header
        filter={filter}
        setFilter={setFilter}
        counts={counts}
        onRefresh={load}
        loading={loading}
      />

      {loading && rows.length === 0 ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              busy={busy.has(a.id)}
              onApprove={() => act(a, "approve")}
              onSkip={() => act(a, "skip")}
              onEdit={() => setEditing(a)}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          approval={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
            showToast("ok", "Draft updated. Tap Approve when ready.");
          }}
          onSavedAndApprove={async (id) => {
            setEditing(null);
            await act({ ...editing, id }, "approve");
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-md border px-3 py-2 text-[12px] font-mono shadow-glow-accent animate-fade-in-up ${
            toast.kind === "ok"
              ? "border-accent/45 bg-bg/95 text-accent"
              : "border-hot/45 bg-bg/95 text-hot"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header({
  filter,
  setFilter,
  counts,
  onRefresh,
  loading,
}: {
  filter: Filter;
  setFilter: (f: Filter) => void;
  counts: { pending: number; approved: number; skipped: number };
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink flex items-center gap-2">
          <IconHourglass className="w-5 h-5 text-amber-300" />
          Human review
        </h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Held emails wait here for your approval. Same flow as Telegram —
          tap Approve, Edit, or Skip. Anything you do here also resolves the
          Telegram prompt.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded transition-colors cursor-pointer ${
                filter === f.key
                  ? "bg-bg text-ink shadow-inset-hair"
                  : "text-muted hover:text-ink"
              }`}
            >
              {f.label}
              {f.key !== "all" &&
                (counts as any)[f.key] > 0 && (
                  <span className="ml-1 text-[10px] font-mono text-faint">
                    {(counts as any)[f.key]}
                  </span>
                )}
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 cursor-pointer"
        >
          <IconRefresh className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
    </div>
  );
}

// ── Approval card ──────────────────────────────────────────────────────

function ApprovalCard({
  approval,
  busy,
  onApprove,
  onEdit,
  onSkip,
}: {
  approval: Approval;
  busy: boolean;
  onApprove: () => void;
  onEdit: () => void;
  onSkip: () => void;
}) {
  const p = approval.email_payload || {};
  const isPending = approval.status === "pending";

  const statusMeta: Record<Approval["status"], { cls: string; label: string }> = {
    pending: { cls: "border-amber-500/45 text-amber-200 bg-amber-500/10", label: "awaiting your approval" },
    approved: { cls: "border-accent/40 text-accent bg-accent/10", label: "approved · sent" },
    skipped: { cls: "border-faint/40 text-faint bg-bg", label: "skipped" },
    edited: { cls: "border-cold/40 text-cold bg-cold/10", label: "edited" },
  };
  const sm = statusMeta[approval.status];

  return (
    <article className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden flex flex-col">
      <header className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-center shrink-0">
            <IconMail className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink truncate">
              {p.subject || "(no subject)"}
            </div>
            <div className="text-[11px] text-muted truncate font-mono">
              → {p.to || "—"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {approval.telegram_message_id ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono text-muted"
              title={`Telegram message id ${approval.telegram_message_id}`}
            >
              <IconTelegram className="w-3 h-3 text-[#26a5e4]" />
              tg:{approval.telegram_message_id}
            </span>
          ) : null}
          <span
            className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${sm.cls}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                approval.status === "pending"
                  ? "bg-amber-300 animate-blink"
                  : approval.status === "approved"
                  ? "bg-accent"
                  : "bg-faint"
              }`}
            />
            {sm.label}
          </span>
        </div>
      </header>

      <div className="px-5 py-3 flex-1 min-h-[120px]">
        {p.content ? (
          <pre className="text-[12px] leading-relaxed text-ink-muted whitespace-pre-wrap font-sans line-clamp-[10] max-h-48 overflow-hidden">
            {p.content}
          </pre>
        ) : (
          <div className="text-[12px] text-faint italic">(no body)</div>
        )}
      </div>

      <footer className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-faint">
          call {approval.call_id?.slice(0, 8) ?? "—"}
          {approval.email_payload?.sent_message_id && (
            <span> · resend {approval.email_payload.sent_message_id.slice(0, 8)}</span>
          )}
        </span>
        {isPending ? (
          <div className="flex items-center gap-2">
            <button
              onClick={onSkip}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-border bg-bg hover:bg-hot/10 hover:border-hot/40 hover:text-hot text-muted disabled:opacity-40 cursor-pointer"
            >
              <IconArchive className="w-3 h-3" />
              Skip
            </button>
            <button
              onClick={onEdit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 cursor-pointer"
            >
              <IconSettings className="w-3 h-3" />
              Edit
            </button>
            <button
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold px-3 py-1 rounded-md border border-accent/45 bg-accent/15 text-accent hover:bg-accent/20 disabled:opacity-40 cursor-pointer shadow-glow-accent"
            >
              <IconCheck className="w-3 h-3" />
              {busy ? "Sending…" : "Approve & send"}
            </button>
          </div>
        ) : (
          <span className="text-[10px] font-mono text-faint">
            {approval.updated_at
              ? `resolved ${new Date(approval.updated_at).toLocaleString()}`
              : null}
          </span>
        )}
      </footer>
    </article>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────

function EditModal({
  approval,
  onCancel,
  onSaved,
  onSavedAndApprove,
}: {
  approval: Approval;
  onCancel: () => void;
  onSaved: () => void;
  onSavedAndApprove: (id: string) => Promise<void>;
}) {
  const p = approval.email_payload || {};
  const [to, setTo] = useState(p.to ?? "");
  const [subject, setSubject] = useState(p.subject ?? "");
  const [content, setContent] = useState(p.content ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (then: "close" | "approve") => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/approvals/${approval.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, content }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.detail || `HTTP ${r.status}`);
      }
      if (then === "approve") {
        await onSavedAndApprove(approval.id);
      } else {
        onSaved();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-6 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-border bg-surface shadow-inset-hair my-8"
      >
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-center">
              <IconMail className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-ink">Edit draft</h3>
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
          <Field label="To" value={to} onChange={setTo} mono />
          <Field label="Subject" value={subject} onChange={setSubject} />
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-faint mb-1">
              Body
            </div>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck
              rows={14}
              className="w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] leading-relaxed text-ink focus:outline-none focus:border-accent/45 scrollbar-thin"
            />
          </div>
          {err && (
            <div className="rounded-md border border-hot/40 bg-hot/5 text-hot text-[11px] px-3 py-2">
              {err}
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => save("close")}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 cursor-pointer"
          >
            Save draft
          </button>
          <button
            onClick={() => save("approve")}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-accent/45 bg-accent/15 text-accent hover:bg-accent/20 disabled:opacity-40 cursor-pointer shadow-glow-accent"
          >
            <IconCheck className="w-3.5 h-3.5" />
            {busy ? "Saving…" : "Save & approve"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
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
        className={`w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent/45 ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

// ── Empty + skeleton ───────────────────────────────────────────────────

function EmptyState({ filter }: { filter: Filter }) {
  const text: Record<Filter, string> = {
    pending: "No pending approvals — all clear. Run a HOT/WARM pipeline to queue one up.",
    approved: "No approved emails yet.",
    skipped: "No skipped emails.",
    all: "No approvals exist yet.",
  };
  return (
    <div className="rounded-xl border border-border bg-surface shadow-inset-hair p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center mb-4 shadow-glow-accent">
        <IconSparkle className="w-6 h-6" />
      </div>
      <div className="text-sm font-semibold text-ink">Nothing to review</div>
      <div className="text-xs text-muted mt-2 max-w-md mx-auto leading-relaxed">
        {text[filter]}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-48 rounded-xl border border-border bg-surface animate-pulse"
        />
      ))}
    </div>
  );
}
