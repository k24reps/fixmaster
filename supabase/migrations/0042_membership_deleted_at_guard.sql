-- ============================================================
-- FixMaster — 0042: anggota ter-soft-delete tak boleh punya akses
--
-- BUG LAPANGAN (produksi, 31 Jul 2026). Satu baris memberships berada di
-- keadaan yang seharusnya MUSTAHIL: `active = true` DAN `deleted_at` terisi.
-- Akibatnya, untuk akun itu:
--   - UI daftar tim MENYEMBUNYIKANNYA  (list() menyaring deleted_at is null),
--   - tapi RLS tetap MEMBERI AKSES PENUH (helper hanya cek active = true),
--   - dan `claim_invite` tak pernah jalan lagi karena getMyMembership()
--     menemukan baris hantu itu → undangan menggantung "menunggu pendaftaran"
--     selamanya.
-- Kasus nyata: seorang anggota dengan peran `owner` tak terlihat di layar
-- pemilik, padahal masih bisa masuk dan menguasai seluruh data toko.
--
-- AKAR MASALAH — dua definisi "anggota" yang tak sepakat:
--   list()/UI  : deleted_at IS NULL
--   RLS/auth   : active = true
-- Biasanya konsisten karena `delete_member` (0037) mewajibkan active = false
-- lebih dulu. Yang merusaknya: `claim_invite` punya
-- `on conflict ... do update set active = true` yang MENGHIDUPKAN ULANG baris
-- terhapus TANPA membersihkan deleted_at.
--
-- PERBAIKAN:
--   A. Semua helper RLS ikut menyaring `deleted_at is null`. Diperbaiki di
--      SATU tempat: seluruh policy di DB memanggil helper ini, jadi akses
--      tertutup untuk semua tabel sekaligus tanpa menyentuh satu policy pun.
--   B. `claim_invite` membersihkan deleted_at saat mengklaim, dan saat baris
--      lama memang sudah terhapus (rejoin) ia mengadopsi peran + nama dari
--      undangan. Peran anggota yang MASIH aktif tak disentuh — mencegah
--      owner terakhir tanpa sengaja turun peran lalu toko kehilangan owner.
--
-- Efek samping yang disengaja: begitu di-apply, akun hantu LANGSUNG kehilangan
-- akses (deleted_at-nya terisi). Bila ia memang harus kembali, cukup login
-- ulang — undangan tertunda akan terklaim otomatis dengan peran yang benar.
-- Data lama sengaja TIDAK diubah otomatis; menutup akses sudah cukup, dan
-- keputusan siapa boleh kembali ada di pemilik.
--
-- Idempotent (create or replace).
-- ============================================================

-- ---------- A. Helper RLS ----------
create or replace function auth_org_ids()
returns setof uuid language sql security definer stable as $$
  select org_id from memberships
  where user_id = auth.uid() and active = true and deleted_at is null;
$$;

create or replace function auth_role_in(target_org uuid)
returns role_type language sql security definer stable as $$
  select role from memberships
  where user_id = auth.uid() and org_id = target_org
    and active = true and deleted_at is null;
$$;

create or replace function is_org_member(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target_org
      and active = true and deleted_at is null
  );
$$;

create or replace function is_org_manager(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target_org
      and active = true and deleted_at is null
      and role in ('owner', 'admin')
  );
$$;

create or replace function is_org_owner(target_org uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid() and org_id = target_org
      and active = true and deleted_at is null
      and role = 'owner'
  );
$$;

create or replace function auth_outlet_ids()
returns setof uuid language sql security definer stable as $$
  select mo.outlet_id
  from membership_outlets mo
  join memberships m on m.id = mo.membership_id
  where m.user_id = auth.uid() and m.active = true and m.deleted_at is null;
$$;

-- ---------- B. claim_invite: rejoin bersih ----------
-- Identik 0033, kecuali blok on-conflict: klaim kini MEMBERSIHKAN deleted_at
-- (kalau tidak, hasilnya justru baris hantu yang melahirkan bug ini) dan
-- mengadopsi peran + nama undangan HANYA bila baris lama memang terhapus.
create or replace function claim_invite()
returns uuid
language plpgsql security definer as $$
declare
  v_email text;
  v_invite pending_invites%rowtype;
  v_member_id uuid;
  v_outlet uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return null;
  end if;

  select * into v_invite
  from pending_invites
  where lower(email) = lower(v_email) and claimed_at is null
  order by created_at asc
  limit 1;

  if not found then
    return null;
  end if;

  -- Guard satu-toko (0033): tolak bila sudah anggota aktif di org BERBEDA.
  -- Baris terhapus tak dihitung — ia memang sudah tak punya akses.
  if exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.active = true and m.deleted_at is null
      and m.org_id <> v_invite.org_id
  ) then
    raise exception 'Akun ini sudah tergabung di toko lain. Satu akun hanya untuk satu toko.';
  end if;

  insert into memberships (org_id, user_id, name, role, active)
  values (
    v_invite.org_id,
    auth.uid(),
    coalesce(nullif(v_invite.name, ''), split_part(v_email, '@', 1)),
    v_invite.role,
    true
  )
  on conflict (org_id, user_id) do update
    set active     = true,
        deleted_at = null,
        -- Rejoin (baris lama terhapus) → undangan menentukan peran & nama.
        -- Anggota yang masih hidup tak diubah perannya, supaya undangan tak
        -- bisa menurunkan owner terakhir dan mengunci toko.
        role = case
                 when memberships.deleted_at is not null then excluded.role
                 else memberships.role
               end,
        name = case
                 when memberships.deleted_at is not null then excluded.name
                 else memberships.name
               end
  returning id into v_member_id;

  -- Penugasan outlet (0024/0033). Tanpa outlet di undangan → semua outlet.
  if v_member_id is not null then
    if v_invite.outlet_ids is not null and array_length(v_invite.outlet_ids, 1) is not null then
      foreach v_outlet in array v_invite.outlet_ids loop
        if exists (select 1 from outlets o where o.id = v_outlet and o.org_id = v_invite.org_id) then
          insert into membership_outlets (membership_id, outlet_id, org_id)
          values (v_member_id, v_outlet, v_invite.org_id)
          on conflict do nothing;
        end if;
      end loop;
    else
      insert into membership_outlets (membership_id, outlet_id, org_id)
      select v_member_id, o.id, v_invite.org_id
      from outlets o where o.org_id = v_invite.org_id
      on conflict do nothing;
    end if;
  end if;

  update pending_invites set claimed_at = now() where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

grant execute on function claim_invite() to authenticated;
