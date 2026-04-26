"use client";

import { useEffect, useState } from "react";
import { ActionManifest } from "../components/ActionManifest";
import { AgentStream } from "../components/AgentStream";
import { AudioUpload } from "../components/AudioUpload";
import { ConsultantChat } from "../components/ConsultantChat";
import { LeadReport } from "../components/LeadReport";
import { TranscriptUpload } from "../components/TranscriptUpload";
import { WorkflowTab } from "../components/WorkflowTab";
import {
  IconMic,
  IconPipeline,
  IconSparkle,
  IconTarget,
} from "../lib/icons";
import { useAgentStream } from "../lib/useAgentStream";

type Mode = "transcript" | "voice" | "describe" | "workflow";

function leadScore(results: ReturnType<typeof useAgentStream>["results"]): string {
  const raw = (results?.qualification as any)?.score;
  return typeof raw === "string" ? raw.toUpperCase() : "";
}

export default function PipelinePage() {
  const pipeline = useAgentStream();
  const [mode, setMode] = useState<Mode>("transcript");

  const score = leadScore(pipeline.results);
  const workflowEligible = score === "HOT" || score === "WARM";

  // When a pipeline run finishes with HOT/WARM, surface the workflow tab.
  useEffect(() => {
    if (pipeline.results && workflowEligible) setMode("workflow");
  }, [pipeline.results, workflowEligible]);

  // If the user resets and the workflow tab is no longer valid, fall back.
  useEffect(() => {
    if (mode === "workflow" && !pipeline.results) setMode("transcript");
  }, [mode, pipeline.results]);

  return (
    <div className="space-y-6">
      <PageHeader running={pipeline.running} callId={pipeline.callId} />

      <ModeTabs
        mode={mode}
        setMode={setMode}
        disabled={pipeline.running}
        workflowEligible={workflowEligible}
      />

      {mode === "workflow" && pipeline.results ? (
        <WorkflowTab results={pipeline.results} pipelineId={pipeline.callId} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <section className="lg:col-span-2 space-y-4">
            {mode === "voice" ? (
              <AudioUpload
                running={pipeline.running}
                onTranscribed={(text) => pipeline.run(text)}
                onReset={pipeline.reset}
              />
            ) : (
              <TranscriptUpload
                running={pipeline.running}
                onRun={pipeline.run}
                onReset={pipeline.reset}
              />
            )}

            {pipeline.error && (
              <div className="rounded-xl border border-hot/40 bg-hot/5 p-4 text-sm text-hot">
                {pipeline.error}
              </div>
            )}

            <AgentStream
              agents={pipeline.agents}
              running={pipeline.running}
              onCancel={pipeline.reset}
              memory={pipeline.memory}
            />
          </section>

          <section className="lg:col-span-3 space-y-4">
            {!pipeline.results && !pipeline.running && (
              <EmptyState mode={mode === "voice" ? "voice" : "transcript"} />
            )}
            {pipeline.running && !pipeline.results && <RunningState />}
            {pipeline.results && (
              <>
                <LeadReport results={pipeline.results} />
                <ActionManifest results={pipeline.results} />
                <ConsultantChat
                  pipelineId={pipeline.callId}
                  results={pipeline.results}
                />
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ModeTabs({
  mode,
  setMode,
  disabled,
  workflowEligible,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  disabled: boolean;
  workflowEligible: boolean;
}) {
  const tabs: Array<{
    id: Mode;
    label: string;
    icon: typeof IconPipeline;
    accent?: "amber";
    badge?: string;
    available: boolean;
  }> = [
    { id: "transcript", label: "Transcript", icon: IconPipeline, available: true },
    { id: "voice", label: "Call Recording", icon: IconMic, available: true },
    {
      id: "describe",
      label: "Explain your situation",
      icon: IconSparkle,
      accent: "amber",
      badge: "Coming soon",
      available: false,
    },
    {
      id: "workflow",
      label: "Workflow",
      icon: IconSparkle,
      available: workflowEligible,
      // When gated, show the rule on the tab so it's not just a dim button.
      badge: workflowEligible ? undefined : "HOT / WARM only",
    },
  ];

  return (
    <div role="tablist" className="inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-surface">
      {tabs.map((t) => {
        const active = mode === t.id;
        const Icon = t.icon;
        const isAmber = t.accent === "amber";
        const tabDisabled = disabled || !t.available;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            disabled={tabDisabled}
            onClick={() => setMode(t.id)}
            title={!t.available ? "Available after a HOT or WARM pipeline run" : undefined}
            className={`relative inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              active
                ? isAmber
                  ? "bg-amber-500/10 text-amber-200 border border-amber-500/40"
                  : "bg-bg text-ink border border-border"
                : "text-muted hover:text-ink border border-transparent"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
            {t.badge && (
              <span
                className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                  active
                    ? "border-amber-500/50 text-amber-200 bg-amber-500/15"
                    : "border-amber-500/40 text-amber-300/90 bg-amber-500/10"
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PageHeader({ running, callId }: { running: boolean; callId: string | null }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Pipeline</h1>
        <p className="text-sm text-muted mt-1">
          5 autonomous agents · streaming reasoning · persisted leads &amp; actions.
        </p>
      </div>
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${
            running
              ? "text-accent border-accent/40 bg-accent/5"
              : "text-muted border-border bg-surface"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              running ? "bg-accent animate-blink" : "bg-muted/60"
            }`}
          />
          {running ? "streaming" : "ready"}
        </span>
        {callId && (
          <span className="px-2 py-1 rounded-md border border-border bg-surface text-muted">
            call {callId.slice(0, 8)}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyState({ mode }: { mode: Mode }) {
  const isVoice = mode === "voice";
  return (
    <div className="rounded-xl border border-border bg-surface shadow-inset-hair p-10 text-center">
      <div
        className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-4 ${
          isVoice
            ? "bg-amber-500/10 border border-amber-500/30 text-amber-300"
            : "bg-accent/10 border border-accent/30 text-accent shadow-glow-accent"
        }`}
      >
        {isVoice ? <IconMic className="w-6 h-6" /> : <IconTarget className="w-6 h-6" />}
      </div>
      <div className="text-sm font-semibold text-ink">No pipeline run yet</div>
      <div className="text-xs text-muted mt-2 max-w-md mx-auto leading-relaxed">
        {isVoice
          ? "Drop an audio file on the left. We'll transcribe it with Groq Whisper and auto-run all five Opus 4.7 agents."
          : "Paste a sales call transcript or load the demo, then run the pipeline. Five Opus 4.7 agents will qualify the lead, draft a follow-up sequence, plan the actions, and self-review."}
      </div>
    </div>
  );
}

function RunningState() {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-inset-hair p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center mb-4 shadow-glow-accent">
        <IconSparkle className="w-6 h-6 animate-blink" />
      </div>
      <div className="text-sm font-semibold text-ink">Pipeline running</div>
      <div className="text-xs text-muted mt-2">
        Watch the agents think in real time on the left. The final report
        renders here as each stage completes.
      </div>
    </div>
  );
}
