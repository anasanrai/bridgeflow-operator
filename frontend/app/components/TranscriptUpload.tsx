"use client";

import { useEffect, useRef, useState } from "react";
import { IconChevron, IconPlay, IconRefresh, IconSparkle, IconUpload } from "../lib/icons";
import { clearPersisted, loadPersisted, savePersisted } from "../lib/persist";

const DRAFT_KEY = "bridgeflow.pipeline.transcript_draft.v1";

interface Props {
  running: boolean;
  onRun: (transcript: string) => void;
  onReset: () => void;
}

type Demo = {
  id: string;
  label: string;
  vibe: string;
  expected: "HOT" | "WARM" | "COLD";
  transcript: string;
};

const DEMOS: Demo[] = [
  {
    id: "real-estate-hot",
    label: "Real estate · HOT",
    vibe: "Texas team, leaking $20k/mo from slow follow-up. Wants pilot.",
    expected: "HOT",
    transcript: `Agent: Hey Jake, thanks for jumping on a quick call. You mentioned on the form you're running a real estate team in Texas — tell me what's happening.

Prospect: Hey Marcus, thanks for jumping on. Yeah so I run a team out of Frisco. I've got three agents and we're all sharing one CRM and nobody knows who's supposed to follow up. Last month I lost a deal — guy was ready to buy in Plano — just because nobody called him back for three days. That one was probably a $650,000 home.

Agent: Ouch. How often is that happening?

Prospect: I'd say we probably drop two maybe three leads a month just from slow follow-up. Which at our average price point is brutal.

Agent: Have you tried anything to fix it?

Prospect: We tried Follow Up Boss for a while but it still needed someone to actually do the follow-up. We need something that does the follow-up automatically, qualifies the lead, and tells us who to call first.

Agent: That's exactly what we build. One question — what does something like this cost you if you don't fix it by end of quarter?

Prospect: Honestly probably another $15k-$20k in lost commission. I'd be open to a pilot if it's not too expensive upfront.

Agent: Let's do a proper working session — I'll show you exactly what we'd build for your team and you can decide if it's worth it. Thursday 2pm work?

Prospect: Thursday 2pm works. My partner David would need to be in that conversation though — he signs off on anything over five grand. Email me at jake@frisco-realty.com and include him, david@frisco-realty.com.

Agent: Perfect. Sending the calendar invite now. Talk Thursday.`,
  },
  {
    id: "med-spa-warm",
    label: "Med spa · WARM",
    vibe: "6-location chain, owner curious but procurement is slow.",
    expected: "WARM",
    transcript: `Agent: Hi Sara, thanks for the demo time. You mentioned a med spa group on the form — how many locations?

Prospect: Six right now, two more opening this fall. I'm based in Miami, the others are spread across south Florida.

Agent: What pulled you to look at us?

Prospect: My front desk team can't keep up with the lead inflow. We get maybe 80 inbounds a week across all locations and probably half of those never hear back the same day. Some never hear back at all.

Agent: What's that costing you?

Prospect: Hard to say exactly. Average treatment package is around $2,400. If even ten of those slip through a week we're losing real money. But honestly the bigger issue is brand — when someone DMs us and we ghost them, that becomes a Google review.

Agent: Makes sense. What's stopping you from solving it today?

Prospect: We tried two assistants. Both worked for like a month then quality dropped. I'm a little burned out on point solutions. I'd want to see this run for two weeks before I committed any real budget.

Agent: Totally fair. Want to do a paid 14-day pilot? You bring real inbound, we wire it through the pipeline, and we both look at the numbers at day 15.

Prospect: That could work. I'd have to run it past my partner Marco — he handles operations. Send the pilot terms to sara@glowmd-spa.com and CC marco@glowmd-spa.com. We're not in a hurry but I'm interested.

Agent: I'll have a one-pager in your inbox by tomorrow. Thanks Sara.`,
  },
  {
    id: "saas-cold",
    label: "SaaS founder · COLD",
    vibe: "Solo founder, no budget, just researching the space.",
    expected: "COLD",
    transcript: `Agent: Hey Daniel, thanks for booking. Tell me what you're working on.

Prospect: I'm building a B2B SaaS in the legal-tech space. Pre-seed, two months in. Mostly building right now, not selling yet.

Agent: Got it. What made you book a call with us?

Prospect: Honestly I'm just researching. I saw your post on X about the agent pipeline and thought it looked cool. I might want something like this in 6 to 12 months when we have real inbound, but right now I have maybe two demos a month — I can handle those myself.

Agent: Fair. What does your sales motion look like today?

Prospect: It's just me. I do everything — outbound LinkedIn, demos, follow-up, contracts. Once we have real revenue I'll hire someone, but we're not there.

Agent: Sounds like the timing isn't right. Want me to send you our quarterly product update so you can revisit when volume picks up?

Prospect: Yeah that'd be great, danjones@example.com. Appreciate you not pitching me.

Agent: Of course. Talk in a quarter.`,
  },
];

