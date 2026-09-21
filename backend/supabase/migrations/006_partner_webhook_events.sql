create table if not exists public.partner_webhook_events (
  event_id text primary key,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.partner_webhook_events enable row level security;