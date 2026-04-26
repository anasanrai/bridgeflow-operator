"use client";

/**
 * Jarvis settings store — voice provider, voice id, personality preset,
 * persona text. Persists to localStorage (key bridgeflow.jarvis.settings.v1).
 *
 * Defaults: ElevenLabs Daniel voice, Jarvis personality. The Settings
 * page lets the operator override any of these. JarvisOverlay reads
 * via useJarvisSettings() and reacts to "storage" events for cross-tab
 * sync.
 */

import { useEffect, useState } from "react";

export type VoiceProvider = "elevenlabs" | "browser";

export const VOICE_OPTIONS: Array<{
  id: string;
  name: string;
  description: string;
  language: string;
}> = [
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    description: "British, mature, calm — film-Jarvis vibe",
    language: "en-GB",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    description: "American, deep, authoritative",
    language: "en-US",
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    description: "American, neutral, warm",
    language: "en-US",
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    description: "American, well-rounded narrator",
    language: "en-US",
  },
  {
    id: "EXAVITQu4vr4xnSDxMaL",
    name: "Bella",
    description: "American, soft, friendly",
    language: "en-US",
  },
];

export const PERSONALITY_PRESETS: Array<{
  id: string;
  name: string;
  prompt: string;
}> = [
  {
    id: "jarvis",
    name: "Jarvis",
    prompt: "",
  },
  {
    id: "concise-coach",
    name: "Concise Coach",
    prompt:
      "You are a senior operations coach. Reply in 1-2 sentences max. No fluff. State the action the operator should take next, then stop.",
  },
  {
    id: "sales-mentor",
    name: "Sales Mentor",
    prompt:
      "You are a senior sales mentor — deal-room veteran, calm, blunt. Use sales vocabulary (close, signal, stage, qualify) naturally. Always end with one specific question that pushes the deal forward.",
  },
  {
    id: "ops-buddy",
    name: "Ops Buddy",
    prompt:
      "You are a friendly ops sidekick. Warm, casual, encouraging. Celebrate small wins. Never use corporate jargon. Address the operator by their first name when known.",
  },
];

export interface JarvisSettings {
  provider: VoiceProvider;
  voice_id: string;          // ElevenLabs voice id when provider=elevenlabs
  personality_id: string;    // one of PERSONALITY_PRESETS.id, "custom" allowed
  custom_persona: string;    // free-form, used when personality_id="custom"
  voice_enabled: boolean;    // master mute for TTS
  always_on: boolean;        // continuous mic + wake-word activation
  wake_word: string;         // lowercase phrase to listen for, e.g. "jarvis"
  barge_in: boolean;         // user can interrupt Jarvis mid-sentence

  // Identity layer
  /** How Jarvis addresses the operator. "sir" = J.A.R.V.I.S. canonical.
   *  Free-form: "boss", "Anasan", first name, etc. */
  owner_identity: string;
  /** Who Jarvis IS — self-perception block. Free-form, ~600 char cap.
   *  Prepended to the system prompt so Jarvis maintains a stable
   *  persona even when the personality preset changes. */
  jarvis_identity: string;

  // Vision (V3-feeling, but live)
  /** Master toggle. When true, Jarvis can use the operator's screen as
   *  context. Capture happens on each turn, only when a stream is active. */
  vision_enabled: boolean;
}

export const DEFAULT_SETTINGS: JarvisSettings = {
  provider: "elevenlabs",
  voice_id: "onwK4e9ZLuTAKqWW03F9", // Daniel
  personality_id: "jarvis",
  custom_persona: "",
  voice_enabled: true,
  always_on: true,
  wake_word: "jarvis",
  barge_in: true,
  owner_identity: "sir",
  jarvis_identity:
    "I am Jarvis. I run BridgeFlow Operator at the operator's side — calm, " +
    "fast, and direct. I notice what matters, I name it without filler, and " +
    "I never speak like a chatbot. When the operator is right, I move. When " +
    "they're not, I push back once. J.A.R.V.I.S. to their Tony Stark, but " +
    "with the numbers in front of me.",
  vision_enabled: false,
};

const STORAGE_KEY = "bridgeflow.jarvis.settings.v1";

export function loadSettings(): JarvisSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: JarvisSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    // Trigger storage events for cross-tab + same-window listeners.
    window.dispatchEvent(new CustomEvent("jarvis:settings-changed"));
  } catch {
    // ignore
  }
}

/** Resolve the system-prompt persona text for the selected preset.
 *  Returns "" for the default Jarvis preset (uses canonical system prompt). */
export function resolvePersona(s: JarvisSettings): string {
  if (s.personality_id === "custom") return (s.custom_persona || "").trim();
  const preset = PERSONALITY_PRESETS.find((p) => p.id === s.personality_id);
  return preset?.prompt ?? "";
}

export function useJarvisSettings(): [
  JarvisSettings,
  (next: Partial<JarvisSettings>) => void,
] {
  const [s, setS] = useState<JarvisSettings>(DEFAULT_SETTINGS);

  // Hydrate once on mount.
  useEffect(() => {
    setS(loadSettings());
  }, []);

  // Sync across tabs and same-window edits from /settings/ai.
  useEffect(() => {
    const onChange = () => setS(loadSettings());
    window.addEventListener("storage", onChange);
    window.addEventListener("jarvis:settings-changed", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("jarvis:settings-changed", onChange);
    };
  }, []);

  const update = (next: Partial<JarvisSettings>) => {
    const merged = { ...s, ...next };
    setS(merged);
    saveSettings(merged);
  };

  return [s, update];
}
