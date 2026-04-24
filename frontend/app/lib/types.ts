export type AgentName =
  | "call_analyst"
  | "lead_qualifier"
  | "campaign_architect"
  | "action_executor"
  | "reflection_agent";

export const AGENT_ORDER: AgentName[] = [
  "call_analyst",
  "lead_qualifier",
  "campaign_architect",
  "action_executor",
  "reflection_agent",
];

export const AGENT_LABELS: Record<AgentName, { title: string; subtitle: string }> = {
  call_analyst: { title: "Call Analyst", subtitle: "Extracts intent, budget, objections" },
  lead_qualifier: { title: "Lead Qualifier", subtitle: "Scores HOT / WARM / COLD" },
  campaign_architect: { title: "Campaign Architect", subtitle: "Writes follow-up sequence" },
  action_executor: { title: "Action Executor", subtitle: "Compiles action manifest" },
  reflection_agent: { title: "Reflection", subtitle: "QA + rep briefing" },
};

export type AgentStatus = "idle" | "streaming" | "done" | "error";

export interface AgentState {
  name: AgentName;
  status: AgentStatus;
  raw: string;
  output: any | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
}

export interface PipelineResults {
  call_analysis: any;
  qualification: any;
  campaign: any;
  actions: any;
  reflection: any;
}

export type StreamEvent =
  | { type: "pipeline_start"; call_id?: string | null }
  | { type: "agent_start"; agent: AgentName; index: number }
  | { type: "agent_delta"; agent: AgentName; index: number; delta: string }
  | { type: "agent_complete"; agent: AgentName; index: number; output: any }
  | { type: "pipeline_complete"; call_id?: string | null; results: PipelineResults }
  | { type: "error"; agent?: AgentName; message: string };
