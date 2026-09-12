-- ============================================================
-- 0058_service_history_append_only.sql
-- Riwayat tiket servis jadi BENAR-BENAR append-only.
--
-- Kolom `history` ditandai "append-only" sejak 0001, tapi tidak ada yang
-- menegakkannya: klien menulis ulang SELURUH array (baca-ubah-tulis), dan
-- settle_service/cancel_service menerima p_history lalu `history = p_history`.
-- Akibatnya sampai migrasi ini:
--   * Dua perangkat menambah riwayat ke tiket yang sama dari salinan lama →
--     yang menyimpan belakangan menghapus entri perangkat lainnya.
--   * Anggota mana pun bisa mengganti jejak audit tiket lewat REST.
--
-- Trigger ini menggabungkan: riwayat lama SELALU dipertahankan, dan dari isi
-- yang dikirim hanya entri yang belum ada yang ditambahkan di belakang. Satu
-- aturan itu menampung semua bentuk penulis:
--   * aplikasi versi lama yang mengirim array penuh → hanya entri barunya masuk;
--   * aplikasi baru yang mengirim entri baru saja — daftar servis di cloud tak
--     lagi memuat `history` (≈78% ukuran tiap baris, egress) → entri ditambahkan;
--   * settle_service/cancel_service → tanpa perubahan signature.
-- Menghapus atau mengubah entri lama tidak lagi mungkin, termasuk lewat
-- service_role. Itu memang definisi jejak audit.
--
-- `before update of history`: penulisan yang tidak menyertakan kolom history
-- (upsert dari baris daftar yang ringan) tidak memicunya, jadi history utuh.
-- INSERT tidak dijaga: tiket baru dan restore_org_data menulis riwayat awal.
-- Isi yang bukan array ditolak oleh jsonb_array_elements.
-- ============================================================

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
  return new;
end;
$$;

drop trigger if exists services_history_append_only on services;
create trigger services_history_append_only
  before update of history on services
  for each row execute function services_history_append_only();
