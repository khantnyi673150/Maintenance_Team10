begin;

-- A reporter's explicit category goes directly to that trade. "Not sure"
-- is submitted as null and stays in the review queue until classified.
create or replace function public.create_public_work_order(
  p_title varchar, p_description text, p_category_name text, p_location text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare item public.work_orders;
declare selected_category_id uuid;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = ''
    or coalesce(btrim(p_location), '') = '' then
    raise exception 'Title, description, and location are required' using errcode = '22023';
  end if;

  select id into selected_category_id from public.categories
  where name = p_category_name and name in ('Plumbing', 'Electrical', 'HVAC', 'Safety');
  if p_category_name is not null and selected_category_id is null then
    raise exception 'Unknown maintenance category' using errcode = '22023';
  end if;

  insert into public.work_orders(reporter_id, location_id, location_text, category_id, title, description, classification_status)
  values(null, null, btrim(p_location), selected_category_id, btrim(p_title), btrim(p_description),
    case when selected_category_id is null then 'needs_review' else 'classified' end)
  returning * into item;
  return jsonb_build_object(
    'reference_number', item.id, 'status', 'STARTED', 'created_at', item.created_at,
    'classification_status', item.classification_status
  );
end;
$$;

-- Classifying a ticket requires only this operation, even when direct column
-- updates are restricted. The caller's identity is available to audit triggers.
create or replace function public.classify_work_order(p_work_order_id uuid, p_category_id uuid)
returns public.work_orders
language plpgsql
security definer
set search_path = ''
as $$
declare item public.work_orders;
begin
  if not exists (
    select 1 from auth.users
    where id = auth.uid() and raw_app_meta_data ->> 'role' in ('staff', 'admin')
  ) then
    raise exception 'Reviewer required' using errcode = '42501';
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

-- Keep pending tickets out of the repair lifecycle, even through a stale
-- Dispatch Board or direct API call. A prior status is retained on review.
create or replace function public.require_classified_work_order()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.classification_status = 'needs_review' and old.status is distinct from new.status then
    raise exception 'Classify the ticket before changing its repair status' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.require_classified_work_order() from public, anon, authenticated, service_role;
drop trigger if exists work_order_require_classification on public.work_orders;
create trigger work_order_require_classification
before update of status on public.work_orders
for each row execute function public.require_classified_work_order();

commit;
