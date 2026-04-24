"use client";

import { Sparkline } from "./Sparkline";

interface Props {
  label: string;
  value: string | number;
  delta?: { value: number; suffix?: string } | null;
  icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element;
  accent?: "accent" | "hot" | "warm" | "cold";
  sparkline?: number[];
}

const ACCENT_STYLES: Record<NonNullable<Props["accent"]>, { text: string; bg: string; border: string }> = {
  accent: { text: "text-accent", bg: "bg-accent/10", border: "border-accent/30" },
  hot: { text: "text-hot", bg: "bg-hot/10", border: "border-hot/30" },
  warm: { text: "text-warm", bg: "bg-warm/10", border: "border-warm/30" },
  cold: { text: "text-cold", bg: "bg-cold/10", border: "border-cold/30" },
};

export function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  accent = "accent",
  sparkline,
}: Props) {
  const s = ACCENT_STYLES[accent];
  const deltaPositive = (delta?.value ?? 0) >= 0;

  return (
    <div className="relative rounded-xl border border-border bg-surface p-5 shadow-inset-hair overflow-hidden group hover:border-border-strong transition-colors">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold text-ink tracking-tight tabular-nums">
            {value}
          </div>
          {delta && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono">
              <span
                className={
                  deltaPositive ? "text-emerald-400" : "text-hot"
                }
              >
                {deltaPositive ? "▲" : "▼"} {Math.abs(delta.value)}
                {delta.suffix ?? "%"}
              </span>
              <span className="text-faint">vs last 7d</span>
            </div>
          )}
        </div>
        <div
          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${s.bg} ${s.border} ${s.text}`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {sparkline && sparkline.length >= 2 && (
        <div className={`mt-4 ${s.text}`}>
          <Sparkline data={sparkline} height={40} />
        </div>
      )}
    </div>
  );
}
