"use client";

/**
 * Always-on wake-word + barge-in listener.
 *
 * Wraps the browser SpeechRecognition API in continuous mode and exposes
 * a tiny state machine the JarvisOverlay drives:
 *
 *   IDLE       → listening for the wake phrase, ignoring everything else
 *   AWAKE      → wake phrase heard, capturing the operator's full command
 *   COMMITTED  → command transcript handed to the parent; parent sends to
 *                /api/jarvis. Listener returns to IDLE.
 *
 * While Jarvis is speaking (speakingNow=true), the listener still runs.
 * Two interrupt triggers:
 *   1. The wake phrase — operator says "Jarvis" mid-response → immediately
 *      stop audio + abort LLM + treat as new turn.
 *   2. A clearly-human utterance ≥ MIN_INTERRUPT_WORDS that doesn't match
 *      the tail of what Jarvis is currently saying — same.
 *
 * Browser policy: the FIRST recognition.start() must be triggered by a
 * user gesture (click). After permission is granted, subsequent starts
 * (e.g. on page mount) succeed without a gesture in the same origin.
 *
 * Chrome quirk: continuous SR sometimes fires `onend` after a few seconds
 * of silence. We auto-restart unless the consumer explicitly stopped us.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const COMMAND_FINALIZE_MS = 1200;     // silence after wake → commit utterance
const COMMAND_MAX_MS = 12_000;         // hard cap on a single command
const MIN_INTERRUPT_WORDS = 4;         // barge-in threshold during playback

export type WakeState = "off" | "idle" | "awake" | "processing";

export interface WakeListenerOpts {
  enabled: boolean;
  wakeWord: string;
  onCommand: (command: string) => void;
  /** True when Jarvis is currently speaking (audio playing). Used to
   *  decide whether interim transcripts should trigger barge-in. */
  speakingNow: boolean;
  /** Tail of Jarvis's currently-spoken text — interim transcripts that
   *  match this are likely echo bleed-through and should be ignored. */
  speakingTail: string;
  /** Called when the listener wants to interrupt (kill audio + abort LLM). */
  onInterrupt: () => void;
  /** Whether barge-in interruption is enabled. */
  bargeIn: boolean;
}

export interface WakeListenerHandle {
  state: WakeState;
  interim: string;
  start: () => void;          // user-gesture entry point
  stop: () => void;
  permissionDenied: boolean;
  unsupported: boolean;
}

