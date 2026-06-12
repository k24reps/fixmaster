-- ============================================================
-- FixMaster — 0024: Penugasan karyawan ke outlet (many-to-many)
-- Fondasi untuk Level 2 (penguncian tim per-cabang). Migrasi ini
-- bersifat EXPAND-ONLY dan PERMISIF: ia menambah struktur + data,
-- tetapi BELUM mengubah perilaku keamanan. Pengetatan RLS ada di
-- 0025 (terpisah, di-apply setelah owner menetapkan outlet).
--
-- Isi:
--   A. Tabel junction membership_outlets (karyawan ↔ outlet).
--   B. Helper auth_outlet_ids() untuk RLS (security definer stable).
--   C. RPC set_member_outlets() — manager mengatur cabang anggota.
--   D. Backfill: SEMUA anggota lama → SEMUA outlet org-nya
--      (mencegah lockout saat 0025 mengetatkan RLS).
--   E. pending_invites.outlet_ids + claim_invite mengisi junction.
--
-- Idempotent. Aman untuk sesi berjalan. Uji di staging dulu.
-- ============================================================

-- ------------------------------------------------------------
-- A. Tabel junction
-- ------------------------------------------------------------
create table if not exists membership_outlets (
  membership_id uuid not null references memberships(id) on delete cascade,
  outlet_id     uuid not null references outlets(id)     on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (membership_id, outlet_id)
);
create index if not exists idx_membership_outlets_member on membership_outlets(membership_id);
create index if not exists idx_membership_outlets_outlet on membership_outlets(outlet_id);
create index if not exists idx_membership_outlets_org on membership_outlets(org_id);

alter table membership_outlets enable row level security;

-- Member boleh membaca penugasan di org-nya (agar tahu cabangnya);
-- manager mengelola (insert/update/delete).
drop policy if exists mo_select on membership_outlets;
create policy mo_select on membership_outlets
  for select using (is_org_member(org_id));
drop policy if exists mo_manage on membership_outlets;
create policy mo_manage on membership_outlets
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ------------------------------------------------------------
-- B. Helper RLS: outlet yang boleh diakses user aktif.
--    Security definer + stable, mengikuti pola auth_org_ids() (0001).
-- ------------------------------------------------------------
create or replace function auth_outlet_ids()
returns setof uuid language sql security definer stable as $$
  select mo.outlet_id
  from membership_outlets mo
  join memberships m on m.id = mo.membership_id
  where m.user_id = auth.uid() and m.active = true;
$$;

-- ------------------------------------------------------------
-- C. RPC: manager menetapkan daftar outlet untuk satu anggota.
--    Mengganti seluruh penugasan (replace), atomik. Manager-only.
-- ------------------------------------------------------------
create or replace function set_member_outlets(p_member_id uuid, p_outlet_ids uuid[])
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_outlet uuid;
begin
  select org_id into v_org from memberships where id = p_member_id;
  if v_org is null then raise exception 'Member not found'; end if;
  if not is_org_manager(v_org) then raise exception 'Forbidden'; end if;

  -- Replace: hapus penugasan lama, lalu isi yang baru.
  delete from membership_outlets where membership_id = p_member_id;

  if p_outlet_ids is not null then
    foreach v_outlet in array p_outlet_ids loop
      -- Hanya outlet milik org yang sama (cegah lintas-org).
      if exists (select 1 from outlets o where o.id = v_outlet and o.org_id = v_org) then
        insert into membership_outlets (membership_id, outlet_id, org_id)
        values (p_member_id, v_outlet, v_org)
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;

grant execute on function auth_outlet_ids() to authenticated;
grant execute on function set_member_outlets(uuid, uuid[]) to authenticated;

-- ------------------------------------------------------------
-- D. Backfill: semua anggota aktif → semua outlet org-nya.
--    Ini menjamin tidak ada yang kehilangan akses saat 0025
--    mengetatkan RLS; owner lalu mempersempit lewat UI Tim.
-- ------------------------------------------------------------
insert into membership_outlets (membership_id, outlet_id, org_id)
select m.id, o.id, m.org_id
from memberships m
join outlets o on o.org_id = m.org_id
on conflict do nothing;

-- ------------------------------------------------------------
-- E. Undangan membawa daftar outlet; claim mengisi junction.
-- ------------------------------------------------------------
alter table pending_invites
  add column if not exists outlet_ids uuid[] default '{}';

-- Recreate claim_invite (dari 0008): setelah membuat membership,
-- isi membership_outlets dari invite.outlet_ids. Bila kosong,
-- fallback ke SEMUA outlet org (aman dari lockout; owner mempersempit).
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
