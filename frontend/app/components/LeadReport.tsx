"use client";

import { IconCalendar, IconDownload, IconMail, IconSparkle } from "../lib/icons";
import { PipelineResults } from "../lib/types";
import { ScoreBadge } from "./ScoreBadge";

interface Props {
  results: PipelineResults | null;
}

export function LeadReport({ results }: Props) {
  if (!results) return null;
  const { call_analysis, qualification, campaign, reflection } = results;
  const prospect = call_analysis?.prospect ?? {};
  const score = (qualification?.score ?? "unknown").toLowerCase();

  const exportPdf = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div id="printable-report" className="space-y-4 animate-fade-in-up">
      <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
                Lead
              </div>
              <div className="text-lg font-semibold text-ink mt-1 tracking-tight">
                {prospect.name || "Unknown"}
                {prospect.company && prospect.company !== "Unknown" && (
                  <span className="text-muted font-normal"> · {prospect.company}</span>
                )}
              </div>
              <div className="text-xs text-muted mt-1 font-mono truncate">
                {prospect.email && prospect.email !== "Unknown" ? prospect.email : "no email"}
                {prospect.phone && prospect.phone !== "Unknown" ? ` · ${prospect.phone}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <button
                onClick={exportPdf}
                className="no-print inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink transition-colors cursor-pointer"
                title="Open the print dialog to save as PDF"
              >
                <IconDownload className="w-3.5 h-3.5" />
                Export PDF
              </button>
              <ScoreBadge
                score={score}
                confidence={qualification?.confidence}
                animate
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-b border-border">
          <Stat label="Decision" value={fmtDecision(qualification?.decision)} />
          <Stat label="Priority" value={`#${qualification?.priority_rank ?? "—"}`} />
          <Stat label="Est. value" value={qualification?.estimated_deal_value ?? "—"} />
          <Stat label="Best time" value={qualification?.best_contact_time ?? "—"} />
        </div>

        {qualification?.score_reasoning && (
          <div className="px-5 py-4 text-sm text-ink/90 leading-relaxed">
            {qualification.score_reasoning}
          </div>
        )}

        <BantPanel
          callAnalysis={call_analysis}
          score={score}
        />
      </section>

      <section className="rounded-xl border border-border bg-surface shadow-inset-hair p-5">
        <div className="flex items-center gap-2 mb-3">
          <IconSparkle className="w-4 h-4 text-accent" />
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
            Rep briefing
          </div>
        </div>
        <div className="text-sm text-ink/90 leading-relaxed">
          {reflection?.rep_briefing || "—"}
        </div>
        {Array.isArray(reflection?.flags) && reflection.flags.length > 0 && (
          <div className="mt-3 text-xs text-warm flex items-start gap-2">
            <span className="font-semibold shrink-0">Flags:</span>
            <span>{reflection.flags.join(" · ")}</span>
          </div>
        )}
        {typeof reflection?.pipeline_confidence === "number" && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-faint font-mono">Pipeline confidence</span>
            <div className="flex-1 h-1 rounded-full bg-border relative overflow-hidden max-w-[180px]">
              <div
                className="absolute inset-y-0 left-0 bg-accent rounded-full"
                style={{ width: `${reflection.pipeline_confidence}%` }}
              />
            </div>
            <span className="font-mono text-accent font-semibold">
              {reflection.pipeline_confidence}%
            </span>
          </div>
        )}
      </section>

      {Array.isArray(campaign?.email_sequence) && campaign.email_sequence.length > 0 && (
        <EmailTimeline campaign={campaign} />
      )}
    </div>
  );
}

function EmailTimeline({ campaign }: { campaign: any }) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <IconMail className="w-4 h-4 text-accent" />
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
            Email sequence
          </div>
          <span className="text-[10px] font-mono text-muted px-1.5 py-0.5 rounded border border-border">
            {campaign.email_sequence.length} touch
            {campaign.email_sequence.length > 1 ? "es" : ""}
          </span>
        </div>
      </div>

      <ol className="relative ml-3 border-l border-border space-y-5">
        {campaign.email_sequence.map((email: any, i: number) => (
          <li key={i} className="relative pl-5">
            <span className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-surface border-2 border-accent shadow-glow-accent" />
            <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-muted mb-1.5">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-accent/30 bg-accent/5 text-accent">
                <IconCalendar className="w-3 h-3" />
                {email.send_at}
              </span>
              {email.goal && (
                <span className="truncate text-faint">· {email.goal}</span>
              )}
            </div>
            <div className="text-sm font-semibold text-ink">{email.subject}</div>
            <div className="mt-1.5 text-xs text-ink-muted whitespace-pre-wrap leading-relaxed">
              {email.body}
            </div>
          </li>
        ))}
      </ol>

      {campaign.crm_note && (
        <div className="mt-5 pt-4 border-t border-border">
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint mb-2">
            CRM note
          </div>
          <div className="text-xs text-ink-muted italic leading-relaxed border-l-2 border-accent/40 pl-3">
            {campaign.crm_note}
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
        {label}
      </div>
      <div className="text-sm text-ink mt-1 font-mono truncate">{value || "—"}</div>
    </div>
  );
}

function fmtDecision(d: string | undefined): string {
  if (!d) return "—";
  return d.replace(/_/g, " ");
}

// ── BANT panel ──────────────────────────────────────────────────────────
// Derives Budget / Authority / Need / Timeline as High/Medium/Low from the
// Call Analyst's structured output. We don't store BANT explicitly — Opus
// already gives us budget.mentioned, intent, timeline.urgency, pain_points
// and objections. This is the operator-facing summary of those signals.

type BantLevel = "high" | "medium" | "low";

