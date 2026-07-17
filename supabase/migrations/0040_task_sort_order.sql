-- ============================================================
-- FixMaster — 0040: urutan manual untuk Tugas Internal
--
-- Kebutuhan (user): urutan tugas bisa diatur naik/turun.
--   - task_templates.sort_order = urutan SOP default (berlaku ke depan)
--   - task_instances.sort_order = disalin dari template saat generate,
--     boleh di-override untuk hari itu saja (instance besok baris baru)
--
-- Mengikuti pola yang SUDAH ada di app (wallets.sort_order), jadi bukan
-- konsep baru. Kolom biasa (bukan JSONB) karena tabel task tak punya
-- kolom JSONB untuk "dititipi" seperti trik Service.spareparts.
--
-- Idempotent: aman dijalankan ulang.
-- ============================================================

alter table task_templates add column if not exists sort_order int not null default 0;
alter table task_instances add column if not exists sort_order int not null default 0;

-- Backfill deterministik: tanpa ini SEMUA baris lama bernilai 0 (seri), dan
-- urutan tampil jadi non-deterministik sampai user menekan tombol naik/turun.
-- row_number per-org mengikuti created_at = mempertahankan urutan yang selama
-- ini dilihat user (adapter list() mengurutkan created_at).
with ranked as (
  select id, (row_number() over (partition by org_id order by created_at, id) - 1) as rn
  from task_templates
)
update task_templates t
set sort_order = r.rn
from ranked r
where t.id = r.id and t.sort_order = 0;

-- Instance: urut per (org, tanggal) — tiap hari punya daftarnya sendiri.
with ranked as (
  select id, (row_number() over (partition by org_id, due_date order by created_at, id) - 1) as rn
  from task_instances
)
update task_instances i
set sort_order = r.rn
from ranked r
where i.id = r.id and i.sort_order = 0;
