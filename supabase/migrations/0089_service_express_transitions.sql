-- ============================================================
-- FixMaster — 0089: servis ditunggu (audit 25 Sep 2026, paket C)
--
-- Servis kilat yang ditunggu pelanggan di konter dulu wajib lewat 5 kali ubah
-- status (Diagnosa → Konfirmasi → Pengerjaan → Selesai → Lunas). Kini Selesai
-- bisa dicapai dari status kerja mana pun, dan Pengerjaan bisa kembali ke Tunggu
-- Sparepart (kekurangan part baru ketahuan saat dikerjakan). Cermin TRANSITIONS
-- di lib/business/services.ts. Selebihnya sama persis dengan 0088.
-- ============================================================

create or replace function services_guard_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status
     and new.status in ('lunas', 'batal')
     and auth.uid() is not null
     and not is_org_manager(new.org_id) then
    raise exception 'Hanya owner/admin yang bisa melunasi atau membatalkan tiket';
  end if;

  if current_user <> 'authenticated' then
    return new;
  end if;

  new.down_payment := old.down_payment;
  if old.status in ('lunas', 'batal') then
    new.final_cost := old.final_cost;
  end if;

  if new.status is distinct from old.status then
    if new.status in ('lunas', 'batal') then
      raise exception 'Lunas dan Batal hanya lewat tombol pelunasan/pembatalan. Muat ulang halaman lalu coba lagi.';
    end if;
    if not (old.status, new.status) in (
      ('diterima', 'diagnosa'), ('diterima', 'selesai'),
      ('diagnosa', 'konfirmasi'), ('diagnosa', 'selesai'),
      ('konfirmasi', 'tunggu'), ('konfirmasi', 'pengerjaan'), ('konfirmasi', 'selesai'),
      ('tunggu', 'pengerjaan'), ('tunggu', 'selesai'),
      ('pengerjaan', 'tunggu'), ('pengerjaan', 'selesai'),
      ('selesai', 'pengerjaan')
    ) then
      raise exception 'Status tiket sudah berubah di perangkat lain (sekarang %). Muat ulang halaman lalu coba lagi.', old.status;
    end if;
  end if;
  return new;
end;
$$;
