-- Catatan penyelesaian servis sebagai kolom sendiri.
--
-- Catatan WAJIB saat status berubah ke "selesai" selama ini hanya tersimpan di
-- `history` (jsonb). Daftar servis sengaja tidak memuat `history` (≈78% ukuran
-- tiap baris, sumber egress terbesar — lihat 0058 dan SERVICE_LIST_COLUMNS),
-- jadi catatan itu tidak bisa tampil di tabel tanpa memuat ulang riwayat tiap
-- tiket. Kolom ini membawanya dengan biaya beberapa byte.
--
-- Kolom baru WAJIB juga ditambahkan ke SERVICE_LIST_COLUMNS
-- (src/data/types.ts); tes integrasi tier3e memeriksanya.

alter table services add column if not exists completion_note text not null default '';

-- Backfill: catatan entri "selesai" TERAKHIR di riwayat tiap tiket. Update ini
-- tidak menyentuh kolom `history`, jadi trigger append-only (0058, `before
-- update of history`) tidak ikut berjalan.
update services s
set completion_note = coalesce((
  select t.e->>'note'
  from jsonb_array_elements(s.history) with ordinality as t(e, i)
  where t.e->>'status' = 'selesai'
  order by t.i desc
  limit 1
), '')
where s.completion_note = ''
  and jsonb_typeof(s.history) = 'array'
  and s.history @> '[{"status": "selesai"}]'::jsonb;
