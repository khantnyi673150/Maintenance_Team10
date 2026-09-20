create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'staff'
    or (auth.jwt() -> 'user_metadata' ->> 'role') = 'staff',
    false
  );
$$;

alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.work_orders enable row level security;
alter table public.assignments enable row level security;
alter table public.status_history enable row level security;

drop policy if exists locations_authenticated_read on public.locations;
create policy locations_authenticated_read
  on public.locations for select to authenticated using (true);

drop policy if exists categories_authenticated_read on public.categories;
create policy categories_authenticated_read
  on public.categories for select to authenticated using (true);

drop policy if exists work_orders_read on public.work_orders;
create policy work_orders_read
  on public.work_orders for select to authenticated
  using (reporter_id = auth.uid() or public.current_user_is_staff());

drop policy if exists work_orders_create on public.work_orders;
create policy work_orders_create
  on public.work_orders for insert to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists work_orders_staff_update on public.work_orders;
create policy work_orders_staff_update
  on public.work_orders for update to authenticated
  using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

drop policy if exists assignments_read on public.assignments;
create policy assignments_read
  on public.assignments for select to authenticated
  using (
    public.current_user_is_staff()
    or exists (
      select 1 from public.work_orders
      where work_orders.id = assignments.work_order_id
        and work_orders.reporter_id = auth.uid()
    )
  );

drop policy if exists assignments_staff_create on public.assignments;
create policy assignments_staff_create
  on public.assignments for insert to authenticated
  with check (public.current_user_is_staff());

drop policy if exists status_history_read on public.status_history;
create policy status_history_read
  on public.status_history for select to authenticated
  using (
    public.current_user_is_staff()
    or exists (
      select 1 from public.work_orders
      where work_orders.id = status_history.work_order_id
        and work_orders.reporter_id = auth.uid()
    )
  );

drop policy if exists status_history_create on public.status_history;
create policy status_history_create
  on public.status_history for insert to authenticated
  with check (
    changed_by = auth.uid()
    and (public.current_user_is_staff() or to_status = 'OPEN')
  );

drop policy if exists status_history_no_update on public.status_history;
create policy status_history_no_update
  on public.status_history for update to authenticated using (false);

drop policy if exists status_history_no_delete on public.status_history;
create policy status_history_no_delete
  on public.status_history for delete to authenticated using (false);

create or replace function public.assign_work_order(
  p_work_order_id uuid,
  p_staff_id uuid
)
returns public.work_orders
language plpgsql
security invoker
as $$
declare
  current_order public.work_orders;
  updated_order public.work_orders;
begin
  if not public.current_user_is_staff() then
    raise exception 'Only staff can assign work orders';
  end if;

  select * into current_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if not found then
    raise exception 'Work order not found';
  end if;

  if current_order.status <> 'OPEN' then
    raise exception 'Only OPEN work orders can be assigned';
  end if;

  insert into public.assignments (work_order_id, staff_id)
  values (p_work_order_id, p_staff_id);

  update public.work_orders
  set status = 'ASSIGNED'
  where id = p_work_order_id
  returning * into updated_order;

  insert into public.status_history (work_order_id, changed_by, from_status, to_status)
  values (p_work_order_id, auth.uid(), current_order.status, updated_order.status);

  return updated_order;
end;
$$;

create or replace function public.resolve_work_order(
  p_work_order_id uuid,
  p_resolution_notes text
)
returns public.work_orders
language plpgsql
security invoker
as $$
declare
  current_order public.work_orders;
  updated_order public.work_orders;
begin
  if not public.current_user_is_staff() then
    raise exception 'Only staff can resolve work orders';
  end if;

  select * into current_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if not found then
    raise exception 'Work order not found';
  end if;

  if current_order.status <> 'IN_PROGRESS' then
    raise exception 'Only IN_PROGRESS work orders can be resolved';
  end if;

  update public.work_orders
  set resolution_notes = trim(p_resolution_notes), status = 'RESOLVED'
  where id = p_work_order_id
  returning * into updated_order;

  insert into public.status_history (work_order_id, changed_by, from_status, to_status, note)
  values (p_work_order_id, auth.uid(), current_order.status, updated_order.status, updated_order.resolution_notes);

  return updated_order;
end;
$$;

create or replace function public.close_work_order(p_work_order_id uuid)
returns public.work_orders
language plpgsql
security invoker
as $$
declare
  current_order public.work_orders;
  updated_order public.work_orders;
begin
  if not public.current_user_is_staff() then
    raise exception 'Only staff can close work orders';
  end if;

  select * into current_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if not found then
    raise exception 'Work order not found';
  end if;

  if current_order.status <> 'RESOLVED' then
    raise exception 'Only RESOLVED work orders can be closed';
  end if;

  update public.work_orders
  set status = 'CLOSED'
  where id = p_work_order_id
  returning * into updated_order;

  insert into public.status_history (work_order_id, changed_by, from_status, to_status)
  values (p_work_order_id, auth.uid(), current_order.status, updated_order.status);

  return updated_order;
end;
$$;
