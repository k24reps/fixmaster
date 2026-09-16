-- ============================================================
-- FixMaster — 0075: perbaikan stempel pelaku log (lanjutan 0073)
--
-- Di 0073 stempelnya dijaga dengan `current_user = 'authenticated'` — pola yang
-- benar untuk trigger BIASA (lihat inventory_guard_stock 0069), tapi SALAH di
-- sini: fungsinya security definer, sehingga current_user selalu pemilik
-- fungsi dan penjagaannya keluar lebih dulu. Akibatnya nama pelaku palsu dari
-- klien tetap tersimpan apa adanya — tertangkap tes integrasi.
--
-- Penanda yang benar adalah ADA TIDAKNYA sesi pengguna: auth.uid(). Kosong
-- berarti penulisan service-role (pemulihan data, skrip operator) yang memang
-- membawa identitasnya sendiri; berisi berarti seseorang menulis lewat aplikasi
-- dan pelakunya ditetapkan dari keanggotaannya, bukan dari yang ia kirim.
-- ============================================================

create or replace function activity_stamp_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member memberships%rowtype;
begin
  if auth.uid() is null then return new; end if;

  select * into v_member from memberships
    where user_id = auth.uid() and org_id = new.org_id;
  -- Bukan anggota org ini: policy INSERT sudah menolaknya lebih dulu, jadi
  -- baris seperti ini tak pernah sampai sini. Dibiarkan apa adanya agar jalur
  -- tak terduga tidak ikut gagal hanya karena pencatatan audit.
  if not found then return new; end if;

  new.actor_id := v_member.id;
  new.actor_name := v_member.name;
  new.actor_role := v_member.role;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;
