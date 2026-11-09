begin;

-- A stable receipt keeps API retries idempotent even if a work order is archived later.
create table public.helpdesk_creation_requests (
  ticket_ref text primary key check (ticket_ref ~ '^TKT-[0-9]{1,58}$'),
  work_order_id uuid not null unique references public.work_orders(id),
  created_at timestamptz not null default now()
);
alter table public.helpdesk_creation_requests enable row level security;
revoke all on public.helpdesk_creation_requests from public, anon, authenticated, service_role;
grant select on public.helpdesk_creation_requests to service_role;

create function public.create_helpdesk_work_order(
  p_ticket_ref text, p_title text, p_description text, p_location text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.work_orders; duplicate boolean := true; violated_constraint text;
begin
  if p_ticket_ref is null or p_ticket_ref !~ '^TKT-[0-9]{1,58}$'
    or coalesce(btrim(p_title), '') = '' or length(btrim(p_title)) > 200
    or coalesce(btrim(p_description), '') = '' or length(btrim(p_description)) > 10000
    or (p_location is not null and (btrim(p_location) = '' or length(btrim(p_location)) > 300)) then
    raise exception 'Invalid Helpdesk repair fields' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('helpdesk:' || p_ticket_ref, 0));
  select w.* into item from public.helpdesk_creation_requests receipt
    join public.work_orders w on w.id = receipt.work_order_id where receipt.ticket_ref = p_ticket_ref;
  if not found then
    -- A manually submitted repair with the same reference also counts as an existing request.
    select * into item from public.work_orders where ticket_ref = p_ticket_ref
      order by (archived_at is null) desc, created_at desc, id limit 1;
    if not found then
      begin
        insert into public.work_orders(reporter_id, category_id, location_id, location_text,
          title, description, classification_status, student_identity_status, ticket_ref)
        values(null, null, null, coalesce(btrim(p_location), 'Location to be confirmed'),
          btrim(p_title), btrim(p_description), 'needs_review', 'not_checked', p_ticket_ref)
        returning * into item;
        duplicate := false;
      exception when unique_violation then
        -- Handle a manual-form submission racing this API, without suppressing other constraint failures.
        get stacked diagnostics violated_constraint = constraint_name;
        if violated_constraint <> 'work_orders_active_ticket_ref_unique' then raise; end if;
        select * into item from public.work_orders where ticket_ref = p_ticket_ref and archived_at is null;
        if not found then raise; end if;
      end;
    end if;
    insert into public.helpdesk_creation_requests(ticket_ref, work_order_id) values(p_ticket_ref, item.id);
  end if;
  -- Creation, receipt, audit history and the initial webhook all commit in one transaction.
  return jsonb_build_object('duplicate', duplicate, 'work_order', jsonb_build_object(
    'id', item.id, 'status', item.status, 'ticket_ref', item.ticket_ref, 'updated_at', item.updated_at));
end;
$$;
revoke all on function public.create_helpdesk_work_order(text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_helpdesk_work_order(text,text,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
