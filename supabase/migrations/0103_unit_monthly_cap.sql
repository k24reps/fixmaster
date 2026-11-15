-- ============================================================
-- 0103_unit_monthly_cap.sql
-- Batas tagihan bulanan per cabang. Keputusan pemilik (15 Nov 2026):
-- tetap Rp 1.000 per unit masuk, tetapi paling banyak 100 unit
-- (Rp 100.000) per cabang per bulan kalender WIB. Lewat 100 unit, tiket
-- berikutnya di cabang itu tidak memotong saldo sampai bulan berganti.
--
-- Batasnya per cabang, bukan per toko: toko dua cabang membayar paling
-- banyak Rp 200.000, setara paket Pro lama, sedangkan toko satu cabang
-- paling banyak Rp 100.000, setara Solo lama.
--
-- Yang dihitung adalah unit yang BENAR-BENAR dipotong bulan ini di cabang
-- itu: baris `usage` dikurangi `refund`. Tiket yang lewat batas dicatat
-- sebagai `capped` (0 unit) supaya riwayat saldo jujur menampilkan tiket
-- gratis, dan supaya tiket yang sama tidak dinilai dua kali.
--
-- Urutan aturan di charge_service_unit tidak berubah: saldo <= -20 tetap
-- menahan tiket baru (utang dibayar dulu), baru sesudah itu batas bulanan.
-- ============================================================

-- ---------- Ledger: cabang dan jenis `capped` ----------
-- Tanpa FK, seperti service_id: cabang yang dihapus tidak menghapus jejak.
alter table unit_ledger add column if not exists outlet_id uuid;

alter table unit_ledger drop constraint if exists unit_ledger_kind_check;
alter table unit_ledger add constraint unit_ledger_kind_check
  check (kind in ('grant', 'topup', 'usage', 'refund', 'adjust', 'capped'));

alter table unit_ledger drop constraint if exists unit_ledger_units_check;
alter table unit_ledger add constraint unit_ledger_units_check
  check ((kind = 'capped') = (units = 0));

alter table unit_ledger drop constraint if exists unit_ledger_service_kinds;
alter table unit_ledger add constraint unit_ledger_service_kinds
  check ((kind in ('usage', 'refund', 'capped')) = (service_id is not null));

-- Isi cabang untuk pemakaian yang sudah tercatat (tiket yang masih ada).
update unit_ledger l
   set outlet_id = s.outlet_id
  from services s
 where l.service_id = s.id
   and l.kind in ('usage', 'refund')
   and l.outlet_id is null;

create index if not exists idx_unit_ledger_month_outlet
  on unit_ledger (org_id, outlet_id, created_at)
  where kind in ('usage', 'refund', 'capped');

-- ---------- Bulan berjalan (WIB) ----------
create or replace function unit_month_start()
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $fn$
  select date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta';
$fn$;

