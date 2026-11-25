-- ============================================================
-- FixMaster — 0105: tanggal masuk tiket mundur hanya untuk Pemilik
--
-- Pemilik boleh mencatat unit servis baru dengan tanggal masuk lampau (unit
-- yang sudah diterima sebelum dicatat). Form-nya hanya menampilkan kolom itu
-- untuk Pemilik, tetapi `created_at` ditulis klien langsung ke tabel, jadi
-- peran lain bisa mengirim tanggal apa pun lewat REST. Penjaga ini menutupnya.
--
--   - Pemilik: `created_at` bebas ke belakang; ke depan hanya sejauh toleransi
--     selisih jam perangkat (15 menit).
--   - Admin dan karyawan: `created_at` harus dalam toleransi yang sama dari
--     jam server. Di luar itu ditolak, bukan ditimpa diam-diam, supaya jam
--     perangkat yang salah ketahuan saat itu juga.
--
-- Cakupannya `created_at`, kolom yang dipakai aplikasi untuk menempatkan tiket
-- di waktu (daftar, Laporan per tanggal masuk, nota). Cap waktu di entri
-- `history` tetap ditulis klien seperti sebelumnya (tahap berikutnya tidak
-- bisa dimundurkan lewat form mana pun); jejak waktu sebenarnya ada di Log
-- Aktivitas, yang dicap server (0073, 0075).
--
-- Seperti services_guard_integrity (0087): hanya tulisan langsung dari aplikasi
-- (role authenticated). RPC security definer (create_warranty_claim,
-- restore_org_data) berjalan sebagai pemilik fungsi dan tidak terkena.
--
-- Catatan: salinan di repo lain (mis. Nuara) harus memakai nomor migrasi
-- berikutnya di repo itu, bukan 0105.
-- ============================================================

create or replace function services_guard_intake_date()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- Upsert ke baris yang sudah ada ikut memicu BEFORE INSERT (lihat 0061);
  -- itu jalur UPDATE, dan `created_at` tiket lama memang lampau.
  if exists (select 1 from services where id = new.id) then
    return new;
  end if;

  if is_org_owner(new.org_id) then
    if new.created_at > now() + interval '15 minutes' then
      raise exception 'Tanggal masuk tiket tidak boleh di masa depan.';
    end if;
    return new;
  end if;

  if abs(extract(epoch from (new.created_at - now()))) > 900 then
    raise exception 'Tanggal masuk tiket hanya bisa diatur Pemilik. Bila tiket ini bukan catatan mundur, periksa tanggal dan jam perangkat.';
  end if;
  return new;
end;
$$;

drop trigger if exists services_guard_intake_date on services;
create trigger services_guard_intake_date
  before insert on services
  for each row execute function services_guard_intake_date();
