"use client";

import { usePathname } from "next/navigation";
import { IconChevron, IconSparkle } from "../lib/icons";

const PAGE_TITLES: Record<string, { title: string; desc: string }> = {
  "/": { title: "Pipeline", desc: "Run a call through 5 Opus 4.7 agents" },
  "/leads": { title: "Leads", desc: "Every prospect that touched the pipeline" },
  "/dashboard": { title: "Dashboard", desc: "Operator health at a glance" },
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

        <div className="flex items-center gap-2">
          <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border border-accent/30 bg-accent/5 text-accent">
            <IconSparkle className="w-3 h-3" />
            Opus 4.7
          </span>
          <a
            href="https://github.com/anthropics/claude-code"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] px-2 py-1 rounded-md border border-border hover:border-border-strong bg-surface text-muted hover:text-ink transition-colors cursor-pointer"
          >
            Docs
          </a>
        </div>
      </div>
    </header>
  );
}
