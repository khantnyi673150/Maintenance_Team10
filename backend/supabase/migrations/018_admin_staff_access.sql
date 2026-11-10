begin;

create or replace function maintenance_private.staff_category_id(p_user_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select c.id
  from auth.users u
  join public.categories c on c.name = coalesce(
    nullif(u.raw_app_meta_data -> 'maintenance_category', 'null'::jsonb),
    u.raw_app_meta_data -> 'category'
  ) #>> '{}'
  where u.id = p_user_id and u.raw_app_meta_data ->> 'role' = 'staff'
    and c.name in ('Plumbing', 'Electrical', 'HVAC', 'Safety');
$$;
revoke all on function maintenance_private.staff_category_id(uuid) from public, anon, authenticated, service_role;

create or replace function maintenance_private.current_staff_category_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select maintenance_private.staff_category_id(auth.uid());
$$;
revoke all on function maintenance_private.current_staff_category_id() from public, anon, authenticated, service_role;
grant execute on function maintenance_private.current_staff_category_id() to authenticated;

create or replace function public.current_user_can_review()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(maintenance_private.current_app_role() = 'admin', false);
$$;
revoke all on function public.current_user_can_review() from public, anon, service_role;
grant execute on function public.current_user_can_review() to authenticated;

drop policy if exists work_orders_admin_read on public.work_orders;
create policy work_orders_admin_read on public.work_orders for select to authenticated
using ((select public.current_user_can_review()));
drop policy if exists work_orders_admin_update on public.work_orders;

drop policy if exists work_orders_read on public.work_orders;
create policy work_orders_read on public.work_orders for select to authenticated
using (
  (maintenance_private.current_app_role() = 'reporter' and reporter_id = auth.uid())
  or (classification_status = 'classified' and category_id = (select maintenance_private.current_staff_category_id()))
);

drop policy if exists work_orders_staff_update on public.work_orders;
create policy work_orders_staff_update on public.work_orders for update to authenticated
using (classification_status = 'classified' and category_id = (select maintenance_private.current_staff_category_id()))
with check (classification_status = 'classified' and category_id = (select maintenance_private.current_staff_category_id()));

drop policy if exists work_orders_create on public.work_orders;
create policy work_orders_create on public.work_orders for insert to authenticated
with check (
  reporter_id = auth.uid()
  and (
    maintenance_private.current_app_role() = 'reporter'
    or (classification_status = 'classified' and category_id = (select maintenance_private.current_staff_category_id()))
  )
  and status = 'OPEN' and archived_at is null and resolution_notes is null
  and activity_id is null and idempotency_key is null and partner_source is null
);

drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated
using (exists (select 1 from public.work_orders w where w.id = work_order_id));

drop policy if exists assignments_staff_create on public.assignments;
create policy assignments_staff_create on public.assignments for insert to authenticated
with check (public.current_user_is_staff() and exists (
  select 1 from public.work_orders w
  where w.id = work_order_id and w.archived_at is null and w.status = 'OPEN'
));

drop policy if exists status_history_read on public.status_history;
create policy status_history_read on public.status_history for select to authenticated
using (exists (select 1 from public.work_orders w where w.id = work_order_id));

create or replace function maintenance_private.validate_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.work_orders w
    where w.id = new.work_order_id and w.classification_status = 'classified'
      and w.category_id = maintenance_private.staff_category_id(new.staff_id)
  ) then
    raise exception 'Assignee must be approved for this maintenance category' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.classify_work_order(p_work_order_id uuid, p_category_id uuid)
returns public.work_orders language plpgsql security definer set search_path = '' as $$
declare item public.work_orders;
begin
  if not public.current_user_can_review() then
    raise exception 'Administrator required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.categories
    where id = p_category_id and name in ('Plumbing', 'Electrical', 'HVAC', 'Safety')
  ) then
    raise exception 'Choose a maintenance category' using errcode = '22023';
  end if;

  update public.work_orders
  set category_id = p_category_id, classification_status = 'classified'
  where id = p_work_order_id and classification_status = 'needs_review' and archived_at is null
  returning * into item;

  if not found then
    raise exception 'Work order is no longer awaiting review' using errcode = 'P0002';
  end if;
  return item;
end;
$$;

revoke all on function public.classify_work_order(uuid, uuid) from public, anon, service_role;
grant execute on function public.classify_work_order(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
