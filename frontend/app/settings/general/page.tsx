"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconArchive,
  IconCheck,
  IconDownload,
  IconFlame,
  IconLock,
  IconRefresh,
  IconSettings,
  IconTarget,
  IconTelegram,
} from "../../lib/icons";
import { Lead } from "../../lib/leads";

const STORAGE_KEY = "bridgeflow.settings.v1";

interface Settings {
  hot_threshold: number;          // confidence cutoff for HOT
  warm_threshold: number;         // confidence cutoff for WARM
  auto_approve_hot: boolean;
  approval_timeout_hours: number;
  notify_hot: boolean;
  notify_warm: boolean;
  daily_digest: boolean;          // V3
}

const DEFAULTS: Settings = {
  hot_threshold: 80,
  warm_threshold: 55,
  auto_approve_hot: false,
  approval_timeout_hours: 24,
  notify_hot: true,
  notify_warm: false,
  daily_digest: false,
};

export default function GeneralSettingsPage() {
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // ignore
    }
  }, [s, hydrated]);

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6 max-w-4xl">
      <Header />

      <PipelineSettingsCard s={s} update={update} />
      <NotificationsCard s={s} update={update} />
      <DataPrivacyCard />
      <DangerZoneCard />
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink flex items-center gap-2">
        <IconSettings className="w-5 h-5 text-accent" />
        Settings
      </h1>
      <p className="text-sm text-muted mt-1 max-w-2xl">
        Pipeline behaviour, notification preferences, and data ops. Settings
        save to local storage in V2 — V3 promotes them to the
        <code className="text-[12px] font-mono text-ink-muted ml-1 px-1 rounded border border-border bg-surface">
          company_profiles
        </code>{" "}
        row so they sync across devices.
      </p>
    </div>
  );
}

// ── Pipeline thresholds ─────────────────────────────────────────────────

function PipelineSettingsCard({
  s,
  update,
}: {
  s: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}) {
  return (
    <Section title="Pipeline" icon={<IconTarget className="w-4 h-4" />}>
      <Slider
        label="HOT threshold"
        sub="Confidence ≥ this is scored HOT."
        value={s.hot_threshold}
        min={50}
        max={99}
        unit="%"
        onChange={(v) => {
          update("hot_threshold", v);
          if (s.warm_threshold > v - 5) update("warm_threshold", Math.max(20, v - 10));
        }}
        accent="hot"
      />
      <Slider
        label="WARM threshold"
        sub="Confidence between WARM and HOT."
        value={s.warm_threshold}
        min={20}
        max={s.hot_threshold - 1}
        unit="%"
        onChange={(v) => update("warm_threshold", v)}
        accent="warm"
      />
      <Toggle
        label="Auto-approve emails for HOT leads"
        sub="Skips Telegram approval for HOT score. Off by default — keeps the human in the loop."
        value={s.auto_approve_hot}
        onChange={(v) => update("auto_approve_hot", v)}
      />
      <Slider
        label="Approval timeout"
        sub="Held emails auto-archive after this many hours without an APPROVE/EDIT/SKIP reply."
        value={s.approval_timeout_hours}
        min={1}
        max={168}
        unit="h"
        onChange={(v) => update("approval_timeout_hours", v)}
        accent="cold"
      />
    </Section>
  );
}

// ── Notifications ───────────────────────────────────────────────────────

function NotificationsCard({
  s,
  update,
}: {
  s: Settings;
  update: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}) {
  return (
    <Section title="Notifications" icon={<IconTelegram className="w-4 h-4" />}>
      <Toggle
        label="Notify on HOT leads"
        sub="Telegram alert when Agent 2 returns score=HOT."
        value={s.notify_hot}
        onChange={(v) => update("notify_hot", v)}
      />
      <Toggle
        label="Notify on WARM leads"
        sub="Quiet by default — flip on if your reps want all leads pinged."
        value={s.notify_warm}
        onChange={(v) => update("notify_warm", v)}
      />
      <Toggle
        label="Daily digest"
        sub="One Telegram message at 9am with yesterday's runs + today's queued."
        value={s.daily_digest}
        onChange={(v) => update("daily_digest", v)}
        v3
      />
    </Section>
  );
}

// ── Data & Privacy ──────────────────────────────────────────────────────