const SUPPORTED =
  typeof window !== "undefined" &&
  ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export function useWakeListener(opts: WakeListenerOpts): WakeListenerHandle {
  const { enabled, wakeWord, onCommand, speakingNow, speakingTail, onInterrupt, bargeIn } = opts;
  const [state, setState] = useState<WakeState>(SUPPORTED ? "off" : "off");
  const [interim, setInterim] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);

  const recogRef = useRef<any>(null);
  const wantRunningRef = useRef(false);
  const stateRef = useRef<WakeState>("off");
  const wakeWordRef = useRef(wakeWord || "jarvis");
  const cmdAccumRef = useRef("");
  const cmdSilenceTimerRef = useRef<number | null>(null);
  const cmdMaxTimerRef = useRef<number | null>(null);
  const speakingNowRef = useRef(false);
  const speakingTailRef = useRef("");
  const bargeInRef = useRef(true);

  // Keep refs in sync — recognizer callbacks fire outside render cycles.
  useEffect(() => {
    wakeWordRef.current = (wakeWord || "jarvis").toLowerCase();
  }, [wakeWord]);
  useEffect(() => {
    speakingNowRef.current = speakingNow;
  }, [speakingNow]);
  useEffect(() => {
    speakingTailRef.current = speakingTail || "";
  }, [speakingTail]);
  useEffect(() => {
    bargeInRef.current = bargeIn;
  }, [bargeIn]);

  const setStateBoth = (s: WakeState) => {
    stateRef.current = s;
    setState(s);
  };

  const cancelTimers = () => {
    if (cmdSilenceTimerRef.current) {
      clearTimeout(cmdSilenceTimerRef.current);
      cmdSilenceTimerRef.current = null;
    }
    if (cmdMaxTimerRef.current) {
      clearTimeout(cmdMaxTimerRef.current);
      cmdMaxTimerRef.current = null;
    }
  };

  const commitCommand = useCallback(() => {
    cancelTimers();
    const cmd = cmdAccumRef.current.trim();
    cmdAccumRef.current = "";
    setInterim("");
    setStateBoth("processing");
    if (cmd.length >= 2) {
      try {
        onCommand(cmd);
      } catch {
        // ignore
      }
    } else {
      // Wake word but no command — fall back to idle.
      setStateBoth("idle");
    }
  }, [onCommand]);

  const enterAwake = useCallback(
    (initialTail: string) => {
      cancelTimers();
      cmdAccumRef.current = initialTail.trim();
      setStateBoth("awake");
      // Hard timeout in case user trails off.
      cmdMaxTimerRef.current = window.setTimeout(() => {
        commitCommand();
      }, COMMAND_MAX_MS);
    },
    [commitCommand]
  );

  // Word-stripping helper — removes speakingTail words from a transcript
  // to filter echo bleed-through. Cheap fuzzy match.
  const filterEcho = (transcript: string): string => {
    const tail = speakingTailRef.current.toLowerCase();
    if (!tail) return transcript;
    const tailWords = new Set(
      tail
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(-12) // last 12 substantive words
    );
    if (tailWords.size === 0) return transcript;
    const transcriptWords = transcript
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (transcriptWords.length === 0) return transcript;
    const overlap = transcriptWords.filter((w) => tailWords.has(w.toLowerCase())).length;
    // If >70% of the words in the transcript are echoes of recent Jarvis
    // speech, treat as echo and ignore.
    if (overlap / transcriptWords.length > 0.7) return "";
    return transcript;
  };

  const handleResult = useCallback(
    (e: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      const combined = (finalText + " " + interimText).trim();
      const lower = combined.toLowerCase();

      // ── State: IDLE — scan for wake word ──
      if (stateRef.current === "idle") {
        if (!combined) return;
        const wake = wakeWordRef.current;
        // Match "hey jarvis", "jarvis", "ok jarvis" etc.
        const re = new RegExp(`(?:^|\\s)(?:hey\\s+|ok\\s+|hi\\s+)?${escapeReg(wake)}\\b`, "i");
        const m = lower.match(re);
        if (!m || m.index === undefined) return;
        // Everything after the wake word becomes the start of the command.
        const tail = combined.slice(m.index + m[0].length).trim().replace(/^[,.!?]\s*/, "");
        // Update interim hint for UI
        setInterim(tail || "");
        // Wait until we see a final result before locking in.
        if (finalText) {
          enterAwake(tail);
        } else if (tail.length > 0) {
          // Got wake word + interim trailing speech — switch to awake to
          // start accumulating without waiting for finality.
          enterAwake(tail);
        }
        return;
      }

      // ── State: AWAKE — accumulate the command, debounced finalize ──
      if (stateRef.current === "awake") {
        const visible = combined;
        cmdAccumRef.current = visible.trim();
        setInterim(visible);
        // Each new chunk resets the silence timer.
        if (cmdSilenceTimerRef.current) clearTimeout(cmdSilenceTimerRef.current);
        cmdSilenceTimerRef.current = window.setTimeout(() => {
          commitCommand();
        }, COMMAND_FINALIZE_MS);
        return;
      }

      // ── State: PROCESSING — barge-in only ──
      if (stateRef.current === "processing") {
        if (!speakingNowRef.current || !bargeInRef.current) return;
        const filtered = filterEcho(combined);
        const lowerFiltered = filtered.toLowerCase();
        const wake = wakeWordRef.current;
        const wakeRe = new RegExp(`\\b${escapeReg(wake)}\\b`, "i");
        const wordCount = filtered.trim().split(/\s+/).filter(Boolean).length;

        // Trigger interrupt on EITHER (a) wake word during playback OR
        // (b) substantial non-echo speech.
        if (wakeRe.test(lowerFiltered) || wordCount >= MIN_INTERRUPT_WORDS) {
          onInterrupt();
          // Treat the new utterance as the start of a new command.
          // Strip the wake word if present so the command is cleaner.
          const cleanedStart = filtered.replace(
            new RegExp(`(?:^|\\s)(?:hey\\s+|ok\\s+|hi\\s+)?${escapeReg(wake)}\\b[,.!?\\s]*`, "i"),
            " "
          ).trim();
          enterAwake(cleanedStart);
        }
        return;
      }
    },
    [enterAwake, commitCommand, onInterrupt]
  );

  const startRecognition = useCallback(() => {
    if (!SUPPORTED) return;
    if (recogRef.current) return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = handleResult;
    r.onerror = (e: any) => {
      if (e.error === "not-allowed") {
        setPermissionDenied(true);
        wantRunningRef.current = false;
        setStateBoth("off");
      }
    };
    r.onend = () => {
      recogRef.current = null;
      // Auto-restart unless we explicitly stopped.
      if (wantRunningRef.current) {
        setTimeout(() => startRecognition(), 200);
      }
    };
    try {
      r.start();
      recogRef.current = r;
      if (stateRef.current === "off") setStateBoth("idle");
    } catch {
      // already-running edge case
      recogRef.current = null;
    }
  }, [handleResult]);

  const start = useCallback(() => {
    wantRunningRef.current = true;
    setPermissionDenied(false);
    startRecognition();
  }, [startRecognition]);

  const stop = useCallback(() => {
    wantRunningRef.current = false;
    cancelTimers();
    cmdAccumRef.current = "";
    setInterim("");
    if (recogRef.current) {
      try {
        recogRef.current.stop();
      } catch {
        // ignore
      }
      recogRef.current = null;
    }
    setStateBoth("off");
  }, []);

  // Mirror the enabled flag — turn on/off as setting toggles.
  useEffect(() => {
    if (!SUPPORTED) return;
    if (enabled && !wantRunningRef.current) {
      // Caller is responsible for triggering the first start with a user
      // gesture. We won't auto-start here because Chrome blocks SR without
      // a gesture on the very first call. After the first successful
      // start, this effect ensures restart on remount.
      // On subsequent mounts (permission already granted), the parent
      // can call start() unconditionally.
    } else if (!enabled && wantRunningRef.current) {
      stop();
    }
  }, [enabled, stop]);

  // Drop back to idle when parent finishes processing (state="processing"
  // is short-lived; once Jarvis stops speaking + LLM done, parent should
  // call markIdle()… but we expose that via a side channel: when speakingNow
  // flips false AND state==processing, return to idle).
  useEffect(() => {
    if (stateRef.current === "processing" && !speakingNow) {
      // Small delay so a final commit doesn't race state flips.
      const t = setTimeout(() => {
        if (stateRef.current === "processing") {
          setStateBoth("idle");
        }
      }, 400);
      return () => clearTimeout(t);
    }
  }, [speakingNow]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      wantRunningRef.current = false;
      try {
        recogRef.current?.stop();
      } catch {
        // ignore
      }
      recogRef.current = null;
      cancelTimers();
    };
  }, []);

  return {
    state,
    interim,
    start,
    stop,
    permissionDenied,
    unsupported: !SUPPORTED,
  };
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
