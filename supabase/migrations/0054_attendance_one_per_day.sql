-- ============================================================
-- 0054_attendance_one_per_day.sql
-- Satu baris absensi per karyawan per hari — dijamin database.
--
-- Klien sudah menjaganya di entri manual, dan 0053 menambahkannya ke
-- `clock_in`. Keduanya penjagaan waktu-tulis; indeks inilah yang membuatnya
-- tidak bisa dilanggar sama sekali — termasuk lewat REST langsung, restore
-- backup, atau balapan dua perangkat yang menekan Check In bersamaan.
--
-- ------------------------------------------------------------
-- KENAPA FILE TERPISAH DARI 0053
-- ------------------------------------------------------------
-- Migrasi ini bisa GAGAL kalau data lama sudah memuat duplikat. Kegagalannya
-- membatalkan seluruh transaksi migrasi — dan pengerasan `clock_in` di 0053
-- tidak boleh ikut batal hanya karena ada dua baris kembar dari tahun lalu.
--
-- Kalau gagal, cari duplikatnya:
--
--   select org_id, employee_id, date, count(*), array_agg(id)
--   from attendance
--   where deleted_at is null
--   group by 1, 2, 3
--   having count(*) > 1
--   order by 3 desc;
--
-- Ini data upah — JANGAN dihapus otomatis. Periksa tiap pasangan, simpan
-- baris yang jamnya benar, hapus sisanya, lalu jalankan ulang migrasi ini.
-- ============================================================

create unique index if not exists attendance_one_per_day
  on attendance (org_id, employee_id, date)
  where deleted_at is null;

comment on index attendance_one_per_day is
  'Satu absensi per karyawan per hari. Duplikat menggelembungkan rekap jam kerja bulanan.';
