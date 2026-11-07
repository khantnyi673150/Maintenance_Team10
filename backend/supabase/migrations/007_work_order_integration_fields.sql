alter table public.work_orders
  add column if not exists activity_id text,
  add column if not exists idempotency_key text;

create index if not exists work_orders_activity_id_idx
  on public.work_orders(activity_id);

create index if not exists work_orders_idempotency_key_idx
  on public.work_orders(idempotency_key);

alter table public.work_orders
  alter column reporter_id drop not null;
