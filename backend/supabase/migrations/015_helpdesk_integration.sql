begin;

alter table public.work_orders add column if not exists ticket_ref text;
alter table public.work_orders add constraint work_orders_ticket_ref_format
  check (ticket_ref is null or ticket_ref ~ '^TKT-[0-9]{1,58}$');
create unique index work_orders_active_ticket_ref_unique on public.work_orders(ticket_ref)
  where ticket_ref is not null and archived_at is null;
-- A submitted reference cannot silently be transferred to another Helpdesk ticket.
create function maintenance_private.protect_ticket_ref() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ticket_ref is distinct from old.ticket_ref then
    raise exception 'Helpdesk reference is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function maintenance_private.protect_ticket_ref() from public, anon, authenticated, service_role;
create trigger work_order_ticket_ref_guard before update of ticket_ref on public.work_orders
  for each row execute function maintenance_private.protect_ticket_ref();
grant insert(ticket_ref) on public.work_orders to authenticated;

-- Keep the original five-argument RPC available to existing clients.
create function public.create_work_order(
  p_reporter_id uuid, p_location_id uuid, p_description text, p_category_id uuid,
  p_title varchar, p_ticket_ref text
) returns public.work_orders language plpgsql security invoker set search_path = '' as $$
declare item public.work_orders;
begin
  if auth.uid() is null or p_reporter_id is distinct from auth.uid()
    or coalesce(maintenance_private.current_app_role(), '') not in ('reporter', 'staff') then
    raise exception 'Invalid reporter identity' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = '' then
    raise exception 'Title and description are required' using errcode = '22023';
  end if;
  insert into public.work_orders(reporter_id, location_id, description, category_id, title, ticket_ref)
  values(p_reporter_id, p_location_id, btrim(p_description), p_category_id, btrim(p_title), p_ticket_ref)
  returning * into item;
  return item;
end;
$$;
revoke all on function public.create_work_order(uuid,uuid,text,uuid,varchar,text) from public, anon, service_role;
grant execute on function public.create_work_order(uuid,uuid,text,uuid,varchar,text) to authenticated;