const DEFAULT_DEMO = DEMOS[0];

export function TranscriptUpload({ running, onRun, onReset }: Props) {
  const [value, setValue] = useState("");
  const [demoOpen, setDemoOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const demoMenuRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  // Restore the in-progress draft on mount so leaving /pipeline doesn't
  // erase what the operator pasted. Cleared by Reset.
  useEffect(() => {
    const draft = loadPersisted<string>(DRAFT_KEY);
    if (typeof draft === "string" && draft) setValue(draft);
    hydratedRef.current = true;
  }, []);

  // Persist on every change after hydration.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (value) savePersisted(DRAFT_KEY, value);
    else clearPersisted(DRAFT_KEY);
  }, [value]);

  const loadDemo = (demo: Demo) => {
    setValue(demo.transcript);
    setDemoOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const onResetClick = () => {
    setValue("");
    clearPersisted(DRAFT_KEY);
    onReset();
  };

  // Click-outside to close the demo dropdown.
  useEffect(() => {
    if (!demoOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!demoMenuRef.current?.contains(e.target as Node)) setDemoOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [demoOpen]);

  // Jarvis: "run the demo" → load default demo + run in one shot.
  useEffect(() => {
    const onRunDemo = () => {
      if (running) return;
      setValue(DEFAULT_DEMO.transcript);
      // Defer one tick so the input shows the loaded transcript before we
      // immediately fire onRun with the full string (state update vs. event).
      setTimeout(() => onRun(DEFAULT_DEMO.transcript), 80);
    };
    window.addEventListener("jarvis:run_demo", onRunDemo);
    return () => window.removeEventListener("jarvis:run_demo", onRunDemo);
  }, [running, onRun]);

  const handleFile = async (file: File) => {
    const text = await file.text();
    setValue(text);
  };

  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Sales call transcript</h2>
            <span className="text-[10px] font-mono text-faint px-1.5 py-0.5 rounded border border-border">
              input
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Paste, drop a .txt file, or run the packaged demo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div ref={demoMenuRef} className="relative">
            <button
              onClick={() => setDemoOpen((v) => !v)}
              disabled={running}
              aria-expanded={demoOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
            >
              <IconSparkle className="w-3.5 h-3.5" />
              Load demo
              <IconChevron
                className={`w-3 h-3 transition-transform ${demoOpen ? "rotate-90" : ""}`}
              />
            </button>
            {demoOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-30 w-[280px] rounded-lg border border-border bg-surface shadow-2xl overflow-hidden"
              >
                {DEMOS.map((demo) => {
                  const palette =
                    demo.expected === "HOT"
                      ? "border-hot/40 text-hot bg-hot/10"
                      : demo.expected === "WARM"
                      ? "border-amber-500/40 text-amber-200 bg-amber-500/10"
                      : "border-cold/40 text-cold bg-cold/10";
                  return (
                    <button
                      key={demo.id}
                      role="menuitem"
                      onClick={() => loadDemo(demo)}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/[0.04] border-b border-border last:border-b-0 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[12px] font-semibold text-ink">
                          {demo.label}
                        </span>
                        <span
                          className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${palette}`}
                        >
                          {demo.expected}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted leading-relaxed">
                        {demo.vibe}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <label
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink cursor-pointer transition-colors ${
              running ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            <IconUpload className="w-3.5 h-3.5" />
            Upload
            <input
              type="file"
              accept=".txt,.md,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={running}
          placeholder="Agent: Hey...&#10;Prospect: ..."
          spellCheck={false}
          className="w-full h-56 resize-y rounded-lg bg-bg border border-border p-3.5 text-[13px] leading-relaxed font-mono text-ink placeholder:text-faint focus:outline-none focus:border-accent/40 transition-colors scrollbar-thin"
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="font-mono">{value.length.toLocaleString()} chars</span>
            <span className="w-px h-3 bg-border" />
            <span className="font-mono">{wordCount.toLocaleString()} words</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onResetClick}
              disabled={running}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-md border border-border bg-bg hover:bg-surface-2 text-muted hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
            >
              <IconRefresh className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={() => onRun(value.trim())}
              disabled={running || value.trim().length < 20}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-md bg-accent text-bg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-accent transition-all duration-200 cursor-pointer"
            >
              <IconPlay className="w-3.5 h-3.5" />
              {running ? "Running…" : "Run pipeline"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
