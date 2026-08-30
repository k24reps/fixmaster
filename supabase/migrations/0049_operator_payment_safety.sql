-- ============================================================
-- FixMaster — 0049: hardening pembayaran manual operator
--
-- Aktivasi ulang bebas dihapus. Organisasi trial/kedaluwarsa/ditangguhkan
-- hanya mendapat masa aktif melalui pembayaran Solo/Pro yang nominalnya
-- cocok dengan harga resmi dan jumlah outlet aktif.
-- ============================================================

drop function if exists admin_reactivate_org(uuid, plan_type, text);

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
  last_activity_at timestamptz,
  last_paid_at timestamptz,
  last_paid_reference text,
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
    (select max(a.created_at) from activity_logs a where a.org_id = o.id),
    (select i.paid_at from invoices i
       where i.org_id = o.id and i.status = 'paid'
       order by i.paid_at desc nulls last, i.created_at desc
       limit 1),
    (select i.provider_ref from invoices i
       where i.org_id = o.id and i.status = 'paid'
       order by i.paid_at desc nulls last, i.created_at desc
       limit 1),
    coalesce((select cn.note from client_notes cn where cn.org_id = o.id), '')
  from organizations o
  order by o.plan_expired_at asc nulls last, o.name asc;
end;
$fn$;

create or replace function admin_confirm_manual_payment(
  p_org_id uuid,
  p_plan plan_type,
  p_months int,
  p_amount numeric,
  p_reference text,
  p_reason text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before timestamptz;
  v_after timestamptz;
  v_start timestamptz;
  v_old_plan plan_type;
  v_invoice uuid;
  v_existing_end timestamptz;
  v_outlet_count int;
  v_monthly_amount numeric;
  v_expected_amount numeric;
begin
  if not is_platform_admin() then
    raise exception 'Forbidden';
  end if;
  if p_plan is null or p_plan not in ('standard'::plan_type, 'enterprise'::plan_type) then
    raise exception 'Paket pembayaran harus Solo atau Pro';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'Durasi pembayaran harus 1-12 bulan';
  end if;
  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'Referensi pembayaran wajib diisi';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Catatan verifikasi wajib diisi';
  end if;

  select plan_expired_at, plan_type
    into v_before, v_old_plan
  from organizations
  where id = p_org_id
  for update;
  if v_old_plan is null then
    raise exception 'Organisasi tidak ditemukan';
  end if;

  select count(*)::int into v_outlet_count
  from outlets
  where org_id = p_org_id and deleted_at is null;

  if p_plan = 'standard'::plan_type and v_outlet_count > 1 then
    raise exception 'Paket Solo hanya dapat dipakai organisasi dengan satu outlet';
  end if;

  v_monthly_amount := case
    when p_plan = 'standard'::plan_type then 99000
    else least(199000 + greatest(v_outlet_count - 2, 0) * 50000, 349000)
  end;
  v_expected_amount := v_monthly_amount * p_months;

  if p_amount is null or p_amount <> v_expected_amount then
    raise exception 'Nominal tidak cocok. Total yang diharapkan Rp %',
      to_char(v_expected_amount, 'FM999G999G999');
  end if;

  -- Referensi yang sama adalah retry, bukan pembayaran baru. Lock organisasi
  -- di atas juga menserialisasi dua klik konfirmasi yang bersamaan.
  select period_end into v_existing_end
  from invoices
  where org_id = p_org_id
    and provider = 'manual_whatsapp'
    and provider_ref = btrim(p_reference)
    and status = 'paid'
  order by paid_at desc
  limit 1;
  if v_existing_end is not null then
    return v_existing_end;
  end if;

  v_start := greatest(coalesce(v_before, now()), now());
  v_after := v_start + make_interval(months => p_months);

  insert into invoices (
    org_id, plan, amount, status, provider, provider_ref,
    period_start, period_end, paid_at
  ) values (
    p_org_id, p_plan, v_expected_amount, 'paid', 'manual_whatsapp', btrim(p_reference),
    v_start, v_after, now()
  )
  returning id into v_invoice;

  perform set_config('fixmaster.bypass_plan_lock', '1', true);
  update organizations
  set plan_type = p_plan,
      plan_expired_at = v_after
  where id = p_org_id;

  perform log_operator_action(
    p_org_id,
    'payment_manual',
    btrim(p_reason),
    jsonb_build_object(
      'invoice_id', v_invoice,
      'nominal_bulanan', v_monthly_amount,
      'nominal', v_expected_amount,
      'bulan', p_months,
      'referensi', btrim(p_reference),
      'outlet_count', v_outlet_count,
      'plan_sebelum', v_old_plan,
      'plan_sesudah', p_plan,
      'expiry_sebelum', v_before,
      'expiry_sesudah', v_after
    )
  );

  return v_after;
end;
$fn$;

revoke execute on function admin_list_orgs() from public, anon;
grant execute on function admin_list_orgs() to authenticated;

revoke execute on function admin_confirm_manual_payment(
  uuid, plan_type, int, numeric, text, text
) from public, anon;
grant execute on function admin_confirm_manual_payment(
  uuid, plan_type, int, numeric, text, text
) to authenticated;
