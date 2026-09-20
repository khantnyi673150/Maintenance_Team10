create extension if not exists "pgcrypto";

create type public.work_order_status as enum (
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED'
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  building varchar(150) not null,
  floor_room varchar(150) not null,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null unique,
  sla_hours integer not null check (sla_hours > 0),
  created_at timestamptz not null default now()
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  location_id uuid not null references public.locations(id),
  category_id uuid not null references public.categories(id),
  title varchar(200) not null,
  description text not null,
  resolution_notes text,
  status public.work_order_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  staff_id uuid not null references auth.users(id),
  assigned_at timestamptz not null default now()
);

create unique index one_active_assignment_per_work_order
  on public.assignments (work_order_id);

create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  changed_by uuid not null references auth.users(id),
  from_status public.work_order_status,
  to_status public.work_order_status not null,
  note text,
  timestamp timestamptz not null default now()
);

create index work_orders_status_index on public.work_orders(status);
create index work_orders_location_index on public.work_orders(location_id);
create index status_history_work_order_index on public.status_history(work_order_id, timestamp);

create or replace function public.validate_work_order_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'OPEN' and new.status = 'ASSIGNED') or
    (old.status = 'ASSIGNED' and new.status = 'IN_PROGRESS') or
    (old.status = 'IN_PROGRESS' and new.status = 'RESOLVED') or
    (old.status = 'RESOLVED' and new.status = 'CLOSED')
  ) then
    raise exception 'Invalid work-order status transition: % -> %', old.status, new.status;
  end if;

  if new.status = 'RESOLVED' then
    if not exists (
      select 1
      from public.assignments
      where work_order_id = new.id
    ) then
      raise exception 'A work order must have an assignment before resolution';
    end if;

    if coalesce(trim(new.resolution_notes), '') = '' then
      raise exception 'Resolution requires non-empty notes';
    end if;
  end if;

  return new;
end;
$$;

create trigger work_order_status_transition_trigger
before update of status on public.work_orders
for each row
execute function public.validate_work_order_status_transition();

create or replace function public.set_work_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger work_order_updated_at_trigger
before update on public.work_orders
for each row
execute function public.set_work_order_updated_at();

alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.work_orders enable row level security;
alter table public.assignments enable row level security;
alter table public.status_history enable row level security;
