-- Seed data for the frontend API test console.
-- These IDs match the default request payload used in the browser client.

insert into public.locations (id, building, floor_room)
values (
  '11111111-1111-1111-1111-111111111111',
  'Laboratory Wing',
  'Second Floor - Lab 204'
)
on conflict (id) do nothing;

insert into public.categories (id, name, sla_hours)
values (
  '22222222-2222-2222-2222-222222222222',
  'Plumbing',
  12
)
on conflict (id) do nothing;
