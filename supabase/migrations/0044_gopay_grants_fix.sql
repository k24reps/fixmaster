-- ============================================================
-- FixMaster — 0044: Tutup akses anon/authenticated ke RPC listener GoPay
--
-- Temuan (probe langsung ke staging, 15 Agu 2026): `claim_gopay_payment`
-- BISA dieksekusi tanpa autentikasi apa pun — panggilan anon membalas `null`
-- (jalur "tidak ada invoice cocok"), bukan penolakan.
--
-- Sebabnya: `0043` memakai `revoke execute ... from public`, sedangkan
-- Supabase memasang DEFAULT PRIVILEGES yang meng-grant EXECUTE secara
-- EKSPLISIT ke role `anon` dan `authenticated` untuk tiap fungsi baru di
-- schema public. Mencabut dari PUBLIC tidak menghapus grant eksplisit itu.
--
-- Dampak nyata tertahan oleh guard `apply_payment` (0022): pemanggil anon
-- kena 'Forbidden' sebelum invoice ditandai lunas, jadi TIDAK ada langganan
-- gratis. Yang tetap salah: anon bisa memicu expire_stale_gopay_invoices,
-- bisa menyelidik nominal invoice yang terbuka (null vs error), dan seluruh
-- pertahanan bergantung pada guard di fungsi LAIN — runtuh diam-diam kalau
-- `apply_payment` disentuh nanti.
--
-- Perbaikan dua lapis:
--   1. Revoke ke role yang benar (anon, authenticated), bukan hanya PUBLIC.
--   2. Guard `auth.role()` di DALAM claim_gopay_payment. Ini lapis yang
--      menentukan: grant bisa muncul lagi sendiri saat fungsi dibuat pertama
--      kali di environment baru (mis. produksi), karena default privileges
--      berlaku saat CREATE. Guard di badan fungsi ikut ke mana pun ia dibuat.
--
-- CATATAN PENTING — kenapa expire_stale_gopay_invoices() TIDAK diberi guard
-- auth.role(): ia dipanggil dari DALAM start_gopay_invoice, yang pemanggilnya
-- adalah owner ber-JWT `authenticated`. `SECURITY DEFINER` mengganti
-- `current_user` (sehingga pemeriksaan hak EXECUTE lolos sebagai pemilik
-- fungsi), tetapi TIDAK mengganti `auth.role()` yang membaca klaim JWT.
-- Memasang guard di sana akan mematikan pembuatan invoice. Untuk fungsi itu
-- pencabutan grant sudah cukup: panggilan internal aman karena dieksekusi
-- sebagai pemilik fungsi, sedangkan panggilan langsung dari luar ditolak.
-- Expand-only, idempotent.
-- ============================================================

-- ---------- Lapis 1: cabut dari role yang sebenarnya diberi grant ----------
revoke execute on function claim_gopay_payment(numeric) from public, anon, authenticated;
revoke execute on function expire_stale_gopay_invoices() from public, anon, authenticated;

-- `start_gopay_invoice` SENGAJA tetap untuk `authenticated`: owner
-- memanggilnya dari UI, dan fungsinya punya gerbang owner sendiri di dalam.

-- ---------- Lapis 2: guard pemanggil di dalam claim_gopay_payment ----------
-- Identik dengan 0043 kecuali gerbang pemanggil di baris pertama.
create or replace function claim_gopay_payment(p_amount numeric)
returns uuid
language plpgsql security definer as $$
declare
  v_id uuid;
begin
  -- Hanya Edge Function (service_role) yang boleh mengklaim. Fungsi ini
  -- menandai invoice lunas dengan bukti tunggal berupa NOMINAL, dan user tahu
  -- nominal invoice-nya sendiri — kalau bisa dipanggil dari sesi login biasa,
  -- itu mengulang celah F5 yang ditutup 0022.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  perform expire_stale_gopay_invoices();

  select id into v_id
  from invoices
  where provider = 'gopay'
    and status = 'pending'
    and amount = p_amount
  limit 1
  for update skip locked;

  if v_id is null then
    return null;  -- tidak ada invoice terbuka untuk nominal ini
  end if;

  perform apply_payment(v_id);
  return v_id;
end;
$$;

-- Ulangi revoke SETELAH create or replace (idempotent, dan menjaga kalau
-- default privileges sempat memasang grant baru).
revoke execute on function claim_gopay_payment(numeric) from public, anon, authenticated;
grant execute on function claim_gopay_payment(numeric) to service_role;
grant execute on function expire_stale_gopay_invoices() to service_role;
