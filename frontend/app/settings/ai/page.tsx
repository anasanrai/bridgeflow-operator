"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconCheck,
  IconLogo,
  IconLock,
  IconSparkle,
  IconUsers,
  IconX,
} from "../../lib/icons";
import {
  PERSONALITY_PRESETS,
  VOICE_OPTIONS,
  resolvePersona,
  useJarvisSettings,
} from "../../lib/jarvisSettings";

interface Status {
  elevenlabs?: boolean;
  elevenlabs_voice_id?: string | null;
}

export default function AISettingsPage() {
  const [settings, update] = useJarvisSettings();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setStatus)
      .catch(() => setStatus({}))
      .finally(() => setLoading(false));
  }, []);

  const elevenLive = !!status?.elevenlabs;
  const personaPreview = useMemo(() => resolvePersona(settings), [settings]);

  const playSample = async () => {
    setTesting(true);
    setTestMsg(null);
    const sample =
      "Greetings. All systems live. Eight runs since yesterday, four awaiting your approval, sir.";
    try {
      if (settings.provider === "browser") {
        const u = new SpeechSynthesisUtterance(sample);
        const voices = window.speechSynthesis.getVoices();
        const preferred =
          voices.find((v) =>
            /Daniel|Samantha|Allison|Google.*UK English Male/i.test(v.name)
          ) || voices[0];
        if (preferred) u.voice = preferred;
        u.rate = 1.05;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
        u.onend = () => setTesting(false);
        u.onerror = () => {
          setTesting(false);
          setTestMsg("Browser synth failed.");
        };
        return;
      }
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sample, voice_id: settings.voice_id }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        throw new Error(`TTS failed (${r.status}): ${text.slice(0, 120)}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setTesting(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setTesting(false);
        setTestMsg("Audio playback failed.");
      };
      await audio.play();
    } catch (e) {
      setTesting(false);
      setTestMsg((e as Error).message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Header status={status} />

      {loading ? (
        <Skeleton />
      ) : (
        <>
          <VoiceCard
            settings={settings}
            update={update}
            elevenLive={elevenLive}
            playSample={playSample}
            testing={testing}
            testMsg={testMsg}
          />
          <ConversationCard settings={settings} update={update} />
          <IdentityCard settings={settings} update={update} />
          <VisionCard settings={settings} update={update} />
          <PersonalityCard
            settings={settings}
            update={update}
            personaPreview={personaPreview}
          />
          <ConnectorsComingSoon />
          <V3LockedRows />
        </>
      )}
    </div>
  );
}

// ── Header ──────────────────────────────────────────────────────────────

function Header({ status }: { status: Status | null }) {
  const live = !!status?.elevenlabs;
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink flex items-center gap-2">
        <IconLogo className="w-5 h-5 text-accent" />
        Jarvis · AI assistant
      </h1>
      <p className="text-sm text-muted mt-1 max-w-2xl">
        Voice, identity, and personality for the operator-side assistant. Same
        Claude Opus 4.7 brain that runs the pipeline — different role.
      </p>
      <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-surface">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            live ? "bg-accent shadow-glow-accent" : "bg-faint"
          }`}
        />
        ElevenLabs · {live ? "live" : "not connected"}
      </div>
    </div>
  );
}

// ── Voice card ────────────────────────────────────────────────────────

