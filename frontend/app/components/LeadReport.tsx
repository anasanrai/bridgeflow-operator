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
