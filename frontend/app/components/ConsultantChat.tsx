"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconChat,
  IconCopy,
  IconLock,
  IconRefresh,
  IconSparkle,
} from "../lib/icons";
import { PipelineResults } from "../lib/types";

interface Props {
  pipelineId: string | null;
  results: PipelineResults | null;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

export function ConsultantChat({ pipelineId, results }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset chat when the pipeline run changes
  useEffect(() => {
    setMessages([]);
    setInput("");
    setError(null);
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }, [pipelineId]);

  // Keep scroll pinned to bottom while streaming
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || !pipelineId || streaming) return;
    setError(null);
    setInput("");

    const userMsg: Msg = { id: cryptoRandomId(), role: "user", content: trimmed };
    const placeholderId = cryptoRandomId();
    const assistantStub: Msg = {
      id: placeholderId,
      role: "assistant",
      content: "",
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantStub]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch("/api/consultant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_id: pipelineId,
          message: trimmed,
          conversation_history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const text = await r.text().catch(() => "");
        throw new Error(`Backend ${r.status}: ${text.slice(0, 200)}`);
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let boundary = buf.indexOf("\n\n");
        while (boundary !== -1) {
          const evt = buf.slice(0, boundary);
          buf = buf.slice(boundary + 2);
          boundary = buf.indexOf("\n\n");
          const dataLine = evt
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("");
          if (!dataLine) continue;
          try {
            const ev = JSON.parse(dataLine);
            if (ev?.type === "delta" && typeof ev.delta === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId ? { ...m, content: m.content + ev.delta } : m
                )
              );
            } else if (ev?.type === "error") {
              throw new Error(ev.message ?? "stream error");
            }
          } catch {
            // ignore malformed frames
          }
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId ? { ...m, streaming: false } : m
        )
      );
    } catch (err) {
      if ((err as any)?.name === "AbortError") return;
      setError((err as Error).message);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === placeholderId
            ? { ...m, streaming: false, content: m.content || "(no response)" }
            : m
        )
      );
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setStreaming(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const ctx = useContextPill(results);

  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair overflow-hidden flex flex-col">
      <header className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/30 text-accent flex items-center justify-center">
            <IconChat className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Ask about this result</h2>
            <p className="text-[11px] text-muted">
              Claude has full context of this pipeline run.
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md border border-border bg-bg hover:bg-surface-2 text-muted hover:text-ink cursor-pointer"
          >
            <IconRefresh className="w-3 h-3" />
            New thread
          </button>
        )}
      </header>

      {ctx && <ContextPill {...ctx} />}

      <div ref={scrollRef} className="flex-1 max-h-[420px] overflow-y-auto scrollbar-thin px-5 py-4 space-y-3">
        {messages.length === 0 ? (
          <EmptyState onSuggest={(q) => setInput(q)} disabled={!pipelineId} />
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
      </div>

      {error && (
        <div className="px-5 py-2 border-t border-hot/30 bg-hot/5 text-[11px] text-hot">
          {error}
        </div>
      )}

      <div className="px-4 py-3 border-t border-border bg-bg/30">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!pipelineId || streaming}
            rows={2}
            placeholder={
              !pipelineId
                ? "Run a pipeline first to chat with the consultant."
                : "Why was this scored WARM? · Rewrite email 1 to be more casual · What's the risk with this lead?"
            }
            className="flex-1 resize-y rounded-md bg-bg border border-border px-3 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent/45 transition-colors scrollbar-thin"
          />
          <button
            onClick={send}
            disabled={!pipelineId || streaming || input.trim().length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-md bg-accent text-bg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-accent cursor-pointer"
          >
            {streaming ? "…" : "Ask"}
          </button>
        </div>
      </div>

      <LockedConsultantActions />
    </section>
  );
}

// ── Bubbles ─────────────────────────────────────────────────────────────

