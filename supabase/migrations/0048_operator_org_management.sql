-- ============================================================
-- FixMaster — 0048: Operator organization management
--
-- Removes obsolete pilot scorecard fields from admin_list_orgs and adds a
-- guarded permanent-delete RPC. The delete audit survives because
-- operator_actions.org_id uses ON DELETE SET NULL and stores org_name.
-- ============================================================

drop function if exists admin_list_orgs();

create or replace function admin_list_orgs()
returns table (
  org_id uuid,
  org_name text,
  org_plan plan_type,
  expires_at timestamptz,
  registered_at timestamptz,
  demo boolean,
  outlet_count int,
  user_count int,
  service_count int,
  sale_count int,
  last_activity_at timestamptz,
  pending_invoices int,
  last_paid_at timestamptz,
  activation_hours numeric,
  note text
)
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    o.id,
    o.name,
    o.plan_type,
    o.plan_expired_at,
    o.created_at,
    o.is_demo,
    (select count(*)::int from outlets t
       where t.org_id = o.id and t.deleted_at is null),
    (select count(*)::int from memberships m
       where m.org_id = o.id and m.active = true and m.deleted_at is null),
    (select count(*)::int from services s
       where s.org_id = o.id and s.deleted_at is null),
    (select count(*)::int from sales sl
       where sl.org_id = o.id and sl.deleted_at is null),
    (select max(a.created_at) from activity_logs a where a.org_id = o.id),
    (select count(*)::int from invoices i
       where i.org_id = o.id and i.status = 'pending'),
    (select max(i.paid_at) from invoices i
       where i.org_id = o.id and i.status = 'paid'),
    (select round(extract(epoch from (min(s.created_at) - o.created_at)) / 3600.0, 1)
       from services s where s.org_id = o.id),
    coalesce((select cn.note from client_notes cn where cn.org_id = o.id), '')
  from organizations o
  order by o.plan_expired_at asc nulls last, o.name asc;
end;
$fn$;

create or replace function admin_delete_org(
  p_org_id uuid,
  p_confirmation text,
  p_reason text
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text;
  v_number text;
  v_outlets int;
  v_members int;
  v_services int;
begin
  if not is_platform_admin() then
    raise exception 'Forbidden';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Alasan penghapusan wajib diisi';
  end if;

  select name into v_name
  from organizations
  where id = p_org_id
  for update;
  if v_name is null then
    raise exception 'Organisasi tidak ditemukan';
  end if;

  v_number := 'ORG-' || upper(substring(replace(p_org_id::text, '-', '') from 1 for 8));
  if upper(btrim(coalesce(p_confirmation, ''))) <> v_number then
    raise exception 'Nomor organisasi tidak cocok';
  end if;

  select count(*)::int into v_outlets from outlets where org_id = p_org_id;
  select count(*)::int into v_members from memberships where org_id = p_org_id;
  select count(*)::int into v_services from services where org_id = p_org_id;

  perform log_operator_action(
    p_org_id,
    'delete_org',
    btrim(p_reason),
    jsonb_build_object(
      'org_id', p_org_id,
      'org_number', v_number,
      'outlet_count', v_outlets,
      'member_count', v_members,
      'service_count', v_services
    )
  );

  delete from organizations where id = p_org_id;
end;
$fn$;

revoke execute on function admin_list_orgs() from public, anon;
grant execute on function admin_list_orgs() to authenticated;

revoke execute on function admin_delete_org(uuid, text, text)
  from public, anon;
grant execute on function admin_delete_org(uuid, text, text)
  to authenticated;
