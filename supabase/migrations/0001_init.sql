-- BridgeFlow Operator — initial schema
create extension if not exists "pgcrypto";

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  transcript text not null,
  status text not null default 'processing',
  created_at timestamptz not null default now()
);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  agent_name text not null,
  agent_output jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists analyses_call_id_idx on analyses(call_id);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  name text,
  company text,
  email text,
  phone text,
  score text,
  decision text,
  created_at timestamptz not null default now()
);
create index if not exists leads_call_id_idx on leads(call_id);
create index if not exists leads_score_idx on leads(score);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  action_type text not null,
  action_data jsonb not null,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);
create index if not exists actions_call_id_idx on actions(call_id);
create index if not exists actions_status_idx on actions(status);
