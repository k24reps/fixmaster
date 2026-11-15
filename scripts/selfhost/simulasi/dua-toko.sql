-- Dua toko sungguhan lewat RPC aplikasi, masing-masing dengan owner.
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'owner1@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'owner2@example.com');
begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select create_organization('Toko Satu', 'Owner Satu');
commit;
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select create_organization('Toko Dua', 'Owner Dua');
commit;
select o.name, o.plan_type, m.role from organizations o join memberships m on m.org_id = o.id;
