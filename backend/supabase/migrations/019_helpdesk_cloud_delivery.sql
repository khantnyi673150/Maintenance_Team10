-- Run as the database owner after 018. No credentials belong in this file.
-- Supabase provides pg_cron, pg_net and Vault; enable delivery only after
-- provisioning maintenance_helpdesk_worker_secret in Vault (see setup guide).
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table maintenance_private.helpdesk_cloud_delivery (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  endpoint text not null check (
    endpoint ~ '^https://[a-zA-Z0-9.-]+/api/integrations/helpdesk/deliver$'
  ),
  last_requested_at timestamptz,
  last_request_id bigint
);
alter table maintenance_private.helpdesk_cloud_delivery enable row level security;
revoke all on maintenance_private.helpdesk_cloud_delivery from public, anon, authenticated, service_role;
insert into maintenance_private.helpdesk_cloud_delivery (endpoint)
values ('https://maintenance-team10.vercel.app/api/integrations/helpdesk/deliver');

create function maintenance_private.request_helpdesk_delivery() returns bigint
language plpgsql security definer set search_path = '' as $$
declare config maintenance_private.helpdesk_cloud_delivery; worker_secret text; request_id bigint;
begin
  -- Ignore idle queues, future retries and currently leased work. Also wake the
  -- worker to retire an exhausted lease, as claim_helpdesk_event normally does.
  if not exists (
    select 1 from public.helpdesk_outbox q
    where q.state = 'pending' and q.available_at <= now()
      and (q.leased_until is null or q.leased_until <= now())
      and (q.attempts >= 4 or not exists (
        select 1 from public.helpdesk_outbox prior
        where prior.work_order_id = q.work_order_id
          and prior.sequence < q.sequence and prior.state = 'pending'
      ))
  ) then return null; end if;

  -- Coalesce bursts without making ticket transactions wait for another kick.
  select * into config from maintenance_private.helpdesk_cloud_delivery
    where singleton and enabled for update skip locked;
  if not found or config.last_requested_at > clock_timestamp() - interval '10 seconds' then
    return null;
  end if;
  select decrypted_secret into worker_secret from vault.decrypted_secrets
    where name = 'maintenance_helpdesk_worker_secret';
  if worker_secret is null or length(worker_secret) < 16
    or worker_secret ~* '^(replace|optional|your[-_]|<)' then
    raise warning 'Helpdesk cloud delivery requires its dedicated Vault worker secret';
    return null;
  end if;

  -- pg_net queues HTTP until COMMIT. A rolled-back repair sends nothing.
  -- This is only a worker-scoped credential, never a database or partner key.
  request_id := net.http_get(
    url := config.endpoint,
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_secret),
    timeout_milliseconds := 55000
  );
  update maintenance_private.helpdesk_cloud_delivery
    set last_requested_at = clock_timestamp(), last_request_id = request_id
    where singleton;
  return request_id;
exception when others then
  -- Delivery availability must not undo a committed repair or its durable event.
  -- Do not include SQLERRM: an extension error may contain request headers.
  raise warning 'Helpdesk cloud trigger failed (%); queued events retained', sqlstate;
  return null;
end;
$$;
revoke all on function maintenance_private.request_helpdesk_delivery()
  from public, anon, authenticated, service_role;

create function maintenance_private.kick_helpdesk_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from new_helpdesk_events) then
    perform maintenance_private.request_helpdesk_delivery();
  end if;
  return null;
end;
$$;
revoke all on function maintenance_private.kick_helpdesk_delivery()
  from public, anon, authenticated, service_role;
create trigger helpdesk_cloud_delivery_after_enqueue
  after insert on public.helpdesk_outbox
  referencing new table as new_helpdesk_events
  for each statement execute function maintenance_private.kick_helpdesk_delivery();

-- The job contains no secret. It only makes a network call when work is due.
select cron.schedule('maintenance-helpdesk-delivery', '* * * * *',
  'select maintenance_private.request_helpdesk_delivery();');
commit;
