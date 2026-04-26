"use client";

/**
 * Jarvis — operator-side voice/text assistant overlay.
 *
 * Mounted once at the app shell so it persists across pages. Bottom-left
 * fixed avatar; tap to expand into a 380x520 chat panel. Voice in via
 * Web Speech API SpeechRecognition; voice out via SpeechSynthesis. Both
 * are 100% browser-side — no extra backend infra.
 *
 * Streaming responses come from POST /api/jarvis (SSE, mirrors the
 * /consultant pattern). Action directives like
 *   {"action":"navigate","target":"/review"}
 * embedded on their own line in the model's response are parsed and
 * executed (router.push for navigate; custom DOM events for click).
 *
 * Memory is in-session only — last 30 messages persist to localStorage
 * so a page refresh doesn't lose context.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  IconChevron,
  IconLogo,
  IconRefresh,
  IconSparkle,
  IconX,
} from "../lib/icons";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface JarvisAction {
  action: "navigate" | "click" | "run_demo";
  target?: string;
}

const STORAGE_KEY = "bridgeflow.jarvis.history.v1";
const GREETING_FLAG = "bridgeflow.jarvis.greeted.v1";
const MAX_HISTORY = 30;

const ACTION_RE = /\{\s*"action"\s*:\s*"(navigate|click|run_demo)"(?:\s*,\s*"target"\s*:\s*"([^"]+)")?\s*\}/i;

export function JarvisOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const greetedRef = useRef(false);

  // ── Hydration: load stored history once on mount ─────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        setMessages(parsed.slice(-MAX_HISTORY));
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.filter((m) => !m.streaming).slice(-MAX_HISTORY))
      );
    } catch {
      // ignore
    }
  }, [messages]);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // ── Voice output (TTS) ──────────────────────────────────────────────
  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || typeof window === "undefined") return;
      const synth = window.speechSynthesis;
      if (!synth) return;
      // Strip action JSON + markdown before speaking.
      const clean = stripForSpeech(text);
      if (!clean.trim()) return;
      try {
        synth.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        // Pick the most natural-sounding voice available.
        const voices = synth.getVoices();
        const preferred =
          voices.find((v) => /Samantha|Allison|Ava \(Premium\)|Google.*UK English Male/i.test(v.name)) ||
          voices.find((v) => v.lang.startsWith("en")) ||
          voices[0];
        if (preferred) u.voice = preferred;
        u.rate = 1.05;
        u.pitch = 1.0;
        synth.speak(u);
      } catch {
        // ignore
      }
    },
    [voiceOn]
  );

  // ── Voice input (SpeechRecognition) ─────────────────────────────────
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceErr(
        "Voice input isn't supported in this browser. Try Chrome, Edge, or Safari."
      );
      return;
    }
    setVoiceErr(null);
    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-US";
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      setInput((finalText || interim).trim());
    };
    r.onerror = (e: any) => {
      setListening(false);
      setVoiceErr(
        e.error === "not-allowed"
          ? "Microphone permission denied — enable it in browser settings."
          : `Voice error: ${e.error}`
      );
    };
    r.onend = () => {
      setListening(false);
      // Auto-send once final text is locked in
      if (finalText.trim()) {
        setInput(finalText.trim());
        // Use requestAnimationFrame to ensure state has flushed
        requestAnimationFrame(() => sendRef.current(finalText.trim()));
      }
    };
    try {
      r.start();
      recognitionRef.current = r;
      setListening(true);
    } catch (err) {
      setListening(false);
      setVoiceErr(`Could not start listening: ${(err as Error).message}`);
    }
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, []);

  // ── Action directive parsing ────────────────────────────────────────
  const executeAction = useCallback(
    (action: JarvisAction) => {
      if (action.action === "navigate" && action.target) {
        if (action.target.startsWith("/")) router.push(action.target);
        return;
      }
      if (action.action === "click" && action.target) {
        // Defer one tick so navigation lands first if a route change preceded
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("jarvis:click", { detail: { target: action.target } })
          );
        }, 250);
        return;
      }
      if (action.action === "run_demo") {
        router.push("/pipeline");
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("jarvis:run_demo"));
        }, 250);
        return;
      }
    },
    [router]
  );

  // ── Send / stream a turn ────────────────────────────────────────────
  const send = useCallback(
    async (content: string, opts: { kind?: "user" | "greeting" } = {}) => {
      const trimmed = (content || "").trim();
      if (opts.kind !== "greeting" && !trimmed) return;
      if (streaming) return;

      const placeholderId = cryptoRandomId();
      if (opts.kind !== "greeting") {
        const userMsg: Msg = {
          id: cryptoRandomId(),
          role: "user",
          content: trimmed,
        };
        setMessages((prev) => [
          ...prev,
          userMsg,
          {
            id: placeholderId,
            role: "assistant",
            content: "",
            streaming: true,
          },
        ]);
        setInput("");
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: placeholderId,
            role: "assistant",
            content: "",
            streaming: true,
          },
        ]);
      }
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const r = await fetch("/api/jarvis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            kind: opts.kind ?? "user",
            current_page: pathname,
            conversation_history: messages
              .filter((m) => !m.streaming)
              .slice(-12)
              .map((m) => ({ role: m.role, content: m.content })),
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
        let assembled = "";
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let boundary = buf.indexOf("\n\n");
          while (boundary !== -1) {
            const block = buf.slice(0, boundary);
            buf = buf.slice(boundary + 2);
            boundary = buf.indexOf("\n\n");
            const dataLine = block
              .split("\n")
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trim())
              .join("");
            if (!dataLine) continue;
            try {
              const ev = JSON.parse(dataLine);
              if (ev?.type === "delta" && typeof ev.delta === "string") {
                assembled += ev.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === placeholderId
                      ? { ...m, content: m.content + ev.delta }
                      : m
                  )
                );
              } else if (ev?.type === "error") {
                throw new Error(ev.message ?? "stream error");
              }
            } catch {
              // ignore malformed frame
            }
          }
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, streaming: false } : m
          )
        );

        // Speak + execute actions once stream is fully assembled
        if (voiceOn) speak(assembled);
        const action = parseAction(assembled);
        if (action) executeAction(action);
      } catch (err) {
        if ((err as any)?.name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? {
                  ...m,
                  streaming: false,
                  content: m.content || `(error: ${(err as Error).message})`,
                }
              : m
          )
        );
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, pathname, streaming, voiceOn, speak, executeAction]
  );

  // Latest send ref so the recognizer's onend can call it without stale closure
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // ── Greeting on /dashboard, once per session ────────────────────────
  useEffect(() => {
    if (pathname !== "/dashboard") return;
    if (greetedRef.current) return;
    let alreadyGreeted = false;
    try {
      alreadyGreeted = sessionStorage.getItem(GREETING_FLAG) === "1";
    } catch {
      // ignore
    }
    if (alreadyGreeted) return;
    greetedRef.current = true;
    try {
      sessionStorage.setItem(GREETING_FLAG, "1");
    } catch {
      // ignore
    }
    setOpen(true);
    // Delay slightly so the panel mount-anim doesn't fight the SSE start
    const t = setTimeout(() => {
      void send("", { kind: "greeting" });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setStreaming(false);
    try {
      sessionStorage.removeItem(GREETING_FLAG);
    } catch {
      // ignore
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const visibleMessages = useMemo(
    () => messages.filter((m) => m.role === "user" || m.streaming || m.content),
    [messages]
  );

  return (
    <div className="fixed bottom-4 left-4 z-[60] pointer-events-none">
      <div className="pointer-events-auto">
        {open ? (
          <JarvisPanel
            messages={visibleMessages}
            input={input}
            setInput={setInput}
            send={() => void send(input)}
            streaming={streaming}
            voiceOn={voiceOn}
            setVoiceOn={setVoiceOn}
            listening={listening}
            startListening={startListening}
            stopListening={stopListening}
            voiceErr={voiceErr}
            scrollRef={scrollRef}
            onClose={() => setOpen(false)}
            onReset={reset}
            onKeyDown={onKeyDown}
          />
        ) : (
          <JarvisFab
            streaming={streaming}
            listening={listening}
            onOpen={() => setOpen(true)}
          />
        )}
      </div>
    </div>
  );
}

// ── FAB (collapsed avatar) ────────────────────────────────────────────

function JarvisFab({
  streaming,
  listening,
  onOpen,
}: {
  streaming: boolean;
  listening: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      title="Ask Jarvis"
      aria-label="Open Jarvis assistant"
      className="group relative w-14 h-14 rounded-full border border-accent/40 bg-bg/95 backdrop-blur shadow-glow-accent text-accent hover:text-ink hover:bg-accent/10 transition-colors cursor-pointer flex items-center justify-center"
    >
      <IconLogo className="w-6 h-6" />
      <span
        className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg ${
          listening
            ? "bg-hot animate-blink"
            : streaming
            ? "bg-warm animate-blink"
            : "bg-accent shadow-glow-accent"
        }`}
      />
      <span className="absolute -inset-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="absolute inset-0 rounded-full bg-accent/15 animate-ping" />
      </span>
    </button>
  );
}

// ── Expanded chat panel ───────────────────────────────────────────────

function JarvisPanel({
  messages,
  input,
  setInput,
  send,
  streaming,
  voiceOn,
  setVoiceOn,
  listening,
  startListening,
  stopListening,
  voiceErr,
  scrollRef,
  onClose,
  onReset,
  onKeyDown,
}: {
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  send: () => void;
  streaming: boolean;
  voiceOn: boolean;
  setVoiceOn: (v: boolean) => void;
  listening: boolean;
  startListening: () => void;
  stopListening: () => void;
  voiceErr: string | null;
  scrollRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onReset: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <section
      role="dialog"
      aria-label="Jarvis assistant"
      className="w-[380px] h-[520px] rounded-2xl border border-accent/35 bg-bg/95 backdrop-blur-xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(0,212,170,0.18)] flex flex-col overflow-hidden animate-fade-in-up"
    >
      <header className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-bg/60">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`relative w-8 h-8 rounded-full bg-accent/15 border border-accent/40 text-accent flex items-center justify-center ${
              streaming ? "shadow-glow-accent" : ""
            }`}
          >
            <IconLogo className="w-4 h-4" />
            {(streaming || listening) && (
              <span className="absolute inset-0 rounded-full">
                <span className={`absolute inset-0 rounded-full ${listening ? "bg-hot/30" : "bg-accent/30"} animate-ping`} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink leading-tight">Jarvis</div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-faint leading-tight">
              {listening
                ? "listening…"
                : streaming
                ? "thinking…"
                : "claude opus 4.7"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setVoiceOn(!voiceOn)}
            title={voiceOn ? "Mute voice output" : "Unmute voice output"}
            aria-label="Toggle voice"
            className={`w-7 h-7 rounded-md border flex items-center justify-center cursor-pointer transition-colors ${
              voiceOn
                ? "border-accent/40 text-accent bg-accent/10"
                : "border-border text-muted bg-bg hover:text-ink hover:bg-surface-2"
            }`}
          >
            <SpeakerGlyph muted={!voiceOn} />
          </button>
          <button
            onClick={onReset}
            title="Reset conversation"
            aria-label="Reset"
            className="w-7 h-7 rounded-md border border-border text-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center cursor-pointer transition-colors"
          >
            <IconRefresh className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="w-7 h-7 rounded-md border border-border text-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center cursor-pointer transition-colors"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-3">
        {messages.length === 0 ? (
          <EmptyState onPick={(q) => setInput(q)} />
        ) : (
          messages.map((m) => <Bubble key={m.id} msg={m} />)
        )}
      </div>

      {voiceErr && (
        <div className="px-4 py-2 border-t border-hot/30 bg-hot/[0.05] text-[11px] text-hot">
          {voiceErr}
        </div>
      )}

      <div className="px-3 py-2.5 border-t border-border bg-bg/40">
        <div className="flex items-end gap-2">
          <button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={() => listening && stopListening()}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            disabled={streaming}
            aria-pressed={listening}
            title="Press and hold to speak"
            className={`shrink-0 w-9 h-9 rounded-md border flex items-center justify-center cursor-pointer transition-colors ${
              listening
                ? "border-hot/45 bg-hot/15 text-hot animate-blink"
                : "border-border bg-bg text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-40"
            }`}
          >
            <MicGlyph />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={streaming}
            placeholder={listening ? "listening…" : "Ask anything · ⏎ to send"}
            rows={1}
            className="flex-1 resize-none rounded-md bg-bg border border-border px-3 py-2 text-[13px] leading-5 text-ink placeholder:text-faint focus:outline-none focus:border-accent/50 transition-colors max-h-32"
          />
          <button
            onClick={send}
            disabled={streaming || input.trim().length === 0}
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-accent text-bg hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed shadow-glow-accent cursor-pointer transition-colors"
          >
            <IconChevron className="w-4 h-4 -rotate-90" />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Bubbles ───────────────────────────────────────────────────────────

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
  const cleaned = stripActionJson(msg.content);
  return (
    <div className="flex items-start gap-2">
      <div className="w-7 h-7 rounded-md bg-accent/10 border border-accent/30 text-accent flex items-center justify-center shrink-0 mt-0.5">
        <IconSparkle className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-xl rounded-tl-sm bg-bg/60 border border-border px-3 py-2 text-[13px] text-ink-muted leading-relaxed whitespace-pre-wrap">
          {cleaned ||
            (msg.streaming ? (
              <DotsTyping />
            ) : (
              <span className="text-faint italic">(no response)</span>
            ))}
          {msg.streaming && cleaned && (
            <span className="inline-block w-1 h-3.5 ml-0.5 align-middle bg-accent animate-blink" />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const samples = [
    "What's the state of the system right now?",
    "Any leads waiting for my approval?",
    "Open the V2 workflow tab",
    "Run the demo pipeline",
  ];
  return (
    <div className="text-center py-2">
      <div className="text-[12px] text-muted leading-relaxed">
        Ask anything. I have live context: integrations, runs, leads, queue.
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {samples.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="text-[11px] px-2 py-1 rounded-md border border-border bg-bg hover:bg-surface-2 text-muted hover:text-ink transition-colors cursor-pointer text-left"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseAction(text: string): JarvisAction | null {
  const m = text.match(ACTION_RE);
  if (!m) return null;
  return { action: m[1] as any, target: m[2] };
}

function stripActionJson(text: string): string {
  return text.replace(ACTION_RE, "").replace(/\n{3,}/g, "\n\n").trim();
}

function stripForSpeech(text: string): string {
  // For TTS — strip action JSON, markdown markers, code fences. Keep
  // sentence rhythm so the voice sounds natural.
  let out = stripActionJson(text);
  out = out.replace(/```[\s\S]*?```/g, "");        // code fences
  out = out.replace(/`([^`]+)`/g, "$1");            // inline code
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");      // bold
  out = out.replace(/\*([^*]+)\*/g, "$1");          // italic
  out = out.replace(/^#{1,6}\s+/gm, "");            // headings
  out = out.replace(/^[-*]\s+/gm, "");              // bullets
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // links
  return out;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

// ── Inline glyphs ────────────────────────────────────────────────────

function SpeakerGlyph({ muted = false }: { muted?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      {muted ? (
        <>
          <path d="M22 9l-6 6" />
          <path d="M16 9l6 6" />
        </>
      ) : (
        <>
          <path d="M16 9a4 4 0 0 1 0 6" />
          <path d="M19 6a8 8 0 0 1 0 12" />
        </>
      )}
    </svg>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M9 21h6" />
    </svg>
  );
}

function DotsTyping() {
  return (
    <span className="inline-flex items-center gap-1 text-faint">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-blink" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-blink" style={{ animationDelay: "120ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-blink" style={{ animationDelay: "240ms" }} />
    </span>
  );
}
