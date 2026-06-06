-- ============================================================
-- FixMaster — Fase 1A: Manajemen Tim (undangan + peran)
-- Model undangan = "pending-invite + claim" (Opsi B): tanpa Edge
-- Function / email transaksional. Owner/admin membuat baris undangan
-- (email + peran); karyawan daftar mandiri dengan email itu, lalu
-- claim_invite() menautkannya ke org sebagai membership.
-- Semua RPC security definer + cek is_org_manager. Idempotent.
-- ============================================================

-- ---------- pending_invites ----------
create table if not exists pending_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  name text not null default '',
  role role_type not null default 'karyawan',
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  -- One outstanding invite per email per org.
  unique (org_id, email)
);
create index if not exists idx_pending_invites_email on pending_invites(lower(email));
create index if not exists idx_pending_invites_org on pending_invites(org_id);

alter table pending_invites enable row level security;

-- Managers manage their org's invites; members may read (to see pending list).
drop policy if exists invites_select on pending_invites;
create policy invites_select on pending_invites
  for select using (is_org_member(org_id));
drop policy if exists invites_manage on pending_invites;
create policy invites_manage on pending_invites
  for all using (is_org_manager(org_id)) with check (is_org_manager(org_id));

-- ---------- claim_invite ----------
-- Called right after a new account signs up. Finds an unclaimed invite
-- matching the signed-in user's email, creates the membership, and marks
-- the invite claimed. Returns the org id joined, or null if none.
create or replace function claim_invite()
returns uuid
language plpgsql security definer as $$
declare
  v_email text;
  v_invite pending_invites%rowtype;
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

  -- Link as membership (idempotent on org_id+user_id).
  insert into memberships (org_id, user_id, name, role, active)
  values (
    v_invite.org_id,
    auth.uid(),
    coalesce(nullif(v_invite.name, ''), split_part(v_email, '@', 1)),
    v_invite.role,
    true
  )
  on conflict (org_id, user_id) do update set active = true;

  update pending_invites set claimed_at = now() where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

-- ---------- set_member_role ----------
-- Manager changes a member's role. Refuses to demote the last active owner.
create or replace function set_member_role(p_member_id uuid, p_role role_type)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_old role_type;
  v_owner_count int;
begin
  select org_id, role into v_org, v_old from memberships where id = p_member_id;
  if v_org is null then raise exception 'Member not found'; end if;
  if not is_org_manager(v_org) then raise exception 'Forbidden'; end if;

  -- Guard: don't remove the last owner.
  if v_old = 'owner' and p_role <> 'owner' then
    select count(*) into v_owner_count
    from memberships where org_id = v_org and role = 'owner' and active = true;
    if v_owner_count <= 1 then
      raise exception 'Tidak bisa menurunkan owner terakhir';
    end if;
  end if;

  update memberships set role = p_role where id = p_member_id;
end;
$$;

-- ---------- deactivate_member ----------
-- Manager deactivates (soft-disable) a member. Refuses the last active owner.
create or replace function deactivate_member(p_member_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_role role_type;
  v_owner_count int;
begin
  select org_id, role into v_org, v_role from memberships where id = p_member_id;
  if v_org is null then raise exception 'Member not found'; end if;
  if not is_org_manager(v_org) then raise exception 'Forbidden'; end if;

  if v_role = 'owner' then
    select count(*) into v_owner_count
    from memberships where org_id = v_org and role = 'owner' and active = true;
    if v_owner_count <= 1 then
      raise exception 'Tidak bisa menonaktifkan owner terakhir';
    end if;
  end if;

  update memberships set active = false where id = p_member_id;
end;
$$;

grant execute on function claim_invite() to authenticated;
grant execute on function set_member_role(uuid, role_type) to authenticated;
grant execute on function deactivate_member(uuid) to authenticated;
