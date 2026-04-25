-- BridgeFlow Operator V2 — QA pass schema
--
-- Idempotent: safe to re-run. RLS disabled to match 0002 (single-tenant
-- hackathon project; V4 will add per-tenant policies + service-role usage).

-- ── leads: phone column already shipped in 0001, but make it idempotent.
alter table leads add column if not exists phone text;
alter table leads add column if not exists status text default 'active';
create index if not exists leads_status_idx on leads(status);

-- ── pipeline_runs: lightweight history per /analyze run, joined to calls.
create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete set null,
  transcript_preview text,
  prospect_name text,
  company text,
  score text,
  decision text,
  status text default 'complete',           -- complete | error | partial
  approval_state text default 'none',       -- none | pending | approved | skipped | edited
  created_at timestamptz not null default now()
);
alter table pipeline_runs disable row level security;
create index if not exists pipeline_runs_call_id_idx on pipeline_runs(call_id);
create index if not exists pipeline_runs_score_idx   on pipeline_runs(score);
create index if not exists pipeline_runs_created_idx on pipeline_runs(created_at desc);

-- ── workflow_drafts: persists every Workflow Generator output.
create table if not exists workflow_drafts (
  id uuid primary key default gen_random_uuid(),
  call_id uuid references calls(id) on delete cascade,
  playbook jsonb,
  workflow_json jsonb,
  credentials jsonb,
  validation jsonb,
  platform text not null default 'n8n',
  created_at timestamptz not null default now()
);
alter table workflow_drafts disable row level security;
create index if not exists workflow_drafts_call_id_idx on workflow_drafts(call_id);
create index if not exists workflow_drafts_platform_idx on workflow_drafts(platform);
