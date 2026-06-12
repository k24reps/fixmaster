-- ============================================================
-- FixMaster — 0026: Jamin outlet utama + re-backfill transaksi
-- Bagian dari RILIS 1 (EXPAND) — aman, di-apply bersama 0023-0025.
--
-- Latar: org yang dibuat SEBELUM wizard punya langkah "Outlet" bisa
-- punya NOL outlet. Akibatnya:
--   1) Owner harus menambah toko manual sebelum bisa menugaskan tim.
--   2) Migrasi 0023 (backfill) yang jalan saat nol outlet = no-op,
--      jadi transaksi lama tetap outlet_id null (tak masuk cabang
--      manapun di laporan per-cabang).
--
-- Migrasi ini menyembuhkan keduanya, idempotent & forward-only:
--   A. Tiap org TANPA outlet → buat 1 outlet utama (nama = nama org).
--   B. Tiap org yang punya outlet TAPI tak ada is_primary → tandai
--      yang terlama sebagai utama (jaga invarian "selalu ada 1 utama").
--   C. Re-jalankan backfill transaksi (logika identik 0023) agar baris
--      yang masih null kini menempel ke outlet utama.
--
-- Catatan: org baru via wizard sudah otomatis punya outlet primary
-- (buildOutlets: isPrimary = i===0), jadi A/B hanya menyentuh org lama.
-- Uji di staging dulu.
-- ============================================================

-- ------------------------------------------------------------
-- A. Buat outlet utama untuk org yang belum punya outlet sama sekali.
-- ------------------------------------------------------------
insert into outlets (org_id, name, address, is_primary, created_at, updated_at)
select o.id,
       coalesce(nullif(o.name, ''), 'Outlet Utama'),
       '',
       true,
       now(),
       now()
from organizations o
where not exists (select 1 from outlets x where x.org_id = o.id);

-- ------------------------------------------------------------
-- B. Org punya outlet tapi tak ada yang is_primary → tandai terlama.
-- ------------------------------------------------------------
update outlets t
set is_primary = true, updated_at = now()
where t.id = (
  select x.id from outlets x
  where x.org_id = t.org_id
  order by x.created_at asc
  limit 1
)
and not exists (
  select 1 from outlets p where p.org_id = t.org_id and p.is_primary = true
);

-- ------------------------------------------------------------
-- C. Re-backfill transaksi yang masih null (identik 0023, kini outlet
--    utama dijamin ada oleh langkah A/B di atas).
-- ------------------------------------------------------------
update services s
set outlet_id = (
  select o.id from outlets o where o.org_id = s.org_id
  order by o.is_primary desc, o.created_at asc limit 1)
where s.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = s.org_id);

update sales s
set outlet_id = (
  select o.id from outlets o where o.org_id = s.org_id
  order by o.is_primary desc, o.created_at asc limit 1)
where s.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = s.org_id);

update incomes i
set outlet_id = (
  select o.id from outlets o where o.org_id = i.org_id
  order by o.is_primary desc, o.created_at asc limit 1)
where i.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = i.org_id);

update expenses e
set outlet_id = (
  select o.id from outlets o where o.org_id = e.org_id
  order by o.is_primary desc, o.created_at asc limit 1)
where e.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = e.org_id);

update attendance a
set outlet_id = (
  select o.id from outlets o where o.org_id = a.org_id
  order by o.is_primary desc, o.created_at asc limit 1)
where a.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = a.org_id);

update purchase_orders p
set outlet_id = (
  select o.id from outlets o where o.org_id = p.org_id
  order by o.is_primary desc, o.created_at asc limit 1)
where p.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = p.org_id);

update task_instances t
set outlet_id = (
  select o.id from outlets o where o.org_id = t.org_id
  order by o.is_primary desc, o.created_at asc limit 1)
where t.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = t.org_id);
