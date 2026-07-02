-- Migration 0037: soft-delete inactive team member.
--
-- Desain soft-delete:
-- - Set deleted_at pada baris memberships (bukan hard delete).
-- - Data historis (activity_logs, services, dll.) tetap utuh karena
--   referensi menggunakan employee ID yang masih ada di DB.
-- - Baris yang di-soft-delete TIDAK muncul di list() karena:
--   (a) LocalAdapter: filter deleted_at IS NULL di client.
--   (b) SupabaseAdapter: filter .is('deleted_at', null) di query.
--
-- Guards (semua server-side via security definer):
-- 1. Caller harus org owner.
-- 2. Member target harus sudah nonaktif (active = false).
-- 3. Tidak bisa menghapus diri sendiri.
-- 4. Member tidak ditemukan / sudah di-delete → exception.

create or replace function delete_member(p_member_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_active  boolean;
  v_is_self boolean;
begin
  select org_id,
         active,
         (user_id = auth.uid())
  into   v_org, v_active, v_is_self
  from   memberships
  where  id          = p_member_id
    and  deleted_at  is null;

  if v_org is null then
    raise exception 'Anggota tidak ditemukan';
  end if;

  if not is_org_owner(v_org) then
    raise exception 'Hanya owner yang dapat menghapus anggota';
  end if;

  if v_is_self then
    raise exception 'Tidak bisa menghapus akun sendiri';
  end if;

  if v_active then
    raise exception 'Nonaktifkan anggota terlebih dahulu sebelum menghapus';
  end if;

  update memberships
  set    deleted_at = now()
  where  id = p_member_id;
end;
$$;

grant execute on function delete_member(uuid) to authenticated;