function DataPrivacyCard() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leads?limit=999&include_archived=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { leads: [] }))
      .then((d) => setCount((d.leads ?? []).length))
      .catch(() => setCount(null));
  }, []);

  const exportCsv = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/leads?limit=999&include_archived=1", { cache: "no-store" });
      const data = await r.json();
      const leads: Lead[] = data?.leads ?? [];
      const csv = leadsToCsv(leads);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.href = url;
      a.download = `bridgeflow-leads-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`Exported ${leads.length} leads.`);
    } catch (err) {
      setMsg("Export failed: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Data & privacy" icon={<IconDownload className="w-4 h-4" />}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ActionCard
          title="Export all leads"
          sub={`CSV of every lead (${count ?? "—"} rows including archived).`}
          buttonLabel={busy ? "Exporting…" : "Export CSV"}
          onClick={exportCsv}
          disabled={busy}
        />
        <ActionCard
          title="Clear all test data"
          sub="DELETE pipeline_runs / pending_approvals / actions / analyses / leads / calls. Wipes the hackathon demo state."
          buttonLabel="Clear"
          onClick={() => alert("Wiring DELETE endpoints in V3 — paste this SQL in Supabase for now:\n\ntruncate table pipeline_runs, pending_approvals, actions, analyses, leads, calls cascade;")}
          subtle
          v3Badge
        />
      </div>
      {msg && (
        <div className="mt-1 text-[11px] text-ink-muted">
          {msg}
        </div>
      )}
    </Section>
  );
}

function leadsToCsv(rows: Lead[]): string {
  const cols = [
    "id",
    "call_id",
    "name",
    "company",
    "email",
    "phone",
    "score",
    "decision",
    "estimated_deal_value",
    "created_at",
  ] as const;
  const head = cols.join(",");
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => cols.map((c) => escape((r as any)[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

// ── Danger zone ─────────────────────────────────────────────────────────

function DangerZoneCard() {
  return (
    <section className="rounded-xl border border-hot/35 bg-hot/[0.04] overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-hot/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-hot/15 border border-hot/40 text-hot flex items-center justify-center">
            <IconArchive className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-sm font-semibold text-ink">Danger zone</h2>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-hot/40 text-hot bg-hot/10">
          irreversible
        </span>
      </header>
      <div className="p-5">
        <ActionCard
          title="Reset pipeline state"
          sub="Stops any running streams, clears local pipeline cache, and reloads /pipeline. Does not touch Supabase data."
          buttonLabel="Reset"
          onClick={() => {
            try {
              localStorage.removeItem("bridgeflow.last_pipeline");
            } catch {}
            window.location.href = "/pipeline";
          }}
          danger
        />
      </div>
    </section>
  );
}

// ── Primitives ──────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-bg border border-border text-ink-muted flex items-center justify-center">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </header>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  );
}

function Slider({
  label,
  sub,
  value,
  min,
  max,
  unit,
  onChange,
  accent,
}: {
  label: string;
  sub: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
  accent?: "hot" | "warm" | "cold" | "accent";
}) {
  const accentCls: Record<string, string> = {
    hot: "accent-hot",
    warm: "accent-warm",
    cold: "accent-cold",
    accent: "accent-accent",
  };
  const a = accent || "accent";
  const accentColor = useMemo(() => {
    return a === "hot" ? "#ef4444" : a === "warm" ? "#f59e0b" : a === "cold" ? "#3b82f6" : "#00d4aa";
  }, [a]);

  return (
    <div className="rounded-lg border border-border bg-bg/40 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink">{label}</div>
          <div className="text-[11px] text-muted leading-relaxed">{sub}</div>
        </div>
        <div className="text-[13px] font-mono tabular-nums text-ink">
          {value}
          <span className="text-faint ml-0.5">{unit ?? ""}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`mt-3 w-full ${accentCls[a]}`}
        style={{ accentColor }}
      />
    </div>
  );
}

function Toggle({
  label,
  sub,
  value,
  onChange,
  v3,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
  v3?: boolean;
}) {
  const disabled = !!v3;
  const effective = v3 ? false : value;
  return (
    <label className="rounded-lg border border-border bg-bg/40 p-3 flex items-start gap-3 cursor-pointer">
      <button
        role="switch"
        aria-checked={effective}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          if (!disabled) onChange(!value);
        }}
        className={`mt-0.5 relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed ${
          effective ? "bg-accent" : "bg-border"
        } ${disabled ? "opacity-40" : ""}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-bg shadow transition-transform ${
            effective ? "translate-x-4" : ""
          }`}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold text-ink">{label}</span>
          {v3 && (
            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
              <IconLock className="w-2.5 h-2.5" />
              V3
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted leading-relaxed">{sub}</div>
      </div>
    </label>
  );
}

function ActionCard({
  title,
  sub,
  buttonLabel,
  onClick,
  disabled,
  danger,
  subtle,
  v3Badge,
}: {
  title: string;
  sub: string;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  subtle?: boolean;
  v3Badge?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        {v3Badge && (
          <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
            V3
          </span>
        )}
      </div>
      <p className="text-[11px] text-muted leading-relaxed">{sub}</p>
      <div className="mt-auto">
        <button
          onClick={onClick}
          disabled={disabled}
          className={`text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-50 ${
            danger
              ? "border border-hot/45 bg-hot/10 text-hot hover:bg-hot/15"
              : subtle
              ? "border border-border bg-bg text-ink-muted hover:text-ink hover:bg-surface-2"
              : "bg-accent text-bg hover:bg-accent/90 shadow-glow-accent"
          }`}
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

// silence unused-import lint
void IconCheck;
void IconRefresh;
void IconFlame;
