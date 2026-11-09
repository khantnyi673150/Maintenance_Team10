begin;

alter table public.work_orders
  add column if not exists classification_status text not null default 'classified'
  check (classification_status in ('classified', 'needs_review'));

create index if not exists work_orders_manual_review_index
  on public.work_orders(classification_status, created_at)
  where archived_at is null;

create or replace function public.current_user_is_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(maintenance_private.current_app_role() = 'admin', false);
$$;
revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

create or replace function public.current_user_can_review()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(maintenance_private.current_app_role() in ('staff', 'admin'), false);
$$;
revoke all on function public.current_user_can_review() from public, anon;
grant execute on function public.current_user_can_review() to authenticated;

drop policy if exists work_orders_admin_read on public.work_orders;
create policy work_orders_admin_read on public.work_orders for select to authenticated
using (public.current_user_can_review());

drop policy if exists work_orders_admin_update on public.work_orders;
create policy work_orders_admin_update on public.work_orders for update to authenticated
using (public.current_user_can_review())
with check (public.current_user_can_review());

create or replace function public.create_public_work_order(
  p_title varchar, p_description text, p_category_id uuid, p_location_id uuid
)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog as $$
declare item public.work_orders;
declare review_status text;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = '' then
    raise exception 'Title and description are required' using errcode = '22023';
  end if;
  review_status := case when length(btrim(p_title)) < 5 or length(btrim(p_description)) < 20
    then 'needs_review' else 'classified' end;
  insert into public.work_orders(reporter_id, location_id, category_id, title, description, classification_status)
  values(null, p_location_id, p_category_id, btrim(p_title), btrim(p_description), review_status)
  returning * into item;
  return jsonb_build_object('reference_number', item.id, 'status', 'STARTED',
    'created_at', item.created_at, 'classification_status', item.classification_status);
end;
$$;

commit;
