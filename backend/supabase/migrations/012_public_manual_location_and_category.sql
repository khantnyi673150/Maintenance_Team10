begin;

drop function if exists public.create_public_work_order(varchar, text, uuid, uuid);
drop function if exists public.create_public_work_order(varchar, text, uuid, text);

alter table public.work_orders
  alter column reporter_id drop not null,
  alter column location_id drop not null,
  alter column category_id drop not null;

alter table public.work_orders
  add column if not exists location_text varchar(300);

alter table public.work_orders
  add column if not exists classification_status text not null default 'classified';

do $$
begin
  alter table public.work_orders
    add constraint work_orders_classification_status_check
    check (classification_status in ('classified', 'needs_review'));
exception
  when duplicate_object then null;
end;
$$;

create index if not exists work_orders_manual_review_index
  on public.work_orders(classification_status, created_at)
  where archived_at is null;

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

insert into public.categories(name, sla_hours)
values
  ('Plumbing', 12),
  ('Electrical', 8),
  ('HVAC', 18),
  ('Safety', 24)
on conflict (name) do nothing;

create or replace function public.get_public_work_order_metadata()
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'categories',
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sla_hours', sla_hours) order by name)
       from public.categories
       where name in ('Plumbing', 'Electrical', 'HVAC', 'Safety')),
      '[]'::jsonb
    ),
    'locations',
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', id, 'building', building, 'floor_room', floor_room) order by building, floor_room)
       from public.locations),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.create_public_work_order(
  p_title varchar,
  p_description text,
  p_category_name text,
  p_location text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare item public.work_orders;
declare review_status text;
declare selected_category_id uuid;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_description), '') = ''
    or coalesce(btrim(p_location), '') = '' then
    raise exception 'Title, description, and location are required' using errcode = '22023';
  end if;
  select id into selected_category_id from public.categories where name = p_category_name;
  if p_category_name is not null and selected_category_id is null then
    raise exception 'Unknown maintenance category' using errcode = '22023';
  end if;
  review_status := case
    when selected_category_id is null or length(btrim(p_title)) < 5 or length(btrim(p_description)) < 20
      then 'needs_review'
    else 'classified'
  end;
  insert into public.work_orders(reporter_id, location_id, location_text, category_id, title, description, classification_status)
  values(null, null, btrim(p_location), selected_category_id, btrim(p_title), btrim(p_description), review_status)
  returning * into item;
  return jsonb_build_object(
    'reference_number', item.id,
    'status', 'STARTED',
    'created_at', item.created_at,
    'classification_status', item.classification_status
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
      public.redact_public_text(w.title::text) as title,
      public.redact_public_text(w.description::text) as description,
      case
        when w.status = 'OPEN' then 'STARTED'
        when w.status in ('ASSIGNED', 'IN_PROGRESS') then 'IN_PROGRESS'
        else 'FINISHED'
      end as status,
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

revoke all on function public.create_public_work_order(varchar, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_work_order(varchar, text, text, text) to anon, authenticated;
revoke all on function public.get_public_work_order_metadata() from public, anon, authenticated;
grant execute on function public.get_public_work_order_metadata() to anon, authenticated;
revoke all on function public.list_public_work_orders(text, integer, integer) from public, anon, authenticated;
grant execute on function public.list_public_work_orders(text, integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
