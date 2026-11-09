begin;

alter table public.work_orders
  add column if not exists student_identity_status text not null default 'not_checked';

do $$
begin
  alter table public.work_orders
    add constraint work_orders_student_identity_status_check
    check (student_identity_status in ('not_checked', 'identified', 'not_identified'));
exception
  when duplicate_object then null;
end;
$$;

drop function if exists public.create_public_work_order(varchar, text, text, text);

create function public.create_public_work_order(
  p_title varchar,
  p_description text,
  p_category_name text,
  p_location text,
  p_student_identity_status text
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
  if p_student_identity_status is null
    or p_student_identity_status not in ('identified', 'not_identified') then
    raise exception 'Invalid student identity status' using errcode = '22023';
  end if;

  select id into selected_category_id from public.categories
  where name = p_category_name and name in ('Plumbing', 'Electrical', 'HVAC', 'Safety');
  if p_category_name is not null and selected_category_id is null then
    raise exception 'Unknown maintenance category' using errcode = '22023';
  end if;

  insert into public.work_orders(
    reporter_id, location_id, location_text, category_id, title, description,
    classification_status, student_identity_status
  )
  values(
    null, null, btrim(p_location), selected_category_id, btrim(p_title), btrim(p_description),
    case when selected_category_id is null then 'needs_review' else 'classified' end,
    p_student_identity_status
  )
  returning * into item;

  return jsonb_build_object(
    'reference_number', item.id,
    'status', 'STARTED',
    'created_at', item.created_at,
    'classification_status', item.classification_status,
    'student_identity_status', item.student_identity_status
  );
end;
$$;

create function public.create_public_work_order(
  p_title varchar,
  p_description text,
  p_category_name text,
  p_location text
)
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select public.create_public_work_order(
    p_title, p_description, p_category_name, p_location, 'not_identified'
  );
$$;

revoke all on function public.create_public_work_order(varchar, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_public_work_order(varchar, text, text, text, text)
  to service_role;
revoke all on function public.create_public_work_order(varchar, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_public_work_order(varchar, text, text, text)
  to anon, authenticated;

create or replace function public.list_public_work_orders(
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(jsonb_agg(to_jsonb(result) order by result.created_at desc), '[]'::jsonb)
  from (
    select
      w.id as reference_number,
      public.redact_public_text(w.title::text) as title,
      public.redact_public_text(w.description::text) as description,
      case
        when w.status = 'OPEN' then 'STARTED'
        when w.status in ('ASSIGNED', 'IN_PROGRESS') then 'IN_PROGRESS'
        else 'FINISHED'
      end as status,
      w.student_identity_status,
      w.created_at,
      w.updated_at,
      jsonb_build_object('id', c.id, 'name', coalesce(c.name, 'Unknown')) as category,
      jsonb_build_object('id', l.id, 'building', coalesce(l.building, w.location_text), 'floor_room', coalesce(l.floor_room, '')) as location
    from public.work_orders w
    left join public.categories c on c.id = w.category_id
    left join public.locations l on l.id = w.location_id
    where w.archived_at is null
      and (
        p_status is null
        or (p_status = 'STARTED' and w.status = 'OPEN')
        or (p_status = 'IN_PROGRESS' and w.status in ('ASSIGNED', 'IN_PROGRESS'))
        or (p_status = 'FINISHED' and w.status in ('RESOLVED', 'CLOSED'))
      )
    order by w.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(coalesce(p_offset, 0), 0)
  ) result;
$$;

revoke all on function public.list_public_work_orders(text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_public_work_orders(text, integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
