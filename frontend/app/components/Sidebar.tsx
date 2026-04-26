"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconBuilding,
  IconClock,
  IconDashboard,
  IconHourglass,
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
  { href: "/pipeline", label: "Pipeline", icon: IconPipeline, shortcut: "G P" },
  { href: "/review", label: "Human Review", icon: IconHourglass, shortcut: "G R" },
  { href: "/leads", label: "Leads", icon: IconLeads, shortcut: "G L" },
  { href: "/history", label: "History", icon: IconClock, shortcut: "G H" },
  { href: "/dashboard", label: "Dashboard", icon: IconDashboard, shortcut: "G D" },
];

type Completeness = "complete" | "partial" | "empty";

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [completeness, setCompleteness] = useState<Completeness>("empty");
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Refetch completeness on every nav change so the dot updates after the
  // user saves on /settings/company.
  useEffect(() => {
    let abort = false;
    fetch("/api/company-profile", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { profile: null }))
      .then((data) => {
        if (abort) return;
        setCompleteness(profileCompleteness(data?.profile));
      })
      .catch(() => {
        if (!abort) setCompleteness("empty");
      });
    return () => {
      abort = true;
    };
  }, [pathname]);

  // Pending-approval count for the Human Review badge — refresh on nav,
  // then poll every 15s so it stays in sync with Telegram/dashboard actions.
  useEffect(() => {
    let abort = false;
    const tick = () =>
      fetch("/api/approvals?status=pending&limit=99", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { count: 0 }))
        .then((data) => {
          if (!abort) setPendingCount(Number(data?.count ?? 0));
        })
        .catch(() => {
          if (!abort) setPendingCount(0);
        });
    tick();
    const id = setInterval(tick, 15_000);
    return () => {
      abort = true;
      clearInterval(id);
    };
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
                {item.href === "/review" && pendingCount > 0 && (
                  <span
                    title={`${pendingCount} pending approval${pendingCount === 1 ? "" : "s"}`}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-mono font-semibold bg-amber-500/15 border border-amber-500/45 text-amber-200 shadow-glow-warm"
                  >
                    {pendingCount}
                  </span>
                )}
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
          <Link
            href="/settings/company"
            className={`group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
              isActive(pathname, "/settings/company")
                ? "bg-white/[0.04] text-ink"
                : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
            }`}
          >
            <IconBuilding
              className={`w-4 h-4 transition-colors ${
                isActive(pathname, "/settings/company")
                  ? "text-accent"
                  : "text-muted group-hover:text-ink"
              }`}
            />
            <span className="flex-1 text-left">Company</span>
            <CompletenessDot value={completeness} />
          </Link>
          <Link
            href="/settings/ai"
            className={`group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
              isActive(pathname, "/settings/ai")
                ? "bg-white/[0.04] text-ink"
                : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
            }`}
          >
            <IconLogo
              className={`w-4 h-4 transition-colors ${
                isActive(pathname, "/settings/ai")
                  ? "text-accent"
                  : "text-muted group-hover:text-ink"
              }`}
            />
            <span className="flex-1 text-left">AI Agent</span>
            <span className="text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
              beta
            </span>
          </Link>
          <Link
            href="/settings/credentials"
            className={`group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
              isActive(pathname, "/settings/credentials")
                ? "bg-white/[0.04] text-ink"
                : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
            }`}
          >
            <IconKey
              className={`w-4 h-4 transition-colors ${
                isActive(pathname, "/settings/credentials")
                  ? "text-accent"
                  : "text-muted group-hover:text-ink"
              }`}
            />
            <span className="flex-1 text-left">Credentials</span>
          </Link>
          <Link
            href="/settings/general"
            className={`group flex items-center gap-3 px-2.5 py-2 rounded-md text-sm transition-colors cursor-pointer ${
              isActive(pathname, "/settings/general")
                ? "bg-white/[0.04] text-ink"
                : "text-ink-muted hover:text-ink hover:bg-white/[0.03]"
            }`}
          >
            <IconSettings
              className={`w-4 h-4 transition-colors ${
                isActive(pathname, "/settings/general")
                  ? "text-accent"
                  : "text-muted group-hover:text-ink"
              }`}
            />
            <span className="flex-1 text-left">Settings</span>
          </Link>
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

const REQUIRED_FIELDS = [
  "company_name",
  "industry",
  "what_you_sell",
  "target_client",
  "agent_name",
  "agent_tone",
  "pricing_notes",
] as const;

const OPTIONAL_FIELDS = [
  "agent_persona",
  "objection_1_q",
  "objection_1_a",
  "objection_2_q",
  "objection_2_a",
  "objection_3_q",
  "objection_3_a",
  "booking_link",
  "custom_instructions",
] as const;

export function profileCompleteness(profile: any): Completeness {
  if (!profile) return "empty";
  const filled = (k: string) => {
    const v = profile?.[k];
    return typeof v === "string" && v.trim().length > 0;
  };
  const reqFilled = REQUIRED_FIELDS.filter(filled).length;
  const optFilled = OPTIONAL_FIELDS.filter(filled).length;
  if (reqFilled === REQUIRED_FIELDS.length && optFilled >= 3) return "complete";
  if (reqFilled === 0 && optFilled === 0) return "empty";
  return "partial";
}

function CompletenessDot({ value }: { value: Completeness }) {
  const meta = {
    complete: { cls: "bg-accent shadow-glow-accent", title: "Company profile complete" },
    partial: { cls: "bg-amber-400", title: "Company profile partially filled" },
    empty: { cls: "bg-hot/80 shadow-glow-hot", title: "Company profile is empty" },
  } as const;
  const m = meta[value];
  return <span title={m.title} className={`w-1.5 h-1.5 rounded-full ${m.cls}`} />;
}
