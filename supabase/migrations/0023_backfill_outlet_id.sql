-- ============================================================
-- FixMaster — 0023: Backfill outlet_id pada data transaksi
-- Tujuan: laporan per-cabang akurat. Sebelum fitur multi-outlet,
-- record transaksi dibuat dengan outlet_id NULL (org-wide), sehingga
-- akan muncul di SETIAP tampilan cabang dan menggelembungkan total
-- per-cabang. Migrasi ini menandai tiap record transaksi lama ke
-- outlet UTAMA org-nya (is_primary; fallback outlet terlama).
--
-- Lingkup: HANYA tabel transaksi. Data konfigurasi bersama
-- (wallets, customers, inventory) sengaja DIBIARKAN null = bersama.
--   - wallets: model Hybrid (boleh bersama / khusus cabang) — tak diubah.
--
-- Idempotent (hanya menyentuh baris yang masih null) & forward-only
-- (tidak ada DROP). Aman untuk sesi berjalan. Uji di staging dulu.
-- ============================================================

-- Helper inline: pilih outlet utama org (is_primary dulu, lalu terlama).
-- Dipakai sebagai subquery berkorelasi per tabel.

update services s
set outlet_id = (
  select o.id from outlets o
  where o.org_id = s.org_id
  order by o.is_primary desc, o.created_at asc
  limit 1
)
where s.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = s.org_id);

update sales s
set outlet_id = (
  select o.id from outlets o
  where o.org_id = s.org_id
  order by o.is_primary desc, o.created_at asc
  limit 1
)
where s.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = s.org_id);

update incomes i
set outlet_id = (
  select o.id from outlets o
  where o.org_id = i.org_id
  order by o.is_primary desc, o.created_at asc
  limit 1
)
where i.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = i.org_id);

update expenses e
set outlet_id = (
  select o.id from outlets o
  where o.org_id = e.org_id
  order by o.is_primary desc, o.created_at asc
  limit 1
)
where e.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = e.org_id);

update attendance a
set outlet_id = (
  select o.id from outlets o
  where o.org_id = a.org_id
  order by o.is_primary desc, o.created_at asc
  limit 1
)
where a.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = a.org_id);

update purchase_orders p
set outlet_id = (
  select o.id from outlets o
  where o.org_id = p.org_id
  order by o.is_primary desc, o.created_at asc
  limit 1
)
where p.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = p.org_id);

update task_instances t
set outlet_id = (
  select o.id from outlets o
  where o.org_id = t.org_id
  order by o.is_primary desc, o.created_at asc
  limit 1
)
where t.outlet_id is null
  and exists (select 1 from outlets o2 where o2.org_id = t.org_id);
