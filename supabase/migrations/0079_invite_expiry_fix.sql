-- ============================================================
-- FixMaster — 0079: perbaikan masa berlaku undangan (lanjutan 0078)
--
-- Di 0078 masa berlaku disegarkan pada SETIAP perubahan baris selama undangan
-- belum diklaim. Akibatnya undangan yang sudah kedaluwarsa hidup kembali hanya
-- karena barisnya tersentuh — penjagaannya bisa dilewati tanpa mengundang
-- ulang. Tertangkap tes integrasi.
--
-- Penanda yang benar adalah jalur undang-ulang itu sendiri: create_invite
-- menulis ulang created_at pada upsert-nya (0033). Hanya itu yang memperbarui
-- masa berlaku; perubahan lain (mis. koreksi peran lewat jalur lain) tidak.
-- ============================================================

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

  -- Diundang ulang (create_invite menulis created_at = now()) → jam dimulai lagi.
  if new.claimed_at is null and new.created_at is distinct from old.created_at then
    new.expires_at := now() + interval '14 days';
    return new;
  end if;

  -- Baru diklaim: tolak bila masa berlakunya sudah lewat.
  if new.claimed_at is not null and old.claimed_at is null
     and coalesce(old.expires_at, now()) < now() then
    raise exception 'Undangan sudah kedaluwarsa. Minta pemilik toko mengundang ulang.';
  end if;

  return new;
end;
$$;
