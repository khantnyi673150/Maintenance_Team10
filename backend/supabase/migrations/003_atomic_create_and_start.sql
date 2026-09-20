create or replace function public.create_work_order(
  p_reporter_id uuid,
  p_location_id uuid,
  p_description text,
  p_category_id uuid,
  p_title varchar
)
returns public.work_orders
language plpgsql
security invoker
as $$
declare
  created_order public.work_orders;
begin
  if p_reporter_id <> auth.uid() then
    raise exception 'Reporter identity does not match the authenticated user';
  end if;

  insert into public.work_orders (reporter_id, location_id, description, category_id, title)
  values (p_reporter_id, p_location_id, trim(p_description), p_category_id, trim(p_title))
  returning * into created_order;

  insert into public.status_history (work_order_id, changed_by, from_status, to_status)
  values (created_order.id, auth.uid(), null, created_order.status);

  return created_order;
end;
$$;

create or replace function public.start_work_order(p_work_order_id uuid)
returns public.work_orders
language plpgsql
security invoker
as $$
declare
  current_order public.work_orders;
  updated_order public.work_orders;
begin
  if not public.current_user_is_staff() then
    raise exception 'Only staff can start work orders';
  end if;

  select * into current_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if not found then
    raise exception 'Work order not found';
  end if;

  if current_order.status <> 'ASSIGNED' then
    raise exception 'Only ASSIGNED work orders can start work';
  end if;

  update public.work_orders
  set status = 'IN_PROGRESS'
  where id = p_work_order_id
  returning * into updated_order;

  insert into public.status_history (work_order_id, changed_by, from_status, to_status)
  values (p_work_order_id, auth.uid(), current_order.status, updated_order.status);

  return updated_order;
end;
$$;
