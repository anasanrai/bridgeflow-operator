"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconX } from "../lib/icons";

type Config = {
  anthropic: boolean;
  supabase: boolean;
  resend: boolean;
  telegram: boolean;
};

const LABELS: Array<{ key: keyof Config; name: string; env: string }> = [
  { key: "anthropic", name: "Anthropic", env: "ANTHROPIC_API_KEY" },
  { key: "supabase", name: "Supabase", env: "SUPABASE_URL" },
  { key: "resend", name: "Resend", env: "RESEND_API_KEY" },
  { key: "telegram", name: "Telegram", env: "TELEGRAM_BOT_TOKEN" },
];

export function CredentialStatus() {
  const [cfg, setCfg] = useState<Config | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setCfg(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const connected = cfg
    ? LABELS.filter((l) => cfg[l.key]).length
    : 0;

  return (
    <div className="border-t border-border p-3 space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
          Integrations
        </div>
        {cfg && (
          <div className="text-[10px] font-mono text-muted">
            {connected}/{LABELS.length}
          </div>
        )}
      </div>
      <ul className="space-y-0.5">
        {LABELS.map((l) => {
          const ok = cfg?.[l.key] ?? false;
          return (
            <li
              key={l.key}
              title={l.env}
              className="flex items-center gap-2 px-1.5 py-1 rounded text-[11px]"
            >
              <span
                className={`w-4 h-4 rounded-sm flex items-center justify-center ${
                  ok
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-surface text-faint border border-border"
                }`}
              >
                {ok ? <IconCheck className="w-3 h-3" /> : <IconX className="w-2.5 h-2.5" />}
              </span>
              <span className={ok ? "text-ink-muted" : "text-faint"}>{l.name}</span>
              <span className="ml-auto font-mono text-[10px] text-faint truncate">
                {ok ? "live" : "—"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
