-- BridgeFlow Operator V2: company identity vault + Telegram-gated approvals.
-- RLS disabled to match 0002 — single-tenant hackathon project. V4 will move
-- to per-tenant policies + service-role usage.

create table if not exists company_profiles (
  id text primary key default 'default',
  company_name text,
  industry text,
  what_you_sell text,
  target_client text,
  agent_name text,
  agent_tone text,
  agent_persona text,
  pricing_notes text,
  objection_1_q text,
  objection_1_a text,
  objection_2_q text,
  objection_2_a text,
  objection_3_q text,
  objection_3_a text,
  booking_link text,
  custom_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table company_profiles disable row level security;

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists company_profiles_updated_at on company_profiles;
create trigger company_profiles_updated_at
  before update on company_profiles
  for each row execute function set_updated_at();

create table if not exists pending_approvals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls(id) on delete cascade,
  email_payload jsonb not null,                 -- { to, subject, content, sequence }
  status text not null default 'pending',       -- pending | approved | edited | skipped
  telegram_message_id bigint,                   -- the approval prompt we sent (for reply_to correlation)
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table pending_approvals disable row level security;
create index if not exists pending_approvals_call_id_idx  on pending_approvals(call_id);
create index if not exists pending_approvals_status_idx   on pending_approvals(status);
create index if not exists pending_approvals_tg_msg_idx   on pending_approvals(telegram_message_id);

drop trigger if exists pending_approvals_updated_at on pending_approvals;
create trigger pending_approvals_updated_at
  before update on pending_approvals
  for each row execute function set_updated_at();
