-- ============================================================
-- FixMaster — 0078: undangan punya masa berlaku
--
--  #16 Undangan tim berlaku selamanya: email yang salah ketik, karyawan yang
--      batal masuk, atau undangan setahun lalu tetap bisa diklaim kapan saja
--      dan langsung memberi akses ke seluruh data toko. Sekarang berlaku 14
--      hari, diperbarui otomatis saat diundang ulang.
--
-- Dikerjakan sebagai kolom + trigger, bukan dengan menulis ulang claim_invite:
-- penjagaannya jadi berlaku untuk SEMUA jalur yang menandai undangan terklaim,
-- termasuk yang belum ada saat file ini ditulis.
-- ============================================================

alter table pending_invites
  add column if not exists expires_at timestamptz;

-- Undangan lama: dihitung 14 hari sejak dibuat. Yang sudah lewat langsung
-- kedaluwarsa — dan memang seharusnya begitu.
update pending_invites
  set expires_at = created_at + interval '14 days'
  where expires_at is null;

create or replace function invites_expiry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.expires_at := coalesce(new.expires_at, now() + interval '14 days');
    return new;
  end if;

  -- Masih belum diklaim setelah diperbarui = diundang ulang: masa berlakunya
  -- dihitung dari sekarang.
  if new.claimed_at is null then
    new.expires_at := now() + interval '14 days';
    return new;
  end if;

  -- Baru saja diklaim: tolak bila sudah lewat masa berlakunya.
  if old.claimed_at is null and coalesce(old.expires_at, now()) < now() then
    raise exception 'Undangan sudah kedaluwarsa. Minta pemilik toko mengundang ulang.';
  end if;
  return new;
end;
$$;

drop trigger if exists invites_expiry on pending_invites;
create trigger invites_expiry
  before insert or update on pending_invites
  for each row execute function invites_expiry();
