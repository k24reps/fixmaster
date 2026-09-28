-- ============================================================
-- FixMaster — 0094: isian penerimaan unit + kunci layar sementara (28 Sep 2026)
--
-- A. services: IMEI/SN dan kondisi fisik saat unit diterima (teks biasa, ikut
--    nota) + `secret_kind` — HANYA jenis kunci layar (pin/pola/sandi), bukan
--    isinya, supaya tiket tetap bisa berkata "PIN diberikan · sudah dihapus".
--
-- B. service_secrets: isi kunci layar di tabel TERPISAH. RLS menyala tanpa
--    policy: tak ada akses tabel langsung, tak masuk publikasi realtime, tak
--    ikut SERVICE_LIST_COLUMNS, tak ikut auto-backup per toko. Akses hanya lewat
--    dua RPC:
--      set_service_secret — anggota yang boleh memakai cabang tiket; string
--        kosong = hapus. Menyetel services.secret_kind dalam transaksi yang sama.
--      get_service_secret — hanya owner/admin atau teknisi yang ditugaskan.
--
-- C. Penghapusan otomatis:
--      - trigger: begitu tiket ditandai diambil, kunci layarnya dihapus;
--      - pg_cron harian: tiket batal/terhapus yang tak tersentuh 30 hari.
--
-- Cadangan offsite (backup-offsite.sh/.ps1) mengecualikan ISI tabel ini
-- (--exclude-table-data), jadi arsip Google Drive tak pernah memuatnya.
-- ============================================================

-- ---------- A ----------
alter table services add column if not exists device_serial text not null default '';
alter table services add column if not exists device_condition text not null default '';
alter table services add column if not exists secret_kind text;
alter table services drop constraint if exists services_secret_kind_check;
alter table services add constraint services_secret_kind_check
  check (secret_kind is null or secret_kind in ('pin', 'pola', 'sandi'));

-- ---------- B ----------
create table if not exists service_secrets (
  service_id uuid primary key references services(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('pin', 'pola', 'sandi')),
  secret text not null check (char_length(secret) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table service_secrets enable row level security;
revoke all on table service_secrets from anon, authenticated;

create or replace function set_service_secret(
  p_org_id uuid,
  p_service_id uuid,
  p_kind text,
  p_secret text
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
  v_secret text := btrim(coalesce(p_secret, ''));
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_service from services
    where id = p_service_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_service.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_service.picked_up then
    raise exception 'Unit sudah diambil — kunci layar tidak disimpan lagi';
  end if;

  if v_secret = '' then
    delete from service_secrets where service_id = p_service_id;
    update services set secret_kind = null, updated_at = now() where id = p_service_id;
    return;
  end if;
  if p_kind not in ('pin', 'pola', 'sandi') then raise exception 'Jenis kunci layar tidak valid'; end if;
  if char_length(v_secret) > 64 then raise exception 'Kunci layar terlalu panjang'; end if;

  insert into service_secrets (service_id, org_id, kind, secret)
    values (p_service_id, p_org_id, p_kind, v_secret)
  on conflict (service_id) do update
    set kind = excluded.kind, secret = excluded.secret, updated_at = now();
  update services set secret_kind = p_kind, updated_at = now() where id = p_service_id;
end;
$$;
revoke all on function set_service_secret(uuid, uuid, text, text) from public, anon;
grant execute on function set_service_secret(uuid, uuid, text, text) to authenticated;

create or replace function get_service_secret(
  p_org_id uuid,
  p_service_id uuid
) returns table (kind text, secret text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  select * into v_service from services
    where id = p_service_id and org_id = p_org_id and deleted_at is null;
  if not found then raise exception 'Service not found'; end if;
  if not (
    is_org_manager(p_org_id)
    or v_service.technician_id in (
      select m.id from memberships m
       where m.user_id = auth.uid() and m.org_id = p_org_id and m.active
    )
  ) then
    raise exception 'Kunci layar hanya untuk teknisi yang ditugaskan dan owner/admin';
  end if;
  return query
    select ss.kind, ss.secret from service_secrets ss
     where ss.service_id = p_service_id and not v_service.picked_up;
end;
$$;
revoke all on function get_service_secret(uuid, uuid) from public, anon;
grant execute on function get_service_secret(uuid, uuid) to authenticated;

-- ---------- C ----------
create or replace function services_purge_secret_on_pickup()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.picked_up and not coalesce(old.picked_up, false) then
    delete from service_secrets where service_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists services_purge_secret_on_pickup on services;
create trigger services_purge_secret_on_pickup
  after update of picked_up on services
  for each row execute function services_purge_secret_on_pickup();

create or replace function purge_stale_service_secrets()
returns void
language sql security definer
set search_path = public, pg_temp
as $$
  delete from service_secrets ss
   using services s
   where s.id = ss.service_id
     and (s.picked_up or s.deleted_at is not null or s.status = 'batal')
     and (s.picked_up or s.updated_at < now() - interval '30 days');
$$;
revoke all on function purge_stale_service_secrets() from public, anon, authenticated;

select cron.unschedule('fixmaster-purge-service-secrets')
  where exists (select 1 from cron.job where jobname = 'fixmaster-purge-service-secrets');
select cron.schedule(
  'fixmaster-purge-service-secrets',
  '15 18 * * *',
  $$ select purge_stale_service_secrets(); $$
);