function Bubble({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-bg border border-border px-3 py-2 text-[13px] text-ink leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/30 text-accent flex items-center justify-center shrink-0">
        <IconSparkle className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl rounded-tl-sm bg-bg/60 border border-border px-3 py-2 text-[13px] text-ink-muted leading-relaxed whitespace-pre-wrap">
          {msg.content || (msg.streaming ? <StreamingDots /> : <span className="text-faint italic">(no response)</span>)}
          {msg.streaming && msg.content && <span className="inline-block w-1 h-3.5 ml-0.5 align-middle bg-accent animate-blink" />}
        </div>
        {!msg.streaming && msg.content && <CopyButton text={msg.content} />}
      </div>
    </div>
  );
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-faint">
      <span className="w-1 h-1 rounded-full bg-current animate-blink" style={{ animationDelay: "0ms" }} />
      <span className="w-1 h-1 rounded-full bg-current animate-blink" style={{ animationDelay: "120ms" }} />
      <span className="w-1 h-1 rounded-full bg-current animate-blink" style={{ animationDelay: "240ms" }} />
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // ignore
        }
      }}
      className={`mt-1 inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
        copied
          ? "border-accent/40 text-accent bg-accent/10"
          : "border-border text-faint hover:text-ink hover:bg-bg"
      }`}
    >
      <IconCopy className="w-3 h-3" />
      {copied ? "copied" : "copy"}
    </button>
  );
}

// ── Empty state with suggestions ────────────────────────────────────────

function EmptyState({
  onSuggest,
  disabled,
}: {
  onSuggest: (q: string) => void;
  disabled: boolean;
}) {
  const samples = [
    "Why was this scored the way it was?",
    "Rewrite email 1 to be more casual",
    "What's the biggest risk with this lead?",
    "Summarize what the rep should do before the next call",
  ];
  return (
    <div className="text-center py-6">
      <div className="text-[12px] text-muted leading-relaxed max-w-md mx-auto">
        Claude has read every agent output, the transcript, and the action
        manifest. Ask anything.
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
        {samples.map((s) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onSuggest(s)}
            className="text-[11px] px-2 py-1 rounded-md border border-border bg-bg hover:bg-surface-2 text-muted hover:text-ink disabled:opacity-40 cursor-pointer"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Context pill ────────────────────────────────────────────────────────

function useContextPill(results: PipelineResults | null) {
  if (!results) return null;
  const prospect = (results as any).call_analysis?.prospect ?? {};
  const qualification = (results as any).qualification ?? {};
  const name = prospect.name ?? "Unknown";
  const company = prospect.company ?? "Unknown";
  const score = String(qualification.score ?? "").toUpperCase();
  const confidence =
    typeof qualification.confidence === "number"
      ? `${qualification.confidence}%`
      : null;
  return { name, company, score, confidence };
}

function ContextPill({
  name,
  company,
  score,
  confidence,
}: {
  name: string;
  company: string;
  score: string;
  confidence: string | null;
}) {
  const tone =
    score === "HOT"
      ? "border-hot/40 text-hot bg-hot/10"
      : score === "WARM"
      ? "border-warm/40 text-warm bg-warm/10"
      : score === "COLD"
      ? "border-cold/40 text-cold bg-cold/10"
      : "border-border text-muted bg-surface";
  return (
    <div className="px-5 py-2 border-b border-border bg-bg/30 flex flex-wrap items-center gap-2 text-[11px]">
      <span className="font-mono uppercase tracking-wider text-faint">Analyzing</span>
      <span className="text-ink-muted truncate max-w-[260px]">
        {name} @ {company}
      </span>
      {score && (
        <span className={`inline-flex items-center gap-1 font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone}`}>
          {score}
        </span>
      )}
      {confidence && <span className="font-mono text-muted">{confidence}</span>}
    </div>
  );
}

// ── V3 locked consultant actions ────────────────────────────────────────

function LockedConsultantActions() {
  const items = [
    "Rerun Agent 3 with new instructions",
    "Apply changes to all similar leads",
    "Save this consultant conversation to lead history",
  ];
  return (
    <div className="px-4 py-2.5 border-t border-amber-500/25 bg-amber-500/[0.03]">
      <div className="flex items-center gap-2 mb-1.5">
        <IconLock className="w-3 h-3 text-amber-300" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-amber-200/90">
          V3 — coming soon
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-border bg-surface/60 text-faint cursor-not-allowed select-none"
            title="Available in V3"
          >
            <IconLock className="w-2.5 h-2.5 text-amber-300/70" />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
