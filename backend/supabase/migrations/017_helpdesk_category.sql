begin;

-- The five-argument overload accepts a category name, never a caller-supplied category UUID.
create function public.create_helpdesk_work_order(
  p_ticket_ref text, p_title text, p_description text, p_location text, p_category text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.work_orders; duplicate boolean := true; violated_constraint text; selected_category_id uuid;
begin
  if p_ticket_ref is null or p_ticket_ref !~ '^TKT-[0-9]{1,58}$'
    or coalesce(btrim(p_title), '') = '' or length(btrim(p_title)) > 200
    or coalesce(btrim(p_description), '') = '' or length(btrim(p_description)) > 10000
    or (p_location is not null and (btrim(p_location) = '' or length(btrim(p_location)) > 300)) then
    raise exception 'Invalid Helpdesk repair fields' using errcode = '22023';
  end if;
  if p_category is not null then
    if p_category not in ('Plumbing', 'Electrical', 'HVAC', 'Safety') then
      raise exception 'Unknown maintenance category' using errcode = '22023';
    end if;
    select id into selected_category_id from public.categories where name = p_category;
    if not found then raise exception 'Maintenance category is unavailable' using errcode = '22023'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('helpdesk:' || p_ticket_ref, 0));
  select w.* into item from public.helpdesk_creation_requests receipt
    join public.work_orders w on w.id = receipt.work_order_id where receipt.ticket_ref = p_ticket_ref;
  if not found then
    select * into item from public.work_orders where ticket_ref = p_ticket_ref
      order by (archived_at is null) desc, created_at desc, id limit 1;
    if not found then
      begin
        insert into public.work_orders(reporter_id, category_id, location_id, location_text,
          title, description, classification_status, student_identity_status, ticket_ref)
        values(null, selected_category_id, null, coalesce(btrim(p_location), 'Location to be confirmed'),
          btrim(p_title), btrim(p_description),
          case when selected_category_id is null then 'needs_review' else 'classified' end,
          'not_checked', p_ticket_ref) returning * into item;
        duplicate := false;
      exception when unique_violation then
        get stacked diagnostics violated_constraint = constraint_name;
        if violated_constraint <> 'work_orders_active_ticket_ref_unique' then raise; end if;
        select * into item from public.work_orders where ticket_ref = p_ticket_ref and archived_at is null;
        if not found then raise; end if;
      end;
    end if;
    insert into public.helpdesk_creation_requests(ticket_ref, work_order_id) values(p_ticket_ref, item.id);
  end if;
  -- A duplicate is read-only: adding/changing category on a retry never reclassifies an existing repair.
  return jsonb_build_object('duplicate', duplicate, 'work_order', jsonb_build_object(
    'id', item.id, 'status', item.status, 'ticket_ref', item.ticket_ref, 'updated_at', item.updated_at));
end;
$$;
revoke all on function public.create_helpdesk_work_order(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_helpdesk_work_order(text,text,text,text,text) to service_role;

-- Preserve the old RPC and three-field HTTP request. No category still enters Manual Review.
create or replace function public.create_helpdesk_work_order(
  p_ticket_ref text, p_title text, p_description text, p_location text default null
) returns jsonb language sql security definer set search_path = '' as $$
  select public.create_helpdesk_work_order(p_ticket_ref, p_title, p_description, p_location, null);
$$;
revoke all on function public.create_helpdesk_work_order(text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_helpdesk_work_order(text,text,text,text) to service_role;

notify pgrst, 'reload schema';
commit;
