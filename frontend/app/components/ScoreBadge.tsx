"use client";

type Score = "hot" | "warm" | "cold" | "unknown" | string;

interface Props {
  score: Score;
  confidence?: number | null;
  animate?: boolean; // trigger the hot-pop animation on entrance
  size?: "sm" | "md";
}

export function ScoreBadge({ score, confidence, animate = false, size = "md" }: Props) {
  const s = (score || "unknown").toLowerCase();
  const padding = size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";

  const styles: Record<string, string> = {
    hot: "border-hot/50 bg-hot/10 text-hot shadow-glow-hot",
    warm: "border-warm/50 bg-warm/10 text-warm shadow-glow-warm",
    cold: "border-cold/50 bg-cold/10 text-cold shadow-glow-cold",
    unknown: "border-border bg-surface text-muted",
  };

  const animation =
    animate && s === "hot"
      ? "animate-hot-pop [animation-fill-mode:backwards]"
      : "";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border font-mono font-semibold uppercase tracking-wider ${padding} ${
        styles[s] ?? styles.unknown
      } ${animation}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full bg-current ${s === "hot" ? "animate-blink" : ""}`}
      />
      <span>{s}</span>
      {typeof confidence === "number" && (
        <span className="opacity-70 normal-case tracking-normal">
          · {confidence}%
        </span>
      )}
    </span>
  );
}
