-- Tanggal penyelesaian servis sebagai kolom sendiri.
--
-- `completionDate()` (lib/business/reports.ts) memindai SELURUH array `history`
-- hanya untuk mengambil SATU stempel waktu: entri pertama berstatus "selesai".
-- Karena itu `listByDateRange` memakai `select('*')` dan menyeret `history`
-- (≈78% ukuran tiap baris — lihat 0058) untuk SETIAP tiket dalam rentang.
-- Laporan adalah satu-satunya pemakai query itu, jadi ongkos terbesar di produk
-- dibayar untuk satu nilai per baris.
--
-- Polanya sama persis dengan 0059, yang menaikkan `completion_note` keluar dari
-- `history` demi alasan yang sama.
--
-- Kolom baru WAJIB juga ditambahkan ke SERVICE_LIST_COLUMNS (src/data/types.ts);
-- tes integrasi tier3e memeriksanya.

alter table services add column if not exists completed_at timestamptz;

-- Backfill: entri "selesai" PERTAMA menurut urutan array — bukan urutan waktu —
-- supaya identik dengan `.find()` yang digantikannya. Sengaja BERBEDA dari 0059
-- yang memakai entri TERAKHIR: catatan penanganan ingin yang terbaru, sedangkan
-- tanggal selesai ingin saat tiket PERTAMA kali mencapai "selesai".
--
-- Penjaga regex sebelum cast: satu baris dengan `at` yang tidak ISO akan
-- menggagalkan SELURUH migrasi di produksi. Postgres tidak punya try_cast, jadi
-- nilai yang tidak berbentuk tanggal dilewati, bukan meledak.
--
-- Update ini tidak menyentuh kolom `history`, jadi trigger append-only (0058,
-- `before update of history`) tidak ikut berjalan.
update services s
set completed_at = (
  select (t.e->>'at')::timestamptz
  from jsonb_array_elements(s.history) with ordinality as t(e, i)
  where t.e->>'status' = 'selesai'
    and t.e->>'at' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
  order by t.i
  limit 1
)
where s.completed_at is null
  and jsonb_typeof(s.history) = 'array'
  and s.history @> '[{"status": "selesai"}]'::jsonb;

-- Trigger 0058 diperluas, bukan ditambah yang baru: SEMUA jalur yang mengubah
-- status menulis `history` (StatusModal, settle_service, cancel_service), jadi
-- satu titik ini menangkap semuanya. Membuat trigger terpisah pada `status`
-- justru bisa meleset dari jalur RPC.
--
-- `coalesce(new.completed_at, ...)` membuatnya sekali-set: begitu terisi, entri
-- "selesai" berikutnya (tiket dibuka lagi lalu diselesaikan ulang) tidak
-- menggesernya — persis perilaku `.find()` yang selalu mengambil yang pertama.
create or replace function services_history_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.history := old.history || coalesce((
    select jsonb_agg(t.e order by t.i)
    from jsonb_array_elements(coalesce(new.history, '[]'::jsonb)) with ordinality as t(e, i)
    where not exists (
      select 1 from jsonb_array_elements(old.history) as o(entry) where o.entry = t.e
    )
  ), '[]'::jsonb);

  new.completed_at := coalesce(new.completed_at, (
    select (t.e->>'at')::timestamptz
    from jsonb_array_elements(coalesce(new.history, '[]'::jsonb)) with ordinality as t(e, i)
    where t.e->>'status' = 'selesai'
      and t.e->>'at' ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}'
    order by t.i
    limit 1
  ));

  return new;
end;
$$;

-- Trigger-nya sendiri tidak diubah (masih `before update of history`); hanya
-- badan fungsinya yang diganti, jadi tidak perlu drop/create trigger.
