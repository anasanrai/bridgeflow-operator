"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlay, IconRefresh, IconSparkle, IconUpload } from "../lib/icons";

interface Props {
  running: boolean;
  onRun: (transcript: string) => void;
  onReset: () => void;
}

const DEMO_TRANSCRIPT = `Agent: Hey Jake, thanks for jumping on a quick call. You mentioned on the form you're running a real estate team in Texas — tell me what's happening.

Prospect: Hey Marcus, thanks for jumping on. Yeah so I run a team out of Frisco. I've got three agents and we're all sharing one CRM and nobody knows who's supposed to follow up. Last month I lost a deal — guy was ready to buy in Plano — just because nobody called him back for three days. That one was probably a $650,000 home.

Agent: Ouch. How often is that happening?

Prospect: I'd say we probably drop two maybe three leads a month just from slow follow-up. Which at our average price point is brutal.

Agent: Have you tried anything to fix it?

Prospect: We tried Follow Up Boss for a while but it still needed someone to actually do the follow-up. We need something that does the follow-up automatically, qualifies the lead, and tells us who to call first.

Agent: That's exactly what we build. One question — what does something like this cost you if you don't fix it by end of quarter?

Prospect: Honestly probably another $15k-$20k in lost commission. I'd be open to a pilot if it's not too expensive upfront.

Agent: Let's do a proper working session — I'll show you exactly what we'd build for your team and you can decide if it's worth it. Thursday 2pm work?

Prospect: Thursday 2pm works. My partner David would need to be in that conversation though — he signs off on anything over five grand. Email me at jake@frisco-realty.com and include him, david@frisco-realty.com.

Agent: Perfect. Sending the calendar invite now. Talk Thursday.`;

export function TranscriptUpload({ running, onRun, onReset }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadDemo = () => {
    setValue(DEMO_TRANSCRIPT);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // Jarvis: "run the demo" → load + run in one shot.
  useEffect(() => {
    const onRunDemo = () => {
      if (running) return;
      setValue(DEMO_TRANSCRIPT);
      // Defer one tick so the input shows the loaded transcript before we
      // immediately fire onRun with the full string (state update vs. event).
      setTimeout(() => onRun(DEMO_TRANSCRIPT), 80);
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
          <button
            onClick={loadDemo}
            disabled={running}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border bg-bg hover:bg-surface-2 text-ink-muted hover:text-ink disabled:opacity-40 transition-colors cursor-pointer"
          >
            <IconSparkle className="w-3.5 h-3.5" />
            Load demo
          </button>
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
              onClick={onReset}
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
