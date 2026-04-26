import Link from "next/link";
import {
  IconChevron,
  IconLogo,
  IconPipeline,
  IconSparkle,
  IconTarget,
} from "./lib/icons";

export const metadata = {
  title: "BridgeFlow Operator · Built with Opus 4.7",
  description:
    "Drop a sales call. Five Claude Opus 4.7 agents qualify the lead, draft the campaign, fire Telegram + Resend, and self-review.",
};

const HACKATHON_URL = "https://cerebralvalley.ai/e/built-with-4-7-hackathon";
const REPO_URL = "https://github.com/anasanrai/bridgeflow-operator";

export default function LandingPage() {
  return (
    <div className="relative -mx-4 -my-6 px-4 py-8 lg:px-10 lg:py-14 overflow-hidden">
      <BackdropGlow />

      <div className="relative max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center gap-2">
          <Hackathon />
          <CreditUsage />
        </div>

        <h1 className="mt-7 text-[40px] sm:text-[56px] lg:text-[72px] leading-[0.98] font-semibold tracking-tight text-ink">
          Drop a sales call.
          <br />
          <span className="text-accent">Five Opus 4.7 agents</span> handle the rest.
        </h1>

        <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          BridgeFlow Operator is an autonomous 5-agent sales floor. Paste a transcript or drop a call recording — Claude Opus 4.7 qualifies the lead, drafts a personalised campaign, fires Telegram + Resend, and self-reviews. Built in late nights for the{" "}
          <a href={HACKATHON_URL} className="text-accent underline decoration-accent/40 hover:decoration-accent">
            Built-with-4.7 hackathon
          </a>
          .
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/pipeline"
            className="group inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-accent text-bg font-semibold text-sm shadow-glow-accent hover:bg-accent/90 transition-colors cursor-pointer"
          >
            Open App
            <IconChevron className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-border bg-surface text-ink hover:bg-surface-2 font-medium text-sm transition-colors cursor-pointer"
          >
            <IconLogo className="w-4 h-4 text-accent" />
            View on GitHub
          </a>
          <a
            href={HACKATHON_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-border bg-surface text-ink-muted hover:text-ink hover:bg-surface-2 font-medium text-sm transition-colors cursor-pointer"
          >
            <IconSparkle className="w-4 h-4 text-accent" />
            Submit / View Hackathon
          </a>
        </div>

        <PipelinePoster />

        <SpecGrid />

        <Footer />
      </div>
    </div>
  );
}

// ── Hackathon badge ─────────────────────────────────────────────────────

function Hackathon() {
  return (
    <a
      href={HACKATHON_URL}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent/[0.07] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-accent hover:bg-accent/10 transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-glow-accent animate-blink" />
      Built with Opus 4.7 · A Claude Code hackathon
      <IconChevron className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
    </a>
  );
}

// ── Credit usage badge ─────────────────────────────────────────────────
// Anthropic gave each team $500 in API credits. We burned $425.21 in 5
// days across all 5 agents + Jarvis + the workflow generator. Displaying
// it here so judges can verify "real product" vs "sketch" without having
// to open the README. Source: Anthropic console → API keys → Cost.

function CreditUsage() {
  const SPENT = 425.21;
  const BUDGET = 500;
  const pct = Math.round((SPENT / BUDGET) * 100);
  return (
    <a
      href="https://github.com/anasanrai/bridgeflow-operator#-hackathon-credit-usage"
      target="_blank"
      rel="noreferrer"
      title={`$${SPENT} of $${BUDGET} hackathon credit spent · ${pct}% — receipts in README`}
      className="group inline-flex items-center gap-2 rounded-full border border-amber-500/45 bg-amber-500/[0.06] px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-200 hover:bg-amber-500/[0.10] transition-colors"
    >
      <span className="font-semibold">${SPENT.toFixed(2)} / ${BUDGET}</span>
      <span className="opacity-70">·</span>
      <span>credit spent</span>
      <span className="ml-1 inline-flex items-center gap-1">
        <span
          className="relative w-10 h-1 rounded-full bg-amber-500/15 overflow-hidden"
          aria-hidden
        >
          <span
            className="absolute inset-y-0 left-0 bg-amber-300/90"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="text-amber-300 font-semibold">{pct}%</span>
      </span>
    </a>
  );
}

// ── Pipeline poster (5-agent visual under the hero) ─────────────────────
// Colors lifted directly from the BridgeFlow Agency design reference so
// the marketing surface and the in-app agent stream stay visually coherent.

const HERO_AGENTS: Array<{
  num: string;
  name: string;
  sub: string;
  color: string;
  glyph: string;
}> = [
  { num: "01", name: "Call Analyst", sub: "intent · budget · objections", color: "#00D4AA", glyph: "◆" },
  { num: "02", name: "Lead Qualifier", sub: "HOT / WARM / COLD", color: "#22c55e", glyph: "◈" },
  { num: "03", name: "Campaign Architect", sub: "3-touch follow-up", color: "#a78bfa", glyph: "◉" },
  { num: "04", name: "Action Executor", sub: "manifest + integrations", color: "#f59e0b", glyph: "◍" },
  { num: "05", name: "Reflection", sub: "QA + rep briefing", color: "#3b82f6", glyph: "◎" },
];

function PipelinePoster() {
  return (
    <section className="mt-14 relative">
      <div className="text-[10px] font-mono uppercase tracking-wider text-faint">
        The pipeline
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3">
        {HERO_AGENTS.map((a) => (
          <div
            key={a.num}
            className="relative rounded-xl border border-border bg-surface p-4 overflow-hidden transition-colors hover:bg-surface-2"
            style={{ borderTopColor: `${a.color}55`, borderTopWidth: 2 }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[10px] font-mono uppercase tracking-wider"
                style={{ color: a.color }}
              >
                Agent {a.num}
              </span>
              <span
                className="text-base leading-none"
                style={{ color: a.color }}
                aria-hidden
              >
                {a.glyph}
              </span>
            </div>
            <div className="mt-2 text-sm font-semibold text-ink">{a.name}</div>
            <div className="mt-1 text-[11px] text-muted leading-relaxed">
              {a.sub}
            </div>
            <div
              className="mt-3 h-px"
              style={{
                background: `linear-gradient(90deg, ${a.color}66 0%, transparent 100%)`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[11px] font-mono text-faint flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-glow-accent animate-blink" />
          single model · claude-opus-4-7
        </span>
        <span>·</span>
        <span>streaming SSE</span>
        <span>·</span>
        <span>real Resend / Telegram / HubSpot fires</span>
      </div>
    </section>
  );
}

// ── Roadmap spec grid ───────────────────────────────────────────────────

function SpecGrid() {
  const items: Array<{
    version: string;
    state: "live" | "coming" | "roadmap";
    title: string;
    bullets: string[];
  }> = [
    {
      version: "Live now",
      state: "live",
      title: "Transcript → Intelligence",
      bullets: [
        "Call recording or transcript input",
        "5 Opus 4.7 agents with live SSE",
        "Personalised emails + CRM note",
        "Telegram alert + Supabase persistence",
      ],
    },
    {
      version: "Live now",
      state: "live",
      title: "Intelligence → Action",
      bullets: [
        "Company identity vault (agents speak as you)",
        "In-dashboard AI consultant",
        "n8n workflow generator + validation",
        "Telegram APPROVE / EDIT / SKIP gating",
      ],
    },
    {
      version: "Coming soon",
      state: "coming",
      title: "Real Call Center",
      bullets: [
        "Inbound + outbound voice agents",
        "Every call auto-feeds the 5-agent pipeline",
        "CRM connectors (HubSpot / FUB / Salesforce)",
        "Slack approvals + lead memory",
      ],
    },
    {
      version: "Roadmap",
      state: "roadmap",
      title: "Autonomous Agency",
      bullets: [
        "Per-department Opus 4.7 agents",
        "MCP-secured credential vault",
        "5/95 human-to-agent ratio",
        "Full observability + experiments",
      ],
    },
  ];

  const meta = {
    live: { tag: "LIVE", cls: "border-accent/40 text-accent bg-accent/10", glow: "ring-1 ring-accent/30" },
    coming: { tag: "COMING SOON", cls: "border-border text-muted bg-surface", glow: "" },
    roadmap: { tag: "ROADMAP", cls: "border-border text-faint bg-surface", glow: "" },
  } as const;

  return (
    <section className="mt-14">
      <div className="text-[10px] font-mono uppercase tracking-wider text-faint">
        The roadmap
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {items.map((it) => {
          const m = meta[it.state];
          return (
            <article
              key={it.version}
              className={`relative rounded-xl border border-border bg-surface p-4 ${m.glow}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono font-semibold text-ink tracking-wide">
                  {it.version}
                </span>
                <span
                  className={`inline-flex items-center text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${m.cls}`}
                >
                  {m.tag}
                </span>
              </div>
              <h3 className="mt-2 text-sm font-semibold text-ink">{it.title}</h3>
              <ul className="mt-3 space-y-1.5 text-[11px] text-ink-muted leading-relaxed">
                {it.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-accent/50 shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-16 pt-6 border-t border-border flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-faint">
      <span className="flex items-center gap-2">
        <IconTarget className="w-3 h-3 text-accent" />
        bridgeflow-operator
      </span>
      <span className="flex items-center gap-3">
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink transition-colors"
        >
          github
        </a>
        <span>·</span>
        <a
          href={HACKATHON_URL}
          target="_blank"
          rel="noreferrer"
          className="hover:text-ink transition-colors"
        >
          hackathon
        </a>
        <span>·</span>
        <Link href="/pipeline" className="text-accent hover:underline">
          launch app →
        </Link>
      </span>
    </footer>
  );
}

// ── Decorative backdrop ────────────────────────────────────────────────

function BackdropGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-32 w-[420px] h-[420px] rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute top-40 right-0 w-[320px] h-[320px] rounded-full bg-amber-500/[0.07] blur-3xl" />
      <div className="absolute inset-0 bg-dot opacity-60" />
    </div>
  );
}

// avoid unused-import lint warning when ts-prune scans
void IconPipeline;
