"use client";

/**
 * Jarvis — operator-side voice/text assistant overlay.
 *
 * Mounted once at the app shell, fixed BOTTOM-RIGHT. Click to expand
 * into a 380x520 chat. Voice in via Web Speech API SpeechRecognition;
 * voice out via either ElevenLabs streaming TTS (default, sounds like
 * a real ~40s British male) or browser SpeechSynthesis (fallback when
 * ELEVENLABS_API_KEY isn't configured server-side).
 *
 * Latency strategy: as Opus 4.7 streams text deltas, we detect sentence
 * boundaries (.!?\n) and fire a /api/tts request per sentence. Audio
 * blobs are queued and played in arrival-index order so the operator
 * starts hearing Jarvis ~600ms after the first sentence completes,
 * instead of waiting for the full 4-second response.
 *
 * Action directives like {"action":"navigate","target":"/review"}
 * embedded on their own line are parsed and executed (router.push,
 * custom DOM events).
 *
 * Memory: in-memory only. Navigation across pages keeps the chat (the
 * overlay stays mounted in the Shell), but a page refresh wipes the
 * chat and fires a fresh greeting on /dashboard. The operator wanted
 * refresh = clean slate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  IconChevron,
  IconEye,
  IconLogo,
  IconRefresh,
  IconSparkle,
  IconX,
} from "../lib/icons";
import {
  resolvePersona,
  useJarvisSettings,
} from "../lib/jarvisSettings";
import { useWakeListener } from "../lib/wakeListener";

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

// Legacy storage keys — wiped on first mount so users with older
// builds don't see stale history hydrate. No new writes happen.
const LEGACY_HISTORY_KEY = "bridgeflow.jarvis.history.v1";
const LEGACY_GREETING_FLAG = "bridgeflow.jarvis.greeted.v1";

const ACTION_RE = /\{\s*"action"\s*:\s*"(navigate|click|run_demo)"(?:\s*,\s*"target"\s*:\s*"([^"]+)")?\s*\}/i;

// "jarvis stop", "stop jarvis", "stop talking", "shut up", bare "stop", "quiet",
// "be quiet", "enough", "cancel". Lowercased + trimmed before matching.
const STOP_INTENT_RE =
  /^(?:jarvis[, ]+)?(?:stop(?:\s+(?:talking|jarvis|please|now))?|shut\s+up|be\s+quiet|quiet|enough|cancel)[.!?]?$/i;

export function JarvisOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const [settings] = useJarvisSettings();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [speakingNow, setSpeakingNow] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const greetedRef = useRef(false);

  // ── Audio queue (sentence-boundary playback) ─────────────────────────
  const audioQueueRef = useRef<Map<number, HTMLAudioElement | null>>(new Map());
  const nextPlayIndexRef = useRef(0);
  const enqueuedCountRef = useRef(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Tail of recently-spoken text — used by wake listener to filter echo
  // bleed-through (when SR re-recognizes Jarvis's own voice through the
  // speaker as if the user said it). Refreshed every sentence.
  const [speakingTail, setSpeakingTail] = useState("");

  // ── Vision (Claude Haiku 4.5 screen sense) ──────────────────────────
  // Auto-capture mode — no screen-share dialog, no permissions. When
  // settings.vision_enabled is on, every non-greeting turn snapshots the
  // current BridgeFlow tab via DOM-to-image and routes to /jarvis-vision.
  // Scope is limited to what's rendered in this app, which is the point:
  // Jarvis sees what the operator sees inside the operator console.
  const [visionErr, setVisionErr] = useState<string | null>(null);
  const [visionCapturing, setVisionCapturing] = useState(false);

  const captureFrame = useCallback(async (): Promise<string | null> => {
    if (typeof window === "undefined") return null;
    try {
      // Lazy import — keeps the chunk out of the initial bundle and avoids
      // SSR import paths.
      const mod = await import("html-to-image");
      // Capture body excluding the Jarvis overlay itself (we don't need
      // Jarvis to see Jarvis — that's a hall-of-mirrors moment).
      const dataUrl = await mod.toJpeg(document.body, {
        quality: 0.7,
        pixelRatio: 1,
        backgroundColor: "#0a0a0a",
        cacheBust: false,
        filter: (node: HTMLElement) => {
          if (!(node instanceof HTMLElement)) return true;
          if (node.dataset?.jarvisOverlay === "true") return false;
          return true;
        },
      });
      const comma = dataUrl.indexOf(",");
      return comma >= 0 ? dataUrl.slice(comma + 1) : null;
    } catch (err) {
      // Don't fail the turn — just degrade to text-only and surface a quiet
      // banner so the operator knows.
      setVisionErr(`Vision capture failed — falling back to text. ${(err as Error).message?.slice(0, 80) || ""}`);
      return null;
    }
  }, []);

  // Auto-dismiss the vision error after 4s.
  useEffect(() => {
    if (!visionErr) return;
    const t = setTimeout(() => setVisionErr(null), 4000);
    return () => clearTimeout(t);
  }, [visionErr]);

  const stopAllAudio = useCallback(() => {
    try {
      currentAudioRef.current?.pause();
      currentAudioRef.current = null;
    } catch {
      // ignore
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    audioQueueRef.current.clear();
    nextPlayIndexRef.current = 0;
    enqueuedCountRef.current = 0;
    setSpeakingNow(false);
    setSpeakingTail("");
  }, []);

  const playNextInQueue = useCallback(() => {
    const idx = nextPlayIndexRef.current;
    const audio = audioQueueRef.current.get(idx);
    if (audio === undefined) return; // not ready yet
    if (audio === null) {
      // fetch failed for this slot — skip and try next
      audioQueueRef.current.delete(idx);
      nextPlayIndexRef.current += 1;
      playNextInQueue();
      return;
    }
    currentAudioRef.current = audio;
    setSpeakingNow(true);
    audio.onended = () => {
      audioQueueRef.current.delete(idx);
      nextPlayIndexRef.current += 1;
      currentAudioRef.current = null;
      // If nothing else is queued and stream is done, mark idle.
      if (
        audioQueueRef.current.size === 0 &&
        nextPlayIndexRef.current >= enqueuedCountRef.current
      ) {
        setSpeakingNow(false);
      }
      playNextInQueue();
    };
    audio.onerror = () => {
      audioQueueRef.current.delete(idx);
      nextPlayIndexRef.current += 1;
      currentAudioRef.current = null;
      playNextInQueue();
    };
    audio.play().catch(() => {
      // Autoplay blocked — surface a message once.
      audioQueueRef.current.delete(idx);
      nextPlayIndexRef.current += 1;
      currentAudioRef.current = null;
      playNextInQueue();
    });
  }, []);

  const enqueueSentenceTTS = useCallback(
    async (sentence: string) => {
      const trimmed = sentence.trim();
      if (!trimmed) return;
      if (!settings.voice_enabled) return;

      // Update the speakingTail so the wake listener can filter echo.
      // We keep the most recent ~30 words.
      setSpeakingTail((prev) => {
        const combined = (prev + " " + trimmed).split(/\s+/).filter(Boolean);
        return combined.slice(-30).join(" ");
      });

      // Browser provider: fall back to SpeechSynthesis (no streaming, but
      // saves the operator from configuring ElevenLabs).
      if (settings.provider === "browser") {
        if (typeof window === "undefined" || !window.speechSynthesis) return;
        try {
          const u = new SpeechSynthesisUtterance(trimmed);
          const voices = window.speechSynthesis.getVoices();
          const preferred =
            voices.find((v) =>
              /Daniel|Samantha|Allison|Ava \(Premium\)|Google.*UK English Male/i.test(v.name)
            ) || voices.find((v) => v.lang.startsWith("en")) || voices[0];
          if (preferred) u.voice = preferred;
          u.rate = 1.05;
          u.onstart = () => setSpeakingNow(true);
          u.onend = () => setSpeakingNow(false);
          window.speechSynthesis.speak(u);
        } catch {
          // ignore
        }
        return;
      }

      // ElevenLabs path — fire request, queue audio at our index.
      const myIndex = enqueuedCountRef.current;
      enqueuedCountRef.current += 1;
      try {
        const resp = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: trimmed,
            voice_id: settings.voice_id || undefined,
          }),
        });
        if (!resp.ok) {
          audioQueueRef.current.set(myIndex, null);
          if (myIndex === nextPlayIndexRef.current) playNextInQueue();
          return;
        }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preload = "auto";
        audioQueueRef.current.set(myIndex, audio);
        // If this is the slot we're waiting on, kick playback.
        if (myIndex === nextPlayIndexRef.current && !currentAudioRef.current) {
          playNextInQueue();
        }
      } catch {
        audioQueueRef.current.set(myIndex, null);
        if (myIndex === nextPlayIndexRef.current) playNextInQueue();
      }
    },
    [settings.provider, settings.voice_enabled, settings.voice_id, playNextInQueue]
  );

  // ── One-time cleanup of legacy persistence ──────────────────────────
  // Earlier builds saved chat history to localStorage and a greeting
  // flag to sessionStorage. Both caused refresh to hydrate stale state.
  // Wipe them once on mount so the operator's first refresh after this
  // ships starts clean.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      sessionStorage.removeItem(LEGACY_GREETING_FLAG);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // ── Voice input (manual mic button) ─────────────────────────────────
  // When always-on is enabled, we delegate to the wake listener via
  // forceAwake() so we never spawn a second SR instance — that's what
  // was throwing "Voice error: aborted". When always-on is OFF, we fall
  // back to a temporary one-shot SR session.
  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    setVoiceErr(null);
    stopAllAudio();
    if (settings.always_on) {
      // Use the global wake listener. It's already running; just force it
      // straight into AWAKE so the user doesn't have to say the wake word.
      try {
        wakeRef.current?.forceAwake();
        setListening(true);
      } catch (err) {
        setVoiceErr(`Could not start listening: ${(err as Error).message}`);
      }
      return;
    }
    // Always-on disabled → temp SR session.
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceErr(
        "Voice input isn't supported in this browser. Try Chrome, Edge, or Safari."
      );
      return;
    }
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
      // "aborted" is a benign close (e.g. tab switched); don't alarm the user.
      if (e.error === "aborted") return;
      setVoiceErr(
        e.error === "not-allowed"
          ? "Microphone permission denied — enable it in browser settings."
          : `Voice error: ${e.error}`
      );
    };
    r.onend = () => {
      setListening(false);
      if (finalText.trim()) {
        setInput(finalText.trim());
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
  }, [stopAllAudio, settings.always_on]);

  const stopListening = useCallback(() => {
    if (settings.always_on) {
      // Manual press-and-release on the wake listener path is a no-op —
      // the listener handles end-of-utterance via its silence debounce.
      setListening(false);
      return;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    setListening(false);
  }, [settings.always_on]);

  // Auto-dismiss the voice error banner after 4s so it doesn't haunt the UI.
  useEffect(() => {
    if (!voiceErr) return;
    const t = setTimeout(() => setVoiceErr(null), 4000);
    return () => clearTimeout(t);
  }, [voiceErr]);

  // ── Action directives ───────────────────────────────────────────────
  const executeAction = useCallback(
    (action: JarvisAction) => {
      if (action.action === "navigate" && action.target) {
        if (action.target.startsWith("/")) router.push(action.target);
        return;
      }
      if (action.action === "click" && action.target) {
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

  // ── Send / stream a turn with sentence-boundary TTS ─────────────────
  const send = useCallback(
    async (content: string, opts: { kind?: "user" | "greeting" } = {}) => {
      const trimmed = (content || "").trim();
      if (opts.kind !== "greeting" && !trimmed) return;
      if (streaming) return;

      // Clear any in-flight TTS audio + stream state from prior turn.
      stopAllAudio();

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
          { id: placeholderId, role: "assistant", content: "", streaming: true },
        ]);
        setInput("");
      } else {
        setMessages((prev) => [
          ...prev,
          { id: placeholderId, role: "assistant", content: "", streaming: true },
        ]);
      }
      setStreaming(true);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Sentence-boundary buffer — we hold text until we hit .!?\n,
      // then strip the trailing newline/whitespace, fire TTS, and start
      // accumulating the next sentence.
      let pendingTtsBuffer = "";
      const flushSentence = (force = false) => {
        if (!settings.voice_enabled) return;
        // Strip JSON action directives before TTS — they're not for speaking.
        const cleaned = pendingTtsBuffer.replace(ACTION_RE, "");
        // Match a sentence ending (. ! ? or newline) — be lenient on
        // periods inside common abbreviations would be the next refinement.
        const m = cleaned.match(/^([\s\S]*?[.!?\n])([\s\S]*)$/);
        if (m) {
          const sentence = stripForSpeech(m[1]);
          pendingTtsBuffer = m[2];
          if (sentence.trim().length > 1) {
            void enqueueSentenceTTS(sentence);
          }
          // Recurse — multi-sentence chunks should all flush.
          flushSentence();
        } else if (force) {
          // End of stream — flush whatever's left.
          const tail = stripForSpeech(cleaned);
          pendingTtsBuffer = "";
          if (tail.trim().length > 1) {
            void enqueueSentenceTTS(tail);
          }
        }
      };

      // If vision is enabled, capture the live tab via DOM-to-image and
      // route through /jarvis-vision (Claude Haiku 4.5). Greetings skip
      // vision — there's no question to ground in pixels yet.
      let frame: string | null = null;
      if (settings.vision_enabled && opts.kind !== "greeting") {
        setVisionCapturing(true);
        try {
          frame = await captureFrame();
        } finally {
          setVisionCapturing(false);
        }
      }
      const targetUrl = frame ? "/api/jarvis-vision" : "/api/jarvis";
      const body: Record<string, unknown> = {
        message: trimmed,
        current_page: pathname,
        owner_identity: settings.owner_identity || undefined,
        jarvis_identity: settings.jarvis_identity || undefined,
        conversation_history: messages
          .filter((m) => !m.streaming)
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content })),
      };
      if (frame) {
        body.image_base64 = frame;
        body.image_media_type = "image/jpeg";
      } else {
        body.kind = opts.kind ?? "user";
        body.persona = resolvePersona(settings) || undefined;
      }
      try {
        const resp = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => "");
          throw new Error(`Backend ${resp.status}: ${text.slice(0, 200)}`);
        }
        const reader = resp.body.getReader();
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
                pendingTtsBuffer += ev.delta;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === placeholderId
                      ? { ...m, content: m.content + ev.delta }
                      : m
                  )
                );
                flushSentence();
              } else if (ev?.type === "error") {
                throw new Error(ev.message ?? "stream error");
              }
            } catch {
              // ignore malformed frame
            }
          }
        }
        // Final flush — anything in the buffer the model didn't terminate.
        flushSentence(true);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId ? { ...m, streaming: false } : m
          )
        );
        // Execute any embedded action directive.
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
    [
      messages,
      pathname,
      streaming,
      settings,
      executeAction,
      enqueueSentenceTTS,
      stopAllAudio,
      captureFrame,
    ]
  );

  // Latest send ref — recognizer's onend can't capture latest send via closure
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  // ── Always-on wake-word listener + barge-in ─────────────────────────
  // Aborts the in-flight LLM stream + audio when the user interrupts.
  const handleInterrupt = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    stopAllAudio();
    setStreaming(false);
  }, [stopAllAudio]);

  const wakeListener = useWakeListener({
    enabled: settings.always_on,
    wakeWord: settings.wake_word || "jarvis",
    onCommand: (cmd) => {
      const trimmed = (cmd || "").trim();
      // "jarvis stop" / "stop talking" / etc. → kill the in-flight stream
      // and audio without firing a new turn. The operator just wants quiet.
      if (STOP_INTENT_RE.test(trimmed)) {
        handleInterrupt();
        return;
      }
      // Make sure the panel is visible so the operator can see the
      // command being processed.
      setOpen(true);
      void sendRef.current(trimmed);
    },
    speakingNow,
    speakingTail,
    onInterrupt: handleInterrupt,
    bargeIn: settings.barge_in,
  });
  // Stable ref so the manual mic button can call wakeListener.forceAwake()
  // without re-creating the startListening callback on every state tick.
  const wakeRef = useRef(wakeListener);
  useEffect(() => {
    wakeRef.current = wakeListener;
  }, [wakeListener]);

  // Attempt to start the listener on mount when always-on is enabled AND
  // permission was previously granted (subsequent mounts don't need a
  // user gesture). The first-ever start needs a click — surfaced via the
  // "Enable wake word" button below.
  useEffect(() => {
    if (!settings.always_on) {
      wakeListener.stop();
      return;
    }
    if (wakeListener.unsupported) return;
    // Best-effort: try to start. If browser blocks (no prior permission),
    // we silently leave it in "off" state and the UI shows the enable
    // button.
    wakeListener.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.always_on]);

  // ── Greeting on /dashboard ──────────────────────────────────────────
  // Fires once per page load. greetedRef is in-memory only, so:
  //   - navigating /dashboard → /pipeline → /dashboard keeps the chat
  //     and does NOT re-greet (ref stays true while overlay is mounted)
  //   - hard refresh remounts the overlay, ref resets to false, fresh
  //     greeting fires
  useEffect(() => {
    if (pathname !== "/dashboard") return;
    if (greetedRef.current) return;
    greetedRef.current = true;
    setOpen(true);
    const t = setTimeout(() => {
      void send("", { kind: "greeting" });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const reset = () => {
    abortRef.current?.abort();
    stopAllAudio();
    setMessages([]);
    setInput("");
    setStreaming(false);
    greetedRef.current = false;
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

  // Wake-word state derived label (used by header + FAB).
  const wakeAwake = wakeListener.state === "awake";
  const wakeIdle = wakeListener.state === "idle";
  const wakeDot =
    listening || wakeAwake
      ? "bg-hot animate-blink shadow-glow-hot"
      : speakingNow
      ? "bg-accent animate-blink shadow-glow-accent"
      : streaming
      ? "bg-warm animate-blink"
      : wakeIdle
      ? "bg-accent shadow-glow-accent"
      : "bg-faint";

  return (
    <div
      data-jarvis-overlay="true"
      className="fixed bottom-4 right-4 z-[60] pointer-events-none"
    >
      <div className="pointer-events-auto">
        {open ? (
          <JarvisPanel
            messages={visibleMessages}
            input={input}
            setInput={setInput}
            send={() => void send(input)}
            streaming={streaming}
            speakingNow={speakingNow}
            listening={listening || wakeAwake}
            startListening={startListening}
            stopListening={stopListening}
            voiceErr={voiceErr}
            scrollRef={scrollRef}
            onClose={() => setOpen(false)}
            onReset={reset}
            onKeyDown={onKeyDown}
            wakeState={wakeListener.state}
            wakeInterim={wakeListener.interim}
            wakeUnsupported={wakeListener.unsupported}
            wakePermissionDenied={wakeListener.permissionDenied}
            alwaysOn={settings.always_on}
            wakeWord={settings.wake_word || "jarvis"}
            onEnableWake={() => wakeListener.start()}
            providerLabel={
              settings.provider === "elevenlabs" ? "elevenlabs · daniel" : "browser tts"
            }
            visionEnabled={settings.vision_enabled}
            visionCapturing={visionCapturing}
            visionErr={visionErr}
            onStop={handleInterrupt}
          />
        ) : (
          <JarvisFab
            streaming={streaming}
            speakingNow={speakingNow}
            listening={listening || wakeAwake}
            wakeIdle={wakeIdle}
            wakeDot={wakeDot}
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
  speakingNow,
  listening,
  wakeIdle,
  wakeDot,
  onOpen,
}: {
  streaming: boolean;
  speakingNow: boolean;
  listening: boolean;
  wakeIdle: boolean;
  wakeDot: string;
  onOpen: () => void;
}) {
  const tooltip = listening
    ? "Listening…"
    : speakingNow
    ? "Speaking…"
    : streaming
    ? "Thinking…"
    : wakeIdle
    ? 'Always-on. Say "Jarvis" to talk.'
    : "Open Jarvis";
  return (
    <button
      onClick={onOpen}
      title={tooltip}
      aria-label="Open Jarvis assistant"
      className="group relative w-14 h-14 rounded-full border border-accent/40 bg-bg/95 backdrop-blur shadow-glow-accent text-accent hover:text-ink hover:bg-accent/10 transition-colors cursor-pointer flex items-center justify-center"
    >
      <IconLogo className="w-6 h-6" />
      <span
        className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg ${wakeDot}`}
      />
      {(speakingNow || listening) && (
        <span className="absolute inset-0 rounded-full pointer-events-none">
          <span
            className={`absolute inset-0 rounded-full ${
              listening ? "bg-hot/30" : "bg-accent/30"
            } animate-ping`}
          />
        </span>
      )}
      {wakeIdle && !speakingNow && !listening && (
        <span className="absolute inset-0 rounded-full pointer-events-none">
          <span className="absolute inset-0 rounded-full bg-accent/15 animate-ping" />
        </span>
      )}
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
  speakingNow,
  listening,
  startListening,
  stopListening,
  voiceErr,
  scrollRef,
  onClose,
  onReset,
  onKeyDown,
  providerLabel,
  wakeState,
  wakeInterim,
  wakeUnsupported,
  wakePermissionDenied,
  alwaysOn,
  wakeWord,
  onEnableWake,
  visionEnabled,
  visionCapturing,
  visionErr,
  onStop,
}: {
  messages: Msg[];
  input: string;
  setInput: (v: string) => void;
  send: () => void;
  streaming: boolean;
  speakingNow: boolean;
  listening: boolean;
  startListening: () => void;
  stopListening: () => void;
  voiceErr: string | null;
  scrollRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onReset: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  providerLabel: string;
  wakeState: "off" | "idle" | "awake" | "processing";
  wakeInterim: string;
  wakeUnsupported: boolean;
  wakePermissionDenied: boolean;
  alwaysOn: boolean;
  wakeWord: string;
  onEnableWake: () => void;
  visionEnabled: boolean;
  visionCapturing: boolean;
  visionErr: string | null;
  onStop: () => void;
}) {
  const showEnableWake =
    alwaysOn && !wakeUnsupported && wakeState === "off" && !wakePermissionDenied;
  const wakeStatusLabel =
    wakeState === "awake"
      ? "wake heard · listening"
      : wakeState === "processing"
      ? "processing"
      : wakeState === "idle"
      ? `always-on · say "${wakeWord}"`
      : alwaysOn && wakeUnsupported
      ? "wake word unsupported in this browser"
      : alwaysOn && wakePermissionDenied
      ? "mic permission denied"
      : "always-on off";
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
              speakingNow || streaming ? "shadow-glow-accent" : ""
            }`}
          >
            <IconLogo className="w-4 h-4" />
            {(speakingNow || listening) && (
              <span className="absolute inset-0 rounded-full">
                <span
                  className={`absolute inset-0 rounded-full ${
                    listening ? "bg-hot/30" : "bg-accent/30"
                  } animate-ping`}
                />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink leading-tight">
              Jarvis
            </div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-faint leading-tight truncate">
              {listening
                ? "listening…"
                : speakingNow
                ? "speaking…"
                : streaming
                ? "thinking…"
                : alwaysOn && (wakeState === "idle" || wakeState === "awake" || wakeState === "processing")
                ? wakeStatusLabel
                : providerLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {visionEnabled && (
            <span
              title="Vision on · Jarvis sees your screen each turn (Haiku 4.5)"
              aria-label="Vision enabled"
              className={`w-7 h-7 rounded-md border border-accent/40 bg-accent/[0.08] text-accent flex items-center justify-center ${
                visionCapturing ? "shadow-glow-accent animate-blink" : ""
              }`}
            >
              <IconEye className="w-3.5 h-3.5" />
            </span>
          )}
          {(streaming || speakingNow) && (
            <button
              onClick={onStop}
              title='Stop ("jarvis stop" also works)'
              aria-label="Stop"
              className="h-7 px-2 rounded-md border border-hot/45 bg-hot/[0.08] text-hot text-[11px] font-mono uppercase tracking-wider hover:bg-hot/[0.15] flex items-center gap-1 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-sm bg-hot" />
              stop
            </button>
          )}
          <a
            href="/settings/ai"
            title="Voice + persona settings"
            aria-label="Jarvis settings"
            className="w-7 h-7 rounded-md border border-border text-muted hover:text-ink hover:bg-surface-2 flex items-center justify-center cursor-pointer transition-colors"
          >
            <IconSparkle className="w-3.5 h-3.5" />
          </a>
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
        {showEnableWake && (
          <div className="rounded-lg border border-accent/40 bg-accent/[0.06] p-3 mb-1">
            <div className="text-[12px] font-semibold text-accent mb-1">
              Enable wake word
            </div>
            <div className="text-[11px] text-ink-muted leading-relaxed">
              Tap below once to grant mic access. After that, just say
              <span className="text-accent font-mono"> "{wakeWord}"</span> from anywhere on the page and Jarvis will respond — Alexa-style.
            </div>
            <button
              onClick={onEnableWake}
              className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-accent/45 bg-accent/[0.10] text-accent hover:bg-accent/[0.18] cursor-pointer shadow-glow-accent"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-glow-accent" />
              Tap to enable always-on
            </button>
          </div>
        )}
        {wakeState === "awake" && wakeInterim && (
          <div className="rounded-lg border border-hot/35 bg-hot/[0.04] px-3 py-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-hot/80 mb-0.5">
              hearing you
            </div>
            <div className="text-[12px] text-ink-muted leading-relaxed">
              {wakeInterim}
            </div>
          </div>
        )}
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
      {visionErr && (
        <div className="px-4 py-2 border-t border-hot/30 bg-hot/[0.05] text-[11px] text-hot">
          {visionErr}
        </div>
      )}
      {visionCapturing && !visionErr && (
        <div className="px-4 py-1.5 border-t border-accent/30 bg-accent/[0.05] text-[10px] font-mono uppercase tracking-wider text-accent flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-glow-accent animate-blink" />
          looking at the screen · haiku 4.5
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
    "Open the workflow tab",
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
  let out = stripActionJson(text);
  out = out.replace(/```[\s\S]*?```/g, "");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/^#{1,6}\s+/gm, "");
  out = out.replace(/^[-*]\s+/gm, "");
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return out;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

// ── Inline glyphs ────────────────────────────────────────────────────

function MicGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
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
      <span
        className="w-1.5 h-1.5 rounded-full bg-current animate-blink"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-current animate-blink"
        style={{ animationDelay: "120ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-current animate-blink"
        style={{ animationDelay: "240ms" }}
      />
    </span>
  );
}
