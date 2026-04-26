"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChevron, IconSparkle } from "../lib/icons";

const PAGE_TITLES: Record<string, { title: string; desc: string }> = {
  "/": { title: "Pipeline", desc: "Run a call through 5 Opus 4.7 agents" },
  "/leads": { title: "Leads", desc: "Every prospect that touched the pipeline" },
  "/dashboard": { title: "Dashboard", desc: "Operator health at a glance" },
};

// Three version tabs — V1 Live / V2 Building / V3-V5 Vision. Mobile-hidden
// to keep the breadcrumb readable on small screens. Vision tab links to
// /roadmap so judges can see the architect-from-V5 thinking in one click.
const VERSION_TABS: Array<{
  label: string;
  sub: string;
  href: string;
  state: "live" | "building" | "vision";
}> = [
  { label: "V1", sub: "Live now", href: "/dashboard", state: "live" },
  { label: "V2", sub: "Building", href: "/pipeline", state: "building" },
  { label: "V3–V5", sub: "Vision", href: "/roadmap", state: "vision" },
];

const VERSION_TONE: Record<string, string> = {
  live: "border-accent/40 text-accent bg-accent/10",
  building: "border-amber-500/40 text-amber-200 bg-amber-500/10",
  vision: "border-purple-500/40 text-purple-300 bg-purple-500/10",
};

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const meta = PAGE_TITLES[pathname] ?? {
    title: pathname.replace("/", "").replace(/-/g, " ") || "Operator",
    desc: "",
  };

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="max-w-[1400px] mx-auto h-full px-6 lg:px-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0 pl-10 lg:pl-0">
          <span className="text-xs text-muted truncate">Operator</span>
          <IconChevron className="w-3 h-3 text-faint shrink-0" />
          <span className="text-xs font-medium text-ink truncate capitalize">
            {meta.title}
          </span>
        </div>

        <nav
          aria-label="Version timeline"
          className="hidden lg:flex items-center gap-1 px-1 py-1 rounded-md border border-border bg-surface"
        >
          {VERSION_TABS.map((t) => {
            const tone = VERSION_TONE[t.state];
            return (
              <Link
                key={t.label}
                href={t.href}
                title={`${t.label} · ${t.sub}`}
                className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border transition-colors ${tone} hover:brightness-125`}
              >
                <span className="font-semibold">{t.label}</span>
                <span className="opacity-70">·</span>
                <span className="opacity-90">{t.sub}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border border-accent/30 bg-accent/5 text-accent">
            <IconSparkle className="w-3 h-3" />
            Opus 4.7
          </span>
          <a
            href="https://github.com/anasanrai/bridgeflow-operator#readme"
            target="_blank"
            rel="noreferrer"
            title="Open the BridgeFlow Operator README on GitHub"
            className="text-[11px] px-2 py-1 rounded-md border border-border hover:border-border-strong bg-surface text-muted hover:text-ink transition-colors cursor-pointer"
          >
            Docs
          </a>
        </div>
      </div>
    </header>
  );
}