function deriveBant(callAnalysis: any, score: string): {
  budget: { level: BantLevel; note: string };
  authority: { level: BantLevel; note: string };
  need: { level: BantLevel; note: string };
  timeline: { level: BantLevel; note: string };
} {
  const ca = callAnalysis || {};
  const budget = ca.budget || {};
  const timeline = ca.timeline || {};
  const intent = (ca.intent ?? "").toLowerCase();
  const pain = Array.isArray(ca.pain_points) ? ca.pain_points.length : 0;
  const objections = Array.isArray(ca.objections) ? ca.objections : [];
  const role = (ca.prospect?.role ?? "").toLowerCase();
  const flags = Array.isArray(ca.red_flags) ? ca.red_flags : [];

  // Budget: mentioned + amount + flexibility
  const budgetLevel: BantLevel = (() => {
    if (!budget.mentioned) return "low";
    const flex = (budget.flexibility ?? "unknown").toLowerCase();
    const hasAmount = budget.amount && budget.amount !== "Unknown";
    if (hasAmount && flex === "flexible") return "high";
    if (hasAmount) return "medium";
    return "medium";
  })();
  const budgetNote = (() => {
    if (!budget.mentioned) return "Not discussed on the call";
    if (budget.amount && budget.amount !== "Unknown") return budget.amount;
    return "Mentioned, no number";
  })();

  // Authority: derive from role + objections that mention partners/approvers
  const partnerSignal = objections
    .concat(flags)
    .some((o: string) => /partner|approve|sign[- ]?off|board|cfo|legal/i.test(o ?? ""));
  const ownerRole =
    /founder|owner|ceo|partner|principal|head|director|gm|managing/i.test(role);
  const authorityLevel: BantLevel = ownerRole && !partnerSignal
    ? "high"
    : ownerRole || !partnerSignal
    ? "medium"
    : "low";
  const authorityNote = ownerRole
    ? `${role.split(/[\s/]/)[0] || "Owner"}-level contact`
    : partnerSignal
    ? "Needs partner / approver sign-off"
    : "Role unclear from call";

  // Need: intent + pain points
  const needLevel: BantLevel = (() => {
    if (intent === "buying" && pain >= 1) return "high";
    if (intent === "buying" || pain >= 2) return "high";
    if (intent === "exploring" && pain >= 1) return "medium";
    if (intent === "exploring") return "medium";
    return "low";
  })();
  const needNote = pain > 0
    ? `${pain} pain point${pain === 1 ? "" : "s"} surfaced`
    : intent === "buying"
    ? "Strong buying language"
    : intent || "No clear need";

  // Timeline: urgency
  const urgency = (timeline.urgency ?? "unknown").toLowerCase();
  const timelineLevel: BantLevel =
    urgency === "immediate"
      ? "high"
      : urgency === "30_days"
      ? "high"
      : urgency === "90_days"
      ? "medium"
      : urgency === "no_urgency"
      ? "low"
      : "low";
  const timelineNote = (() => {
    if (urgency === "immediate") return "Immediate";
    if (urgency === "30_days") return "Within 30 days";
    if (urgency === "90_days") return "Within ~90 days";
    if (urgency === "no_urgency") return "No stated urgency";
    return timeline.detail || "Not discussed";
  })();

  // Soft-correct using the qualification score — if the qualifier said HOT
  // but the derivation came back uniformly low, bump the lowest-confidence
  // dimension. Cheap regression guard against under-derivation.
  const s = (score || "").toLowerCase();
  const result = {
    budget: { level: budgetLevel, note: budgetNote },
    authority: { level: authorityLevel, note: authorityNote },
    need: { level: needLevel, note: needNote },
    timeline: { level: timelineLevel, note: timelineNote },
  };
  if (s === "hot") {
    // Promote any 'low' to 'medium' — HOT shouldn't have flat-low BANT.
    (Object.keys(result) as Array<keyof typeof result>).forEach((k) => {
      if (result[k].level === "low") result[k].level = "medium";
    });
  }
  return result;
}

function BantPanel({
  callAnalysis,
  score,
}: {
  callAnalysis: any;
  score: string;
}) {
  const bant = deriveBant(callAnalysis, score);
  const rows: Array<{
    label: string;
    letter: string;
    level: BantLevel;
    note: string;
  }> = [
    { label: "Budget", letter: "B", level: bant.budget.level, note: bant.budget.note },
    { label: "Authority", letter: "A", level: bant.authority.level, note: bant.authority.note },
    { label: "Need", letter: "N", level: bant.need.level, note: bant.need.note },
    { label: "Timeline", letter: "T", level: bant.timeline.level, note: bant.timeline.note },
  ];

  const tone: Record<BantLevel, { dot: string; chip: string; label: string }> = {
    high: {
      dot: "bg-accent shadow-glow-accent",
      chip: "border-accent/40 text-accent bg-accent/10",
      label: "HIGH",
    },
    medium: {
      dot: "bg-amber-400",
      chip: "border-amber-500/40 text-amber-200 bg-amber-500/10",
      label: "MEDIUM",
    },
    low: {
      dot: "bg-hot",
      chip: "border-hot/40 text-hot bg-hot/10",
      label: "LOW",
    },
  };

  return (
    <div className="px-5 py-4 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
          BANT signal
        </div>
        <span className="text-[10px] font-mono text-faint">
          derived from call analysis
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {rows.map((r) => {
          const t = tone[r.level];
          return (
            <div
              key={r.label}
              className="rounded-md border border-border bg-bg/40 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${t.dot}`} />
                  <span className="text-[12px] font-semibold text-ink">
                    {r.label}
                  </span>
                </div>
                <span
                  className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${t.chip}`}
                >
                  {t.label}
                </span>
              </div>
              <div className="mt-1.5 text-[11px] text-muted leading-relaxed">
                {r.note}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
