"use client";

import { useMemo } from "react";
import {
  IconBuilding,
  IconCheck,
  IconKey,
  IconLock,
  IconSparkle,
  IconTarget,
  IconUsers,
} from "../../lib/icons";
import {
  CompanyProfile,
  EMPTY_PROFILE,
  INDUSTRY_OPTIONS,
  SaveStatus,
  TONE_OPTIONS,
  useCompanyProfile,
} from "../../lib/companyProfile";
import { profileCompleteness } from "../../components/Sidebar";

export default function CompanyPage() {
  const { profile, loaded, status, error, update, save } = useCompanyProfile();
  const completeness = useMemo(() => profileCompleteness(profile), [profile]);

  return (
    <div className="space-y-6 max-w-4xl">
      <Header
        completeness={completeness}
        status={status}
        error={error}
        onSaveAll={() => save(profile)}
      />

      {!loaded ? (
        <Skeleton />
      ) : (
        <div className="space-y-5">
          <YourCompanyCard profile={profile} update={update} save={save} />
          <YourAgentCard profile={profile} update={update} save={save} />
          <PricingObjectionsCard profile={profile} update={update} save={save} />
          <CustomInstructionsCard profile={profile} update={update} save={save} />
          <RoadmapPlaceholders />
        </div>
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header({
  completeness,
  status,
  error,
  onSaveAll,
}: {
  completeness: ReturnType<typeof profileCompleteness>;
  status: SaveStatus;
  error: string | null;
  onSaveAll: () => void;
}) {
  const completenessMeta = {
    complete: { dot: "bg-accent shadow-glow-accent", label: "complete" },
    partial: { dot: "bg-amber-400", label: "partially filled" },
    empty: { dot: "bg-hot/80 shadow-glow-hot", label: "empty" },
  } as const;
  const c = completenessMeta[completeness];

  const statusText: Record<SaveStatus, string> = {
    idle: "auto-saves on blur",
    saving: "saving…",
    saved: "saved",
    error: "save failed",
  };

  const statusCls: Record<SaveStatus, string> = {
    idle: "text-faint border-border bg-surface",
    saving: "text-amber-200 border-amber-500/40 bg-amber-500/10",
    saved: "text-accent border-accent/40 bg-accent/10",
    error: "text-hot border-hot/40 bg-hot/10",
  };

  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink flex items-center gap-2">
          <IconBuilding className="w-5 h-5 text-accent" />
          Company identity
        </h1>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          Every Opus 4.7 agent in the pipeline pulls from this profile —
          tone, pricing, objections, agent persona. Sets the operator's voice
          across analysis, qualification, campaign, actions, and reflection.
        </p>
      </div>
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-surface text-muted">
          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
          {c.label}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${statusCls[status]}`}
        >
          {statusText[status]}
        </span>
        <button
          onClick={onSaveAll}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-accent/40 bg-accent/10 text-accent hover:bg-accent/15 cursor-pointer"
        >
          <IconCheck className="w-3.5 h-3.5" />
          Save now
        </button>
      </div>
      {error && (
        <div className="basis-full text-[12px] rounded-md border border-hot/40 bg-hot/5 text-hot px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Sections ────────────────────────────────────────────────────────────

interface SectionProps {
  profile: CompanyProfile;
  update: (k: keyof CompanyProfile, v: string) => void;
  save: (next?: CompanyProfile) => Promise<void>;
}

function YourCompanyCard({ profile, update, save }: SectionProps) {
  return (
    <Card title="Your company" icon={<IconBuilding className="w-4 h-4" />}>
      <Field
        label="Company name"
        required
        placeholder={EMPTY_PROFILE.company_name || "Frisco Realty"}
        value={profile.company_name}
        onChange={(v) => update("company_name", v)}
        onBlur={save}
      />
      <Select
        label="Industry"
        required
        value={profile.industry}
        onChange={(v) => update("industry", v)}
        onBlur={save}
        options={INDUSTRY_OPTIONS}
        placeholder="Select industry"
      />
      <Field
        as="textarea"
        label="What you sell"
        required
        placeholder="What's the actual product or service? Be specific."
        value={profile.what_you_sell}
        onChange={(v) => update("what_you_sell", v)}
        onBlur={save}
      />
      <Field
        as="textarea"
        label="Target client description"
        required
        placeholder="Who do you sell to? Title, company size, common pain."
        value={profile.target_client}
        onChange={(v) => update("target_client", v)}
        onBlur={save}
      />
      <Field
        label="Booking / calendar link"
        placeholder="https://calendly.com/you/30min"
        value={profile.booking_link}
        onChange={(v) => update("booking_link", v)}
        onBlur={save}
      />
    </Card>
  );
}

function YourAgentCard({ profile, update, save }: SectionProps) {
  return (
    <Card title="Your AI agent" icon={<IconSparkle className="w-4 h-4" />}>
      <Field
        label="Agent name"
        required
        placeholder="Alex"
        value={profile.agent_name}
        onChange={(v) => update("agent_name", v)}
        onBlur={save}
      />
      <Select
        label="Agent tone"
        required
        value={profile.agent_tone}
        onChange={(v) => update("agent_tone", v)}
        onBlur={save}
        options={TONE_OPTIONS}
        placeholder="Select tone"
      />
      <Field
        as="textarea"
        label="Agent persona description"
        placeholder='How should your agent present themselves? E.g. "Sharp, plain-spoken, warm — like a senior rep who has been on 3,000 of these calls."'
        value={profile.agent_persona}
        onChange={(v) => update("agent_persona", v)}
        onBlur={save}
      />
    </Card>
  );
}

function PricingObjectionsCard({ profile, update, save }: SectionProps) {
  return (
    <Card title="Your pricing + objections" icon={<IconTarget className="w-4 h-4" />}>
      <Field
        as="textarea"
        label="Pricing notes"
        required
        placeholder="We charge $X for Y. Pilots start at $Z. Annual is $W."
        value={profile.pricing_notes}
        onChange={(v) => update("pricing_notes", v)}
        onBlur={save}
      />
      <ObjectionRow
        idx={1}
        q={profile.objection_1_q}
        a={profile.objection_1_a}
        onChangeQ={(v) => update("objection_1_q", v)}
        onChangeA={(v) => update("objection_1_a", v)}
        onBlur={save}
      />
      <ObjectionRow
        idx={2}
        q={profile.objection_2_q}
        a={profile.objection_2_a}
        onChangeQ={(v) => update("objection_2_q", v)}
        onChangeA={(v) => update("objection_2_a", v)}
        onBlur={save}
      />
      <ObjectionRow
        idx={3}
        q={profile.objection_3_q}
        a={profile.objection_3_a}
        onChangeQ={(v) => update("objection_3_q", v)}
        onChangeA={(v) => update("objection_3_a", v)}
        onBlur={save}
      />
    </Card>
  );
}

function CustomInstructionsCard({ profile, update, save }: SectionProps) {
  return (
    <Card title="Custom agent instructions" icon={<IconKey className="w-4 h-4" />}>
      <Field
        as="textarea"
        rows={5}
        label="Anything else your agents must always know or never do"
        placeholder="Never quote a price over $20k without rep approval. Always reference the prospect's own words. Avoid the phrase 'best in class.'"
        value={profile.custom_instructions}
        onChange={(v) => update("custom_instructions", v)}
        onBlur={save}
      />
    </Card>
  );
}

function ObjectionRow({
  idx,
  q,
  a,
  onChangeQ,
  onChangeA,
  onBlur,
}: {
  idx: number;
  q: string;
  a: string;
  onChangeQ: (v: string) => void;
  onChangeA: (v: string) => void;
  onBlur: () => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg/40 p-3 space-y-2">
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
        Objection {idx}
      </div>
      <Field
        label="Question they ask"
        placeholder='E.g. "Why are you more expensive than Follow Up Boss?"'
        value={q}
        onChange={onChangeQ}
        onBlur={onBlur}
        compact
      />
      <Field
        as="textarea"
        rows={2}
        label="Your answer"
        placeholder="The exact framing your best rep uses on this objection."
        value={a}
        onChange={onChangeA}
        onBlur={onBlur}
        compact
      />
    </div>
  );
}

// ── Form primitives ─────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  as,
  rows,
  compact,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => Promise<void>;
  placeholder?: string;
  required?: boolean;
  as?: "input" | "textarea";
  rows?: number;
  compact?: boolean;
}) {
  const cls =
    "w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent/45 transition-colors";
  return (
    <label className={`block ${compact ? "" : "mt-3 first:mt-0"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
          {label}
        </span>
        {required && (
          <span className="text-[9px] font-mono text-amber-300/80">required</span>
        )}
      </div>
      {as === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => void onBlur()}
          placeholder={placeholder}
          rows={rows ?? 3}
          spellCheck={false}
          className={`${cls} resize-y leading-relaxed scrollbar-thin font-sans`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => void onBlur()}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  onBlur,
  options,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => Promise<void>;
  options: string[];
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block mt-3 first:mt-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-faint">
          {label}
        </span>
        {required && (
          <span className="text-[9px] font-mono text-amber-300/80">required</span>
        )}
      </div>
      <select
        value={value || ""}
        onChange={(e) => {
          onChange(e.target.value);
          // Selects don't reliably blur; trigger save on change instead.
          void onBlur();
        }}
        className="w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent/45 transition-colors"
      >
        <option value="" disabled>
          {placeholder ?? "Select…"}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Card({
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
      <div className="p-5 space-y-1">{children}</div>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 rounded-xl border border-border bg-surface animate-pulse" />
      ))}
    </div>
  );
}

// ── V3 / V4 locked roadmap placeholders ─────────────────────────────────

function RoadmapPlaceholders() {
  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-amber-500/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-center">
            <IconLock className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Coming next</h2>
            <p className="text-[11px] text-muted">
              Locked features — what V3 and V4 add to the company identity vault.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
          V3 / V4
        </span>
      </header>
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <LockedCard
          version="V3"
          title="Team members"
          description="Invite your team. Roles, ownership, per-rep tone overrides."
          icon={<IconUsers className="w-4 h-4" />}
          mockRows={["Marcus — Sales lead", "Avery — SDR", "+ Add team member"]}
        />
        <LockedCard
          version="V4"
          title="Department agents"
          description="Assign Opus 4.7 agents to Sales, Success, Operations. Each one inherits this profile + adds department-specific tools."
          icon={<IconSparkle className="w-4 h-4" />}
          mockRows={["Sales — Alex", "Success — Casey", "Ops — Jordan"]}
        />
        <LockedCard
          version="V4"
          title="Credential vault"
          description="MCP-secured per-agent secrets. Agents only see what they need; full audit log."
          icon={<IconKey className="w-4 h-4" />}
          mockRows={["resend.com · 0 ◐", "telegram · 0 ◐", "google calendar · 0 ◐"]}
        />
      </div>
    </section>
  );
}

function LockedCard({
  version,
  title,
  description,
  icon,
  mockRows,
}: {
  version: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  mockRows: string[];
}) {
  return (
    <div className="relative rounded-lg border border-border bg-bg/40 overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-surface border border-border text-ink-muted flex items-center justify-center">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-ink truncate">{title}</div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-faint">
            {version}
          </div>
        </div>
        <IconLock className="w-3.5 h-3.5 text-amber-300/80" />
      </div>
      <p className="text-[11px] text-muted px-3 pt-2 leading-relaxed">{description}</p>
      <ul className="px-3 pt-2 pb-3 space-y-1">
        {mockRows.map((r, i) => (
          <li
            key={i}
            className="text-[11px] font-mono text-faint bg-surface/80 border border-border rounded px-2 py-1 truncate"
          >
            {r}
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 bg-bg/0 pointer-events-none" aria-hidden />
    </div>
  );
}
