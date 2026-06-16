-- ============================================================
-- FixMaster — 0033: Satu email = satu toko (blokir undangan lintas-toko)
--
-- Masalah: tabel pending_invites unik per (org_id, email) saja, dan klien
-- meng-upsert undangan langsung tanpa cek lintas-toko (RLS memang menyembunyikan
-- data toko lain dari klien). Akibatnya email yang sama bisa diundang di banyak
-- toko tanpa peringatan. Arsitektur app sebenarnya SATU-USER-SATU-TOKO
-- (getMyMembership ambil limit(1) membership aktif) → multi-membership memilih
-- toko secara non-deterministik (bug laten).
--
-- Keputusan (user, 16 Jun 2026): BLOKIR TOTAL. Satu email hanya boleh tergabung
-- atau diundang di satu toko.
--
-- Pendekatan: enforcement lewat RPC security definer (BUKAN constraint unik
-- global) — karena data lama bisa sudah punya duplikat lintas-toko; constraint
-- keras akan gagal di-apply. RPC bisa baca auth.users + memberships semua org
-- (definer), sesuatu yang RLS larang dari klien. Idempotent.
-- ============================================================

-- ---------- create_invite ----------
-- Manager membuat/memperbarui undangan untuk ORG-nya. Menolak bila email sudah
-- jadi anggota AKTIF atau punya undangan TERTUNDA di toko LAIN. Re-invite di toko
-- yang sama tetap boleh (upsert, reset created_at agar urutan klaim segar).
create or replace function create_invite(
  p_org_id uuid,
  p_email text,
  p_name text,
  p_role role_type,
  p_outlet_ids uuid[] default '{}'
)
returns pending_invites
language plpgsql security definer as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_invite pending_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not is_org_manager(p_org_id) then
    raise exception 'Forbidden';
  end if;
  if v_email = '' then
    raise exception 'Email wajib diisi';
  end if;

  -- Akun yang sudah ada untuk email ini (bila pernah daftar).
  select id into v_user_id from auth.users where lower(email) = v_email limit 1;

  -- Blokir: sudah anggota AKTIF di toko LAIN.
  if v_user_id is not null and exists (
    select 1 from memberships m
    where m.user_id = v_user_id and m.active = true and m.org_id <> p_org_id
  ) then
    raise exception 'Email ini sudah terdaftar sebagai anggota toko lain.';
  end if;

  -- Blokir: punya undangan TERTUNDA di toko LAIN.
  if exists (
    select 1 from pending_invites pi
    where lower(pi.email) = v_email and pi.claimed_at is null and pi.org_id <> p_org_id
  ) then
    raise exception 'Email ini sudah diundang ke toko lain.';
  end if;

  -- Upsert undangan untuk toko INI (re-invite / ubah peran-outlet diizinkan).
  insert into pending_invites (org_id, email, name, role, outlet_ids, invited_by, claimed_at, created_at)
  values (p_org_id, v_email, trim(p_name), p_role, coalesce(p_outlet_ids, '{}'), auth.uid(), null, now())
  on conflict (org_id, email) do update
    set name       = excluded.name,
        role       = excluded.role,
        outlet_ids = excluded.outlet_ids,
        invited_by = excluded.invited_by,
        claimed_at = null,
        created_at = now()
  returning * into v_invite;

  return v_invite;
end;
$$;

grant execute on function create_invite(uuid, text, text, role_type, uuid[]) to authenticated;

-- ---------- claim_invite (recreate dari 0024 + guard satu-toko) ----------
-- Defense-in-depth: walau create_invite mencegah undangan lintas-toko baru,
-- data lama bisa menyisakan undangan ganda. Saat klaim, bila user SUDAH anggota
-- aktif di toko lain, tolak dengan pesan jelas (jangan diam-diam buat membership
-- aktif kedua). Sisanya identik 0024 (isi membership_outlets dari outlet_ids,
-- fallback semua outlet).
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

  -- Guard satu-toko: tolak bila sudah anggota aktif di org BERBEDA.
  if exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.active = true and m.org_id <> v_invite.org_id
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
  on conflict (org_id, user_id) do update set active = true
  returning id into v_member_id;

  -- Isi penugasan outlet. Bila invite tak menyebut outlet, tugaskan semua
  -- (mencegah lockout; manager dapat mempersempit di Pengaturan → Tim).
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