function VoiceCard({
  settings,
  update,
  elevenLive,
  playSample,
  testing,
  testMsg,
}: {
  settings: ReturnType<typeof useJarvisSettings>[0];
  update: ReturnType<typeof useJarvisSettings>[1];
  elevenLive: boolean;
  playSample: () => void;
  testing: boolean;
  testMsg: string | null;
}) {
  return (
    <Section title="Voice" icon={<IconSparkle className="w-4 h-4" />}>
      <div className="rounded-lg border border-border bg-bg/40 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[12px] font-semibold text-ink">Voice output</div>
          <div className="text-[11px] text-muted mt-0.5">
            Master mute. Off = text only, no spoken response.
          </div>
        </div>
        <Toggle
          value={settings.voice_enabled}
          onChange={(v) => update({ voice_enabled: v })}
        />
      </div>

      <div className="rounded-lg border border-border bg-bg/40 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-faint mb-2">
          Provider
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ProviderRadio
            id="elevenlabs"
            checked={settings.provider === "elevenlabs"}
            onChange={() => update({ provider: "elevenlabs" })}
            disabled={!elevenLive}
            title="ElevenLabs"
            sub={elevenLive ? "Cinematic voice · streaming TTS" : "Connect ElevenLabs in Credentials"}
            badge={elevenLive ? "live" : "off"}
            badgeAccent={elevenLive}
          />
          <ProviderRadio
            id="browser"
            checked={settings.provider === "browser"}
            onChange={() => update({ provider: "browser" })}
            title="Browser"
            sub="OS narrator voice · free, no setup"
            badge="always available"
          />
        </div>
      </div>

      {settings.provider === "elevenlabs" && (
        <div className="rounded-lg border border-border bg-bg/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
              Voice
            </div>
            <span className="text-[10px] font-mono text-faint">
              {VOICE_OPTIONS.length} voices
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {VOICE_OPTIONS.map((v) => (
              <VoicePick
                key={v.id}
                voice={v}
                selected={settings.voice_id === v.id}
                onPick={() => update({ voice_id: v.id })}
              />
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-bg/40 p-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-ink">Test the voice</div>
          <div className="text-[11px] text-muted">
            Play a one-line sample to confirm it sounds right.
          </div>
          {testMsg && (
            <div className="text-[11px] text-hot mt-1.5">{testMsg}</div>
          )}
        </div>
        <button
          onClick={playSample}
          disabled={testing || (!settings.voice_enabled)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-accent/45 bg-accent/[0.08] text-accent hover:bg-accent/[0.12] disabled:opacity-40 cursor-pointer shadow-glow-accent"
        >
          <IconSparkle className="w-3.5 h-3.5" />
          {testing ? "playing…" : "Play sample"}
        </button>
      </div>
    </Section>
  );
}

function ProviderRadio({
  id,
  checked,
  onChange,
  disabled,
  title,
  sub,
  badge,
  badgeAccent,
}: {
  id: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  title: string;
  sub: string;
  badge: string;
  badgeAccent?: boolean;
}) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange()}
      className={`text-left rounded-lg border p-3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        checked
          ? "border-accent/45 bg-accent/[0.07]"
          : "border-border bg-bg hover:bg-surface-2"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full border ${
              checked
                ? "border-accent bg-accent shadow-glow-accent"
                : "border-faint"
            }`}
          />
          <span className="text-[12px] font-semibold text-ink">{title}</span>
        </div>
        <span
          className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
            badgeAccent
              ? "border-accent/40 text-accent bg-accent/10"
              : "border-border text-faint bg-surface"
          }`}
        >
          {badge}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-muted">{sub}</div>
    </button>
  );
}

function VoicePick({
  voice,
  selected,
  onPick,
}: {
  voice: typeof VOICE_OPTIONS[number];
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className={`text-left rounded-lg border p-3 transition-colors cursor-pointer ${
        selected
          ? "border-accent/45 bg-accent/[0.07]"
          : "border-border bg-bg hover:bg-surface-2"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-3 h-3 rounded-full border ${
              selected
                ? "border-accent bg-accent shadow-glow-accent"
                : "border-faint"
            }`}
          />
          <span className="text-[12px] font-semibold text-ink">{voice.name}</span>
        </div>
        <span className="text-[10px] font-mono text-faint">{voice.language}</span>
      </div>
      <div className="mt-1 text-[11px] text-muted leading-relaxed">
        {voice.description}
      </div>
    </button>
  );
}

// ── Conversation card (always-on + wake word + barge-in) ──────────────

function ConversationCard({
  settings,
  update,
}: {
  settings: ReturnType<typeof useJarvisSettings>[0];
  update: ReturnType<typeof useJarvisSettings>[1];
}) {
  const [draftWake, setDraftWake] = useState(settings.wake_word);
  useEffect(() => setDraftWake(settings.wake_word), [settings.wake_word]);

  return (
    <Section title="Conversation" icon={<IconSparkle className="w-4 h-4" />}>
      <div className="rounded-lg border border-border bg-bg/40 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[12px] font-semibold text-ink">Always-on listening</div>
          <div className="text-[11px] text-muted mt-0.5 leading-relaxed max-w-xl">
            Keep the mic open in the background. Jarvis stays silent until
            you say the wake word — then activates and listens to your full
            command. Like Alexa or Siri.
          </div>
          <div className="text-[10px] text-faint mt-1.5 leading-relaxed">
            Browser blocks the very first start without a click. The Jarvis
            panel shows a one-tap "Enable always-on" button the first time;
            after that it auto-starts on every page load.
          </div>
        </div>
        <Toggle
          value={settings.always_on}
          onChange={(v) => update({ always_on: v })}
        />
      </div>

      <div className="rounded-lg border border-border bg-bg/40 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
            Wake word
          </div>
          <span className="text-[10px] font-mono text-faint">
            lowercase · keep it distinctive
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={draftWake}
            onChange={(e) => setDraftWake(e.target.value.toLowerCase())}
            onBlur={() =>
              update({ wake_word: draftWake.trim().toLowerCase() || "jarvis" })
            }
            placeholder="jarvis"
            disabled={!settings.always_on}
            className="flex-1 rounded-md bg-bg border border-border px-3 py-1.5 text-[13px] font-mono text-ink placeholder:text-faint focus:outline-none focus:border-accent/45 disabled:opacity-50"
          />
          <span className="text-[11px] text-muted">
            try: jarvis · friday · operator
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg/40 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[12px] font-semibold text-ink">Barge-in</div>
          <div className="text-[11px] text-muted mt-0.5 leading-relaxed max-w-xl">
            Interrupt Jarvis mid-sentence by speaking. Jarvis will stop
            talking, listen, and respond to the new input — no need to wait
            for the response to finish. Echo filtering reduces false
            triggers from your own speakers; not perfect.
          </div>
        </div>
        <Toggle
          value={settings.barge_in}
          onChange={(v) => update({ barge_in: v })}
        />
      </div>
    </Section>
  );
}

// ── Identity card (owner identity + Jarvis identity) ──────────────────

function IdentityCard({
  settings,
  update,
}: {
  settings: ReturnType<typeof useJarvisSettings>[0];
  update: ReturnType<typeof useJarvisSettings>[1];
}) {
  const [owner, setOwner] = useState(settings.owner_identity);
  const [jarvis, setJarvis] = useState(settings.jarvis_identity);
  useEffect(() => setOwner(settings.owner_identity), [settings.owner_identity]);
  useEffect(() => setJarvis(settings.jarvis_identity), [settings.jarvis_identity]);

  return (
    <Section title="Identity" icon={<IconUsers className="w-4 h-4" />}>
      <div className="rounded-lg border border-border bg-bg/40 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
            Owner identity
          </div>
          <span className="text-[10px] font-mono text-faint">
            how Jarvis addresses you
          </span>
        </div>
        <input
          value={owner}
          onChange={(e) => setOwner(e.target.value.slice(0, 80))}
          onBlur={() => update({ owner_identity: owner.trim() || "sir" })}
          placeholder="sir"
          className="w-full rounded-md bg-bg border border-border px-3 py-1.5 text-[13px] font-mono text-ink placeholder:text-faint focus:outline-none focus:border-accent/45"
        />
        <div className="text-[11px] text-muted mt-1.5 leading-relaxed">
          Examples: <span className="font-mono text-ink-muted">sir</span> ·{" "}
          <span className="font-mono text-ink-muted">boss</span> ·{" "}
          <span className="font-mono text-ink-muted">Anasan</span> · your first
          name. Default <span className="font-mono">sir</span> is the canonical
          J.A.R.V.I.S. address.
        </div>
      </div>

      <div className="rounded-lg border border-border bg-bg/40 p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-medium uppercase tracking-wider text-faint">
            Jarvis identity
          </div>
          <span className="text-[10px] font-mono text-faint">
            who Jarvis IS · self-perception
          </span>
        </div>
        <textarea
          value={jarvis}
          onChange={(e) => setJarvis(e.target.value.slice(0, 600))}
          onBlur={() => update({ jarvis_identity: jarvis.trim() })}
          rows={4}
          placeholder="I am Jarvis, the operator's senior AI assistant for BridgeFlow. I am calm, capable, and direct. I never panic. I treat the operator like Tony Stark's J.A.R.V.I.S. would — fast, deferential, witty."
          className="w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint focus:outline-none focus:border-accent/45 resize-y scrollbar-thin"
        />
        <div className="flex items-center justify-between mt-1">
          <div className="text-[11px] text-muted leading-relaxed">
            Prepended above the system prompt — survives personality preset
            changes so Jarvis keeps a stable self-image.
          </div>
          <div className="text-[10px] text-faint shrink-0 ml-2">
            {jarvis.length} / 600
          </div>
        </div>
      </div>
    </Section>
  );
}

// ── Vision card (Claude Haiku 4.5 screen-sense) ───────────────────────

function VisionCard({
  settings,
  update,
}: {
  settings: ReturnType<typeof useJarvisSettings>[0];
  update: ReturnType<typeof useJarvisSettings>[1];
}) {
  return (
    <Section title="Vision" icon={<IconSparkle className="w-4 h-4" />}>
      <div className="rounded-lg border border-border bg-bg/40 p-3 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-ink flex items-center gap-2">
            Screen sense
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-accent/40 text-accent bg-accent/10">
              Haiku 4.5
            </span>
          </div>
          <div className="text-[11px] text-muted mt-1 leading-relaxed max-w-xl">
            When on, Jarvis snapshots the BridgeFlow tab automatically on
            every question and reads it as ground truth. Ask "what am I
            looking at?", "where do I click to approve?", "what does this
            row mean?" — Jarvis answers from what's actually on screen.
            Routed through Claude Haiku 4.5 for fast, cheap vision.
          </div>
          <div className="text-[10px] text-faint mt-1.5 leading-relaxed">
            No screen-share dialog. Capture is scoped to this app's tab,
            never your other windows. Frames are sent only when you send a
            message — not in the background.
          </div>
        </div>
        <Toggle
          value={settings.vision_enabled}
          onChange={(v) => update({ vision_enabled: v })}
        />
      </div>
    </Section>
  );
}

// ── Personality card ──────────────────────────────────────────────────

function PersonalityCard({
  settings,
  update,
  personaPreview,
}: {
  settings: ReturnType<typeof useJarvisSettings>[0];
  update: ReturnType<typeof useJarvisSettings>[1];
  personaPreview: string;
}) {
  const [draft, setDraft] = useState(settings.custom_persona);
  useEffect(() => setDraft(settings.custom_persona), [settings.custom_persona]);

  return (
    <Section title="Personality" icon={<IconUsers className="w-4 h-4" />}>
      <div className="rounded-lg border border-border bg-bg/40 p-3">
        <div className="text-[10px] font-medium uppercase tracking-wider text-faint mb-2">
          Preset
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PERSONALITY_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => update({ personality_id: p.id })}
              className={`text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
                settings.personality_id === p.id
                  ? "border-accent/45 bg-accent/[0.07]"
                  : "border-border bg-bg hover:bg-surface-2"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full border ${
                    settings.personality_id === p.id
                      ? "border-accent bg-accent shadow-glow-accent"
                      : "border-faint"
                  }`}
                />
                <span className="text-[12px] font-semibold text-ink">{p.name}</span>
              </div>
            </button>
          ))}
          <button
            onClick={() => update({ personality_id: "custom" })}
            className={`text-left rounded-lg border p-2.5 transition-colors cursor-pointer ${
              settings.personality_id === "custom"
                ? "border-accent/45 bg-accent/[0.07]"
                : "border-border bg-bg hover:bg-surface-2"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full border ${
                  settings.personality_id === "custom"
                    ? "border-accent bg-accent shadow-glow-accent"
                    : "border-faint"
                }`}
              />
              <span className="text-[12px] font-semibold text-ink">Custom</span>
            </div>
          </button>
        </div>
      </div>

      {settings.personality_id === "custom" && (
        <div className="rounded-lg border border-border bg-bg/40 p-3">
          <label className="block text-[10px] font-medium uppercase tracking-wider text-faint mb-1.5">
            Custom persona prompt
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => update({ custom_persona: draft })}
            rows={5}
            placeholder='You are a calm, confident senior advisor. Speak as if 30 years of operator experience, every sentence dense with insight. Address the operator as "boss"…'
            className="w-full rounded-md bg-bg border border-border px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-faint focus:outline-none focus:border-accent/45 resize-y scrollbar-thin"
          />
          <div className="text-[10px] text-faint mt-1 text-right">
            {draft.length} / 600 chars
          </div>
        </div>
      )}

      {personaPreview && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-amber-200/80 mb-1">
            Active persona override
          </div>
          <div className="text-[12px] text-ink-muted leading-relaxed whitespace-pre-wrap">
            {personaPreview}
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Coming-soon connectors ────────────────────────────────────────────

function ConnectorsComingSoon() {
  const cards = [
    {
      title: "Hermes",
      kind: "Personal assistant agent",
      description:
        "Connect your Hermes inbox + calendar agent. Jarvis hands off scheduling, follow-up writing, and drip cadences directly to Hermes — same operator memory, two specialised brains.",
      glyph: <span className="text-[13px] font-bold leading-none">H</span>,
      tone: "border-amber-500/35 bg-amber-500/[0.04]",
    },
    {
      title: "OpenClaw",
      kind: "Web operator agent",
      description:
        "Plug in your OpenClaw browser-control agent. Jarvis can ask OpenClaw to research a prospect, scrape a competitor, or fill an inbound form — full audit trail per task.",
      glyph: <span className="text-[13px] font-bold leading-none">⌥</span>,
      tone: "border-cold/35 bg-cold/[0.04]",
    },
    {
      title: "ManClaw",
      kind: "Field-ops agent",
      description:
        "Wire up ManClaw for in-person ops: dispatch, logistics, on-site verification. The handoff Jarvis makes when something needs hands, not keystrokes.",
      glyph: <span className="text-[13px] font-bold leading-none">M</span>,
      tone: "border-warm/35 bg-warm/[0.04]",
    },
  ];

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.03] overflow-hidden">
      <header className="flex items-center justify-between px-5 py-3 border-b border-amber-500/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-200 flex items-center justify-center">
            <IconLock className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Connect more agents</h2>
            <p className="text-[11px] text-muted">
              Multi-agent handoffs from the BridgeFlow ecosystem.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
          V3 · Coming soon
        </span>
      </header>
      <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div
            key={c.title}
            className={`relative rounded-lg border p-4 ${c.tone}`}
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-md bg-bg border border-border text-ink flex items-center justify-center">
                {c.glyph}
              </div>
              <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
                <IconLock className="w-2.5 h-2.5" />
                Coming soon
              </span>
            </div>
            <div className="mt-3 text-[13px] font-semibold text-ink">{c.title}</div>
            <div className="text-[11px] text-faint mt-0.5">{c.kind}</div>
            <p className="text-[11px] text-muted mt-2 leading-relaxed">
              {c.description}
            </p>
            <button
              disabled
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border border-border bg-bg text-faint cursor-not-allowed select-none"
            >
              <IconLock className="w-3 h-3 text-amber-300/70" />
              Connect {c.title}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── V3 locked rows ────────────────────────────────────────────────────

function V3LockedRows() {
  const items = [
    {
      title: "Always-listening mode",
      sub: "Jarvis stays open mic. Voice activity detection wakes him without a button tap.",
    },
    {
      title: "Wake word",
      sub: "Say \"Jarvis\" and the assistant pops open. Custom wake phrase support.",
    },
    {
      title: "Persistent memory",
      sub: "Conversations survive page reloads + sync across browsers via the company vault.",
    },
    {
      title: "Tool use (mutations)",
      sub: "Voice → archive lead, send approved email, update CRM record. With safety confirmations.",
    },
  ];
  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair">
      <header className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-bg border border-border text-ink-muted flex items-center justify-center">
            <IconLock className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Conversational layer</h2>
            <p className="text-[11px] text-muted">
              The next-tier features that make Jarvis feel real-time.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-200 bg-amber-500/10">
          V3
        </span>
      </header>
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        {items.map((it) => (
          <div
            key={it.title}
            className="rounded-lg border border-border bg-bg/40 p-3 flex items-start gap-3"
          >
            <div className="w-8 h-8 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center justify-center shrink-0">
              <IconLock className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-ink">{it.title}</div>
              <div className="text-[11px] text-muted leading-relaxed mt-0.5">
                {it.sub}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Primitives ────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-inset-hair">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-border">
        <div className="w-7 h-7 rounded-md bg-bg border border-border text-ink-muted flex items-center justify-center">
          {icon}
        </div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </header>
      <div className="p-5 space-y-3">{children}</div>
    </section>
  );
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
        value ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-bg shadow transition-transform ${
          value ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-32 rounded-xl border border-border bg-surface animate-pulse"
        />
      ))}
    </div>
  );
}

// silence unused-import lint
void IconCheck;
void IconX;
