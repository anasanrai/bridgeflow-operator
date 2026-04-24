"use client";

import { ActionManifest } from "./components/ActionManifest";
import { AgentStream } from "./components/AgentStream";
import { LeadReport } from "./components/LeadReport";
import { TranscriptUpload } from "./components/TranscriptUpload";
import { IconSparkle, IconTarget } from "./lib/icons";
import { useAgentStream } from "./lib/useAgentStream";

export default function PipelinePage() {
  const pipeline = useAgentStream();

  return (
    <div className="space-y-6">
      <PageHeader running={pipeline.running} callId={pipeline.callId} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="lg:col-span-2 space-y-4">
          <TranscriptUpload
            running={pipeline.running}
            onRun={pipeline.run}
            onReset={pipeline.reset}
          />

          {pipeline.error && (
            <div className="rounded-xl border border-hot/40 bg-hot/5 p-4 text-sm text-hot">
              {pipeline.error}
            </div>
          )}

          <AgentStream agents={pipeline.agents} running={pipeline.running} />
        </section>

        <section className="lg:col-span-3 space-y-4">
          {!pipeline.results && !pipeline.running && <EmptyState />}
          {pipeline.running && !pipeline.results && <RunningState />}
          {pipeline.results && (
            <>
              <LeadReport results={pipeline.results} />
              <ActionManifest results={pipeline.results} />
            </>
          )}
        </section>
      </div>
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

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-inset-hair p-10 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-accent/10 border border-accent/30 text-accent flex items-center justify-center mb-4 shadow-glow-accent">
        <IconTarget className="w-6 h-6" />
      </div>
      <div className="text-sm font-semibold text-ink">No pipeline run yet</div>
      <div className="text-xs text-muted mt-2 max-w-md mx-auto leading-relaxed">
        Paste a sales call transcript or load the demo, then run the pipeline.
        Five Opus 4.7 agents will qualify the lead, draft a follow-up sequence,
        plan the actions, and self-review.
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
