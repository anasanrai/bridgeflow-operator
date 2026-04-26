"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconCalendar,
  IconCheck,
  IconCopy,
  IconKey,
  IconLock,
  IconMail,
  IconRefresh,
  IconSparkle,
  IconTelegram,
  IconUsers,
  IconX,
} from "../../lib/icons";

const RAILWAY_BACKEND =
  "https://bridgeflow-operator-production.up.railway.app";

interface ConfigStatus {
  anthropic: boolean;
  supabase: boolean;
  resend: boolean;
  telegram: boolean;
  groq: boolean;
  hubspot?: boolean;
  hubspot_portal_id?: string | null;
  telegram_approval_mode?: boolean;
}

export default function CredentialsPage() {
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    fetch("/api/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => setConfig(c))
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  };
  useEffect(refresh, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <Header onRefresh={refresh} loading={loading} />
      {loading && !config ? (
        <Skeleton />
      ) : (
        <>
          <AIModelsCard config={config} />
          <NotificationsCard config={config} />
          <EmailCard config={config} />
          <CRMCard config={config} />
          <ComingSoon />
        </>
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink flex items-center gap-2">
          <IconKey className="w-5 h-5 text-accent" />
          Credentials
        </h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Live status of every external service. Set secrets in your Railway
          backend env (or local <code className="text-[12px] font-mono text-ink-muted">.env</code>) — the operator
          reads them at process start.
        </p>
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
  );
}

// ── AI Models ──────────────────────────────────────────────────────────

function AIModelsCard({ config }: { config: ConfigStatus | null }) {
  return (
    <Section title="AI Models" icon={<IconSparkle className="w-4 h-4" />}>
      <CredField
        label="Anthropic API key"
        envVar="ANTHROPIC_API_KEY"
        placeholder="sk-ant-api03-***"
        ok={!!config?.anthropic}
        whereToGet="https://console.anthropic.com/settings/keys"
      />
      <CredField
        label="Groq API key"
        envVar="GROQ_API_KEY"
        placeholder="gsk_***"
        ok={!!config?.groq}
        whereToGet="https://console.groq.com/keys"
        note="Used by V1 Call Recording (Whisper-large-v3-turbo transcription)."
      />
      <V2Note label="OpenAI / Gemini selectors" />
    </Section>
  );
}

// ── Notifications ──────────────────────────────────────────────────────

function NotificationsCard({ config }: { config: ConfigStatus | null }) {
  return (
    <Section title="Notifications" icon={<IconTelegram className="w-4 h-4" />}>
      <CredField
        label="Telegram bot token"
        envVar="TELEGRAM_BOT_TOKEN"
        placeholder="123456789:ABC-***"
        ok={!!config?.telegram}
        whereToGet="@BotFather on Telegram → /newbot, copy the HTTP API token"
      />
      <CredField
        label="Telegram chat ID"
        envVar="TELEGRAM_CHAT_ID"
        placeholder="6650991396"
        ok={!!config?.telegram}
        whereToGet={"Send a message to your bot, then visit https://api.telegram.org/bot<token>/getUpdates and copy chat.id"}
      />
      <TelegramWebhook ok={!!config?.telegram} />
      <CredField
        label="Slack webhook URL"
        envVar="SLACK_WEBHOOK_URL"
        placeholder="https://hooks.slack.com/services/T***/B***/***"
        ok={false}
        whereToGet="Slack admin → Incoming Webhooks"
        beta="V2 Beta"
        comingSoon
        note="Slack APPROVE / EDIT / SKIP parity ships next to Telegram in V2."
      />
    </Section>
  );
}

function TelegramWebhook({ ok }: { ok: boolean }) {
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkInfo = async () => {
    setError(null);
    if (!token.trim()) {
      setError("Paste your bot token (read-only here, not stored).");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(
        `https://api.telegram.org/bot${encodeURIComponent(token.trim())}/getWebhookInfo`,
        { cache: "no-store" }
      );
      const data = await r.json();
      setInfo(data?.result ?? data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const setupCmd = `curl -F "url=${RAILWAY_BACKEND}/telegram-webhook" \\\n  "https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/setWebhook"`;

  return (
    <div className="rounded-lg border border-border bg-bg/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">Webhook setup</span>
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
            ok
              ? "border-accent/40 text-accent bg-accent/10"
              : "border-border text-faint bg-surface"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-accent" : "bg-faint"}`} />
          {ok ? "bot reachable" : "not configured"}
        </span>
      </div>
      <p className="text-[12px] text-muted leading-relaxed">
        Run this once after deploy so APPROVE / EDIT / SKIP replies hit the
        backend. Replace the placeholder with your actual bot token —
        it's never stored on this page.
      </p>
      <CodeBlock value={setupCmd} />

      <div className="pt-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-faint mb-1">
          Check current webhook (read-only)
        </div>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="paste TELEGRAM_BOT_TOKEN to fetch /getWebhookInfo"
            className="flex-1 rounded-md bg-bg border border-border px-3 py-1.5 text-[12px] font-mono text-ink placeholder:text-faint focus:outline-none focus:border-accent/45"
          />
          <button
            onClick={checkInfo}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-md border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15 disabled:opacity-50 cursor-pointer"
          >
            {loading ? "…" : "Check"}
          </button>
        </div>
        {error && (
          <div className="mt-1.5 text-[11px] text-hot">{error}</div>
        )}
        {info && (
          <pre className="mt-2 max-h-40 overflow-auto scrollbar-thin text-[11px] font-mono leading-relaxed text-ink-muted bg-bg/60 border border-border rounded p-2">
            {JSON.stringify(info, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ── Email ──────────────────────────────────────────────────────────────

function EmailCard({ config }: { config: ConfigStatus | null }) {
  const [recipient, setRecipient] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [detail, setDetail] = useState<string | null>(null);

  const send = async () => {
    if (!recipient.trim()) {
      setStatus("error");
      setDetail("Enter a recipient first.");
      return;
    }
    setStatus("sending");
    setDetail(null);
    try {
      const r = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipient.trim() }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.sent) {
        setStatus("sent");
        setDetail(`Resend id ${data.id}`);
      } else {
        setStatus("error");
        setDetail(data?.detail || `HTTP ${r.status}`);
      }
    } catch (err) {
      setStatus("error");
      setDetail((err as Error).message);
    } finally {
      setTimeout(() => {
        setStatus((s) => (s === "sent" ? "idle" : s));
      }, 4000);
    }
  };

  return (
    <Section title="Email (Resend)" icon={<IconMail className="w-4 h-4" />}>
      <CredField
        label="Resend API key"
        envVar="RESEND_API_KEY"
        placeholder="re_***"
        ok={!!config?.resend}
        whereToGet="https://resend.com/api-keys"
      />
      <CredField
        label="From address"
        envVar="RESEND_FROM"
        placeholder="onboarding@resend.dev"
        ok={!!config?.resend}
        note="Resend's free tier requires onboarding@resend.dev (only sends to the account-owner email) until you verify a custom domain."
      />
      <div className="rounded-lg border border-border bg-bg/40 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-sm font-semibold text-ink">Send a test email</span>
          {status !== "idle" && (
            <span
              className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                status === "sent"
                  ? "border-accent/40 text-accent bg-accent/10"
                  : status === "error"
                  ? "border-hot/40 text-hot bg-hot/10"
                  : "border-amber-500/40 text-amber-200 bg-amber-500/10"
              }`}
            >
              {status === "sending" ? "sending" : status === "sent" ? "sent" : "failed"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 rounded-md bg-bg border border-border px-3 py-1.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent/45"
          />
          <button
            onClick={send}
            disabled={status === "sending"}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-accent text-bg hover:bg-accent/90 disabled:opacity-50 cursor-pointer shadow-glow-accent"
          >
            Send test
          </button>
        </div>
        {detail && (
          <div
            className={`mt-2 text-[11px] font-mono ${
              status === "sent" ? "text-accent" : status === "error" ? "text-hot" : "text-muted"
            }`}
          >
            {detail}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── V2 CRM (HubSpot — live) ─────────────────────────────────────────────

function CRMCard({ config }: { config: ConfigStatus | null }) {
  const ok = !!config?.hubspot;
  const portalId = config?.hubspot_portal_id;
  const region = "eu1"; // backend default; wire later if needed
  const portalUrl =
    ok && portalId
      ? `https://app-${region}.hubspot.com/contacts/${portalId}`
      : null;

  return (
    <Section title="CRM" icon={<IconUsers className="w-4 h-4" />}>
      <div className="rounded-lg border border-border bg-bg/40 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-[#ff7a59]/15 border border-[#ff7a59]/40 text-[#ff9777] flex items-center justify-center">
              <span className="text-[12px] font-bold leading-none">H</span>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-ink">HubSpot</div>
              <div className="text-[11px] text-muted">
                Contacts + Deals · auto-sync on HOT/WARM leads
              </div>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              ok
                ? "border-accent/40 text-accent bg-accent/10"
                : "border-border text-faint bg-surface"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                ok ? "bg-accent shadow-glow-accent" : "bg-faint"
              }`}
            />
            {ok ? "live" : "not connected"}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
          <Stat label="Contacts" value={ok ? "read + write" : "—"} live={ok} />
          <Stat label="Deals" value={ok ? "create + assoc" : "—"} live={ok} />
          <Stat
            label="Portal"
            value={portalId ? `id ${portalId}` : "—"}
            live={!!portalId}
          />
        </div>

        {portalUrl && (
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-accent/40 bg-accent/[0.07] text-accent hover:bg-accent/[0.12] transition-colors cursor-pointer"
          >
            Open contacts in HubSpot →
          </a>
        )}

        <div className="mt-3 text-[11px] text-muted leading-relaxed">
          Token lives in <code className="font-mono text-ink-muted">HUBSPOT_TOKEN</code>{" "}
          (Railway env). Each pipeline run with score=HOT or WARM triggers a
          contact upsert (search-by-email) + new deal + association. Synced
          actions appear in the Action Manifest with click-through links.
        </div>
      </div>
    </Section>
  );
}

function Stat({
  label,
  value,
  live,
}: {
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-surface px-2 py-1.5">
      <div className="text-[9px] font-mono uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className={`mt-0.5 ${live ? "text-ink-muted" : "text-faint"}`}>
        {value}
      </div>
    </div>
  );
}

// ── V3 locked cards ─────────────────────────────────────────────────────

function ComingSoon() {
  const cards = [
    {
      title: "CRM",
      subtitle: "HubSpot · Salesforce · Follow Up Boss",
      icon: <IconUsers className="w-4 h-4" />,
      bullets: ["Two-way sync", "Lead routing rules", "Per-rep tone"],
    },
    {
      title: "Calendar",
      subtitle: "Calendly · Google Calendar",
      icon: <IconCalendar className="w-4 h-4" />,
      bullets: ["Auto-book HOT leads", "Round-robin", "Time-zone aware"],
    },
    {
      title: "WhatsApp Business",
      subtitle: "Approved templates",
      icon: <IconTelegram className="w-4 h-4" />,
      bullets: ["Inbound capture", "Approval gating", "Multi-language"],
    },
  ];
  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-amber-500/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-center">
            <IconLock className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Coming in V3</h2>
            <p className="text-[11px] text-muted">
              Real CRM + calendar + WhatsApp connectors.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
          V3
        </span>
      </header>
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.title}
            className="relative rounded-lg border border-border bg-bg/40 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="w-7 h-7 rounded-md bg-surface border border-border text-ink-muted flex items-center justify-center">
                {c.icon}
              </div>
              <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
                <IconLock className="w-2.5 h-2.5" />
                Connect in V3
              </span>
            </div>
            <div className="mt-3 text-[13px] font-semibold text-ink">{c.title}</div>
            <div className="text-[11px] text-faint mt-0.5">{c.subtitle}</div>
            <ul className="mt-2.5 space-y-1">
              {c.bullets.map((b) => (
                <li
                  key={b}
                  className="text-[11px] text-muted flex items-center gap-1.5"
                >
                  <span className="w-1 h-1 rounded-full bg-amber-300/70" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Primitives ─────────────────────────────────────────────────────────

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

function CredField({
  label,
  envVar,
  placeholder,
  ok,
  whereToGet,
  note,
  beta,
  comingSoon,
}: {
  label: string;
  envVar: string;
  placeholder: string;
  ok: boolean;
  whereToGet?: string;
  note?: string;
  beta?: string;
  comingSoon?: boolean;
}) {
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyEnv = async () => {
    try {
      await navigator.clipboard.writeText(`${envVar}=${value || placeholder}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg/40 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-semibold text-ink">{label}</span>
          {beta && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
              {beta}
            </span>
          )}
          <code className="text-[10px] font-mono text-faint px-1.5 py-0.5 rounded border border-border bg-surface">
            {envVar}
          </code>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
            ok
              ? "border-accent/40 text-accent bg-accent/10"
              : comingSoon
              ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
              : "border-border text-faint bg-surface"
          }`}
        >
          {ok ? <IconCheck className="w-2.5 h-2.5" /> : comingSoon ? <IconLock className="w-2.5 h-2.5" /> : <IconX className="w-2.5 h-2.5" />}
          {ok ? "configured" : comingSoon ? "soon" : "not set"}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <input
          type={reveal ? "text" : "password"}
          value={value}
          disabled={comingSoon}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-md bg-bg border border-border px-3 py-1.5 text-[12px] font-mono text-ink placeholder:text-faint focus:outline-none focus:border-accent/45 disabled:opacity-50"
        />
        <button
          onClick={() => setReveal((r) => !r)}
          disabled={comingSoon}
          className="text-[10px] font-mono px-2 py-1 rounded border border-border bg-bg hover:bg-surface-2 text-muted hover:text-ink disabled:opacity-40 cursor-pointer"
        >
          {reveal ? "hide" : "show"}
        </button>
        <button
          onClick={copyEnv}
          disabled={comingSoon}
          className={`text-[10px] font-mono px-2 py-1 rounded border cursor-pointer disabled:opacity-40 ${
            copied
              ? "border-accent/40 text-accent bg-accent/10"
              : "border-border bg-bg text-muted hover:text-ink hover:bg-surface-2"
          }`}
        >
          {copied ? "copied" : "copy env"}
        </button>
      </div>

      {whereToGet && (
        <div className="mt-1.5 text-[11px] text-faint">
          Get it at <span className="text-muted">{whereToGet}</span>
        </div>
      )}
      {note && <div className="mt-1 text-[11px] text-muted leading-relaxed">{note}</div>}
      <div className="mt-1.5 text-[10px] font-mono text-faint">
        Set in your Railway service env (or local <code className="text-ink-muted">.env</code>) — values aren't persisted from this form.
      </div>
    </div>
  );
}

function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-md border border-border bg-bg/60 p-3 group">
      <pre className="text-[11px] font-mono text-ink-muted leading-relaxed whitespace-pre-wrap break-all">
        {value}
      </pre>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {
            // ignore
          }
        }}
        className={`absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
          copied
            ? "border-accent/40 text-accent bg-accent/10"
            : "border-border bg-bg text-muted hover:text-ink hover:bg-surface-2 opacity-0 group-hover:opacity-100"
        }`}
      >
        <IconCopy className="w-3 h-3" />
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}

function V2Note({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-amber-500/35 bg-amber-500/[0.04] px-3 py-2 flex items-center justify-between">
      <span className="text-[12px] text-amber-200">{label}</span>
      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
        Building V2 → V3
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-32 rounded-xl border border-border bg-surface animate-pulse"
        />
      ))}
    </div>
  );
}

// silence unused-import lint
void useMemo;
