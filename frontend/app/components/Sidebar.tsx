"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconDashboard,
  IconKey,
  IconLeads,
  IconLogo,
  IconPipeline,
  IconSettings,
} from "../lib/icons";
import { CredentialStatus } from "./CredentialStatus";

interface NavItem {
  href: string;
  label: string;
  icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element;
  shortcut?: string;
}

const NAV: NavItem[] = [
  { href: "/", label: "Pipeline", icon: IconPipeline, shortcut: "G P" },
  { href: "/leads", label: "Leads", icon: IconLeads, shortcut: "G L" },
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard, shortcut: "G D" },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 w-9 h-9 rounded-md bg-surface border border-border text-ink-muted hover:text-ink flex items-center justify-center"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-[240px] shrink-0 border-r border-border bg-surface flex flex-col transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
      >
        <div className="px-4 py-5 border-b border-border flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 text-accent flex items-center justify-center shadow-glow-accent">
            <IconLogo className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-ink truncate">
              BridgeFlow
            </div>
            <div className="text-[11px] text-muted truncate">Operator</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4 space-y-0.5">
          <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-faint">
            Workspace
          </div>
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                  active
                    ? "bg-white/[0.04] text-ink"
                    : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    active ? "text-accent" : "text-muted group-hover:text-ink"
                  }`}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.shortcut && (
                  <span className="hidden xl:inline text-[10px] font-mono text-faint">
                    {item.shortcut}
                  </span>
                )}
                {active && <span className="w-1 h-1 rounded-full bg-accent shadow-glow-accent" />}
              </Link>
            );
          })}

          <div className="px-2 pt-5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-faint">
            System
          </div>
          <button
            type="button"
            className="w-full group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-ink-muted hover:text-ink hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <IconKey className="w-4 h-4 text-muted group-hover:text-ink" />
            <span className="flex-1 text-left">Credentials</span>
          </button>
          <button
            type="button"
            className="w-full group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm text-ink-muted hover:text-ink hover:bg-white/[0.03] transition-colors cursor-pointer"
          >
            <IconSettings className="w-4 h-4 text-muted group-hover:text-ink" />
            <span className="flex-1 text-left">Settings</span>
          </button>
        </nav>

        <CredentialStatus />
      </aside>
    </>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