-- Unit yang dipotong bulan ini di satu cabang (null = tiket tanpa cabang).
create or replace function unit_paid_this_month(p_org_id uuid, p_outlet_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select coalesce(-sum(units), 0)::int
    from unit_ledger
   where org_id = p_org_id
     and outlet_id is not distinct from p_outlet_id
     and kind in ('usage', 'refund')
     and created_at >= unit_month_start();
$fn$;

revoke all on function unit_paid_this_month(uuid, uuid) from public, anon, authenticated;

-- ---------- Pemotongan dengan batas ----------
create or replace function charge_service_unit(p_org_id uuid, p_service_id uuid, p_service_no text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_balance int;
  v_outlet uuid;
begin
  if coalesce(current_setting('fixmaster.charging_service', true), '') <> p_service_id::text
     or not exists (select 1 from services where id = p_service_id and org_id = p_org_id) then
    raise exception 'Forbidden';
  end if;

  select outlet_id into v_outlet from services where id = p_service_id;

  -- Kunci baris organisasi: pemotongan satu toko berjalan berurutan, jadi
  -- hitungan bulan ini tidak bisa dilewati dua tiket yang masuk bersamaan.
  select unit_balance into v_balance
  from organizations where id = p_org_id
  for update;

  -- Sudah pernah dinilai (tiket yang sama disisip ulang): bukan unit baru.
  if exists (
    select 1 from unit_ledger
     where service_id = p_service_id and kind in ('usage', 'capped')
  ) then
    return;
  end if;

  if v_balance <= -20 then
    raise exception 'Saldo unit habis (% unit). Isi saldo di Pengaturan > Saldo untuk menerima unit baru. Tiket yang sudah ada tetap bisa dikerjakan.', v_balance
      using errcode = 'P0001', hint = 'unit_balance_exhausted';
  end if;

  if unit_paid_this_month(p_org_id, v_outlet) >= 100 then
    insert into unit_ledger (
      org_id, kind, units, balance_after, service_id, service_no, outlet_id, actor_name
    ) values (
      p_org_id, 'capped', 0, v_balance, p_service_id, p_service_no, v_outlet,
      unit_actor_name(p_org_id)
    )
    on conflict do nothing;
    return;
  end if;

  perform unit_ledger_apply(
    p_org_id, 'usage', -1, p_service_id, p_service_no,
    null, null, '', unit_actor_name(p_org_id)
  );
  update unit_ledger set outlet_id = v_outlet
   where service_id = p_service_id and kind = 'usage';
end;
$fn$;

revoke execute on function charge_service_unit(uuid, uuid, text) from public, anon;
grant execute on function charge_service_unit(uuid, uuid, text) to authenticated;

-- ---------- Pengembalian 10 menit: ikut cabang pemakaiannya ----------
-- Tiket `capped` tidak punya baris `usage`, jadi tidak ada yang dikembalikan.
create or replace function refund_service_unit_if_fresh(
  p_org_id uuid,
  p_service_id uuid,
  p_service_no text,
  p_note text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_charged_at timestamptz;
  v_outlet uuid;
  v_done boolean;
begin
  select created_at, outlet_id into v_charged_at, v_outlet
  from unit_ledger
  where service_id = p_service_id and kind = 'usage' and org_id = p_org_id;

  if v_charged_at is null then return false; end if;
  if now() - v_charged_at > interval '10 minutes' then return false; end if;

  v_done := unit_ledger_apply(
    p_org_id, 'refund', 1, p_service_id, p_service_no,
    null, null, p_note, unit_actor_name(p_org_id)
  ) is not null;
  if v_done then
    update unit_ledger set outlet_id = v_outlet
     where service_id = p_service_id and kind = 'refund';
  end if;
  return v_done;
end;
$fn$;

revoke execute on function refund_service_unit_if_fresh(uuid, uuid, text, text)
  from public, anon, authenticated;

-- ---------- Untuk tab Saldo: pemakaian bulan ini per cabang ----------
create or replace function unit_month_usage(p_org_id uuid)
returns table (
  outlet_id uuid,
  outlet_name text,
  paid_units int,
  capped_units int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not is_org_owner(p_org_id) then raise exception 'Forbidden'; end if;
  return query
  with u as (
    select l.outlet_id,
           coalesce(-sum(l.units) filter (where l.kind in ('usage', 'refund')), 0)::int as paid,
           (count(*) filter (where l.kind = 'capped'))::int as capped
      from unit_ledger l
     where l.org_id = p_org_id
       and l.kind in ('usage', 'refund', 'capped')
       and l.created_at >= unit_month_start()
     group by l.outlet_id
  )
  select o.id, o.name, coalesce(u.paid, 0), coalesce(u.capped, 0)
    from outlets o
    left join u on u.outlet_id = o.id
   where o.org_id = p_org_id and o.deleted_at is null
  union all
  select u.outlet_id, '', u.paid, u.capped
    from u
   where u.outlet_id is null
      or not exists (
        select 1 from outlets o
         where o.id = u.outlet_id and o.org_id = p_org_id and o.deleted_at is null
      )
  order by 2;
end;
$fn$;

revoke all on function unit_month_usage(uuid) from public, anon;
grant execute on function unit_month_usage(uuid) to authenticated;
