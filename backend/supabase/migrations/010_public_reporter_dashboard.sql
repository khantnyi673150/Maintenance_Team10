-- Public reporter surface. It deliberately exposes no reporter identity,
-- assignment identity, audit notes, or resolution notes.
begin;

create or replace function public.redact_public_text(input text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(input, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact removed]', 'gi'),
        '(\+?[0-9][0-9 ()-]{7,}[0-9])', '[contact removed]', 'g'
      ),
      '(bearer|api[_ -]?key|token|password|secret)\s*[:=]\s*\S+', '[private detail removed]', 'gi'
    )
  );
$$;

create or replace function public.get_public_work_order_metadata()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sla_hours', sla_hours) order by name) from public.categories), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'building', building, 'floor_room', floor_room) order by building, floor_room) from public.locations), '[]'::jsonb)
  );
$$;

create or replace function public.create_public_work_order(
  p_title varchar,
  p_description text,
  p_category_id uuid,
  p_location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare item public.work_orders;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = '' then
    raise exception 'Title and description are required' using errcode = '22023';
  end if;

  insert into public.work_orders(reporter_id, location_id, category_id, title, description)
  values(null, p_location_id, p_category_id, btrim(p_title), btrim(p_description))
  returning * into item;

  return jsonb_build_object(
    'reference_number', item.id,
    'status', 'STARTED',
    'created_at', item.created_at
  );
end;
$$;

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
      public.redact_public_text(w.title) as title,
      public.redact_public_text(w.description) as description,
      case
        when w.status = 'OPEN' then 'STARTED'
        when w.status in ('ASSIGNED', 'IN_PROGRESS') then 'IN_PROGRESS'
        else 'FINISHED'
      end as status,
      w.created_at,
      w.updated_at,
      jsonb_build_object('id', c.id, 'name', c.name) as category,
      jsonb_build_object('id', l.id, 'building', l.building, 'floor_room', l.floor_room) as location
    from public.work_orders w
    join public.categories c on c.id = w.category_id
    join public.locations l on l.id = w.location_id
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

revoke all on function public.redact_public_text(text) from public, anon, authenticated;
revoke all on function public.get_public_work_order_metadata() from public, anon, authenticated;
revoke all on function public.create_public_work_order(varchar, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.list_public_work_orders(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_public_work_order_metadata() to anon, authenticated;
grant execute on function public.create_public_work_order(varchar, text, uuid, uuid) to anon, authenticated;
grant execute on function public.list_public_work_orders(text, integer, integer) to anon, authenticated;

commit;
