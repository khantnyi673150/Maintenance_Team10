-- Use RFC-compliant UUIDs for the frontend API test payload.

insert into public.locations (id, building, floor_room)
values (
  '11111111-1111-4111-8111-111111111111',
  'Laboratory Wing',
  'Second Floor - Lab 204'
)
on conflict (id) do nothing;

insert into public.categories (id, name, sla_hours)
values (
  '22222222-2222-4222-8222-222222222222',
  'Plumbing API Test',
  12
)
on conflict (id) do nothing;