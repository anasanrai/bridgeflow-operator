"use client";

import {
  IconArchive,
  IconCalendar,
  IconCheck,
  IconMail,
  IconSend,
  IconTelegram,
} from "../lib/icons";
import { PipelineResults } from "../lib/types";

interface Props {
  results: PipelineResults | null;
}

const TYPE_META: Record<
  string,
  { Icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element; label: string }
> = {
  send_email: { Icon: IconMail, label: "Send email" },
  send_telegram: { Icon: IconTelegram, label: "Send Telegram" },
  log_crm: { Icon: IconSend, label: "Log to CRM" },
  book_call: { Icon: IconCalendar, label: "Book call" },
  archive: { Icon: IconArchive, label: "Archive" },
};

const PRIORITY_STYLES: Record<
  string,
  { badge: string; dot: string; rail: string }
> = {
  immediate: {
    badge: "text-hot border-hot/40 bg-hot/10",
    dot: "bg-hot shadow-glow-hot",
    rail: "bg-hot",
  },
  scheduled: {
    badge: "text-warm border-warm/40 bg-warm/10",
    dot: "bg-warm shadow-glow-warm",
    rail: "bg-warm",
  },
  low: {
    badge: "text-cold border-cold/40 bg-cold/10",
    dot: "bg-cold shadow-glow-cold",
    rail: "bg-cold",
  },
};

const STATUS_STYLES: Record<string, string> = {
  queued: "text-ink-muted border-border bg-bg",
  sent: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  sending: "text-accent border-accent/40 bg-accent/10",
  failed: "text-hot border-hot/40 bg-hot/10",
};

export function ActionManifest({ results }: Props) {
  if (!results) return null;
  const actions = results.actions?.actions ?? [];
  const summary = results.actions?.summary ?? null;
  const eta = results.actions?.estimated_response_time;
  const humanReview = results.actions?.human_review_required;

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden animate-fade-in-up">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">Action manifest</h3>
            <span className="text-[10px] font-mono text-faint px-1.5 py-0.5 rounded border border-border">
              {actions.length} queued
            </span>
          </div>
          {summary && <p className="text-xs text-muted mt-1">{summary}</p>}
        </div>
        {humanReview && (
          <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-warm/40 bg-warm/10 text-warm shadow-glow-warm">
            <span className="w-1.5 h-1.5 rounded-full bg-warm animate-blink" />
            Human review
          </span>
        )}
      </div>

      {actions.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-muted">
          No actions queued.
        </div>
      ) : (
        <ol className="divide-y divide-border">
          {actions.map((action: any, i: number) => {
            const meta = TYPE_META[action.type] ?? {
              Icon: IconSend,
              label: action.type ?? "action",
            };
            const Icon = meta.Icon;
            const priority = PRIORITY_STYLES[action.priority] ?? PRIORITY_STYLES.low;
            const status = (action.status ?? "queued").toLowerCase();
            const statusClass =
              STATUS_STYLES[status] ?? STATUS_STYLES.queued;

            return (
              <li key={i} className="group relative px-5 py-3.5 hover:bg-white/[0.015] transition-colors">
                <div
                  className={`absolute left-0 top-0 bottom-0 w-0.5 ${priority.rail} opacity-60`}
                />
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-bg border border-border text-accent flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-ink">
                        {meta.label}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${priority.badge}`}
                      >
                        <span className={`inline-block w-1 h-1 rounded-full mr-1 align-middle ${priority.dot}`} />
                        {action.priority}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${statusClass}`}
                      >
                        {status === "sent" ? (
                          <span className="inline-flex items-center gap-1">
                            <IconCheck className="w-2.5 h-2.5" />
                            sent
                          </span>
                        ) : status === "sending" ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-current animate-blink" />
                            sending
                          </span>
                        ) : (
                          status
                        )}
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-faint">
                        #{action.sequence ?? i + 1}
                      </span>
                    </div>
                    {action.payload?.to && (
                      <div className="text-[11px] text-muted mt-1 font-mono truncate">
                        → {action.payload.to}
                        {action.payload?.subject ? ` · ${action.payload.subject}` : ""}
                      </div>
                    )}
                    {action.payload?.content && (
                      <div className="text-xs text-ink-muted mt-1.5 line-clamp-3 whitespace-pre-wrap leading-relaxed">
                        {action.payload.content}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {eta && (
        <div className="px-5 py-3 border-t border-border text-[11px] text-muted font-mono flex items-center gap-1.5">
          <span className="text-faint uppercase tracking-wider">ETA</span>
          <span className="text-ink-muted">{eta}</span>
        </div>
      )}
    </section>
  );
}