-- Only the backend service can supply an identity-check result, as before.
-- Old public RPC signatures remain unchanged for clients without ticketRef.
create function public.create_public_work_order(
  p_title varchar, p_description text, p_category_name text, p_location text,
  p_student_identity_status text, p_ticket_ref text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.work_orders; selected_category_id uuid;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = ''
    or coalesce(btrim(p_location), '') = '' then
    raise exception 'Title, description, and location are required' using errcode = '22023';
  end if;
  if p_student_identity_status is null or p_student_identity_status not in ('identified', 'not_identified') then
    raise exception 'Invalid student identity status' using errcode = '22023';
  end if;
  select id into selected_category_id from public.categories
    where name = p_category_name and name in ('Plumbing', 'Electrical', 'HVAC', 'Safety');
  if p_category_name is not null and selected_category_id is null then
    raise exception 'Unknown maintenance category' using errcode = '22023';
  end if;
  insert into public.work_orders(reporter_id, location_id, location_text, category_id, title,
    description, classification_status, student_identity_status, ticket_ref)
  values(null, null, btrim(p_location), selected_category_id, btrim(p_title), btrim(p_description),
    case when selected_category_id is null then 'needs_review' else 'classified' end,
    p_student_identity_status, p_ticket_ref) returning * into item;
  return jsonb_build_object('reference_number', item.id, 'status', 'STARTED',
    'created_at', item.created_at, 'classification_status', item.classification_status,
    'student_identity_status', item.student_identity_status, 'ticketRef', item.ticket_ref);
end;
$$;
revoke all on function public.create_public_work_order(varchar,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_public_work_order(varchar,text,text,text,text,text) to service_role;

create table public.helpdesk_outbox (
  event_id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id),
  sequence smallint not null check (sequence between 1 and 5),
  body text not null,
  state text not null default 'pending' check (state in ('pending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 4),
  available_at timestamptz not null default now(),
  lease_token uuid,
  leased_until timestamptz,
  last_http_status integer,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(work_order_id, sequence)
);
create index helpdesk_outbox_pending on public.helpdesk_outbox(available_at)
  where state = 'pending';
alter table public.helpdesk_outbox enable row level security;
revoke all on public.helpdesk_outbox from public, anon, authenticated, service_role;
grant select on public.helpdesk_outbox to service_role;

-- The outbox insert commits or rolls back with the work order and audit entry.
create function maintenance_private.helpdesk_status(p_status text) returns text
language sql immutable set search_path = '' as $$
  select case p_status when 'OPEN' then 'reported' when 'ASSIGNED' then 'assigned'
    when 'IN_PROGRESS' then 'in_progress' when 'RESOLVED' then 'completed' when 'CLOSED' then 'closed' end;
$$;
revoke all on function maintenance_private.helpdesk_status(text) from public, anon, authenticated, service_role;
create function maintenance_private.enqueue_helpdesk_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event_uuid uuid := gen_random_uuid(); changed_at timestamptz := clock_timestamp();
  previous_status text := null; seq smallint;
begin
  if new.ticket_ref is null or new.archived_at is not null then return new; end if;
  if tg_op = 'UPDATE' then
    if new.status = old.status then return new; end if;
    previous_status := maintenance_private.helpdesk_status(old.status::text);
  end if;
  seq := case new.status when 'OPEN' then 1 when 'ASSIGNED' then 2 when 'IN_PROGRESS' then 3
    when 'RESOLVED' then 4 when 'CLOSED' then 5 end;
  insert into public.helpdesk_outbox(event_id, work_order_id, sequence, body)
  values(event_uuid, new.id, seq, jsonb_build_object(
    'eventId', event_uuid, 'type', 'maintenance.status_changed', 'occurredAt', changed_at,
    'source', 'maintenance', 'subject', 'work-order:' || new.id::text,
    'data', jsonb_build_object('workOrderId', new.id, 'ticketRef', new.ticket_ref,
      'previousStatus', previous_status, 'status', maintenance_private.helpdesk_status(new.status::text), 'changedAt', changed_at)
  )::text);
  return new;
end;
$$;
revoke all on function maintenance_private.enqueue_helpdesk_event() from public, anon, authenticated, service_role;
create trigger helpdesk_status_outbox after insert or update of status on public.work_orders
  for each row execute function maintenance_private.enqueue_helpdesk_event();

-- Claim one event, preserving per-work-order order and fencing concurrent workers.
create function public.claim_helpdesk_event() returns setof public.helpdesk_outbox
language plpgsql security definer set search_path = '' as $$
begin
  update public.helpdesk_outbox set state = 'failed', lease_token = null, leased_until = null
    where state = 'pending' and attempts >= 4 and leased_until <= now();
  return query
  with candidate as (
    select q.event_id from public.helpdesk_outbox q
    where q.state = 'pending' and q.attempts < 4 and q.available_at <= now()
      and (q.leased_until is null or q.leased_until <= now())
      and not exists (select 1 from public.helpdesk_outbox prior
        where prior.work_order_id = q.work_order_id and prior.sequence < q.sequence and prior.state = 'pending')
    order by q.available_at, q.created_at, q.event_id
    limit 1 for update of q skip locked
  )
  update public.helpdesk_outbox q set attempts = q.attempts + 1,
    lease_token = gen_random_uuid(), leased_until = now() + interval '60 seconds'
  from candidate where q.event_id = candidate.event_id returning q.*;
end;
$$;

create function public.finish_helpdesk_event(p_event_id uuid, p_lease_token uuid, p_http_status integer)
returns void language plpgsql security definer set search_path = '' as $$
declare item public.helpdesk_outbox; retryable boolean;
begin
  select * into item from public.helpdesk_outbox where event_id = p_event_id
    and lease_token = p_lease_token and state = 'pending' for update;
  if not found then raise exception 'Delivery lease is no longer valid' using errcode = '40001'; end if;
  retryable := p_http_status is null or p_http_status between 500 and 599;
  update public.helpdesk_outbox set
    state = case when p_http_status in (200, 202) then 'delivered'
      when retryable and item.attempts < 4 then 'pending' else 'failed' end,
    available_at = now() + make_interval(secs => case item.attempts when 1 then 60 when 2 then 300 else 1800 end),
    delivered_at = case when p_http_status in (200, 202) then now() else null end,
    last_http_status = p_http_status, lease_token = null, leased_until = null
  where event_id = p_event_id;
end;
$$;
revoke all on function public.claim_helpdesk_event(), public.finish_helpdesk_event(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function public.claim_helpdesk_event(), public.finish_helpdesk_event(uuid,uuid,integer)
  to service_role;

notify pgrst, 'reload schema';
commit;
