-- Konsol operator: tampilkan nomor telepon TOKO (organizations.phone).
--
-- 0045 membatasi permukaan lintas-tenant pada METADATA + JUMLAH AGREGAT, tanpa isi
-- bisnis klien. Nomor toko termasuk metadata: kontak vendor ke kliennya, diisi
-- klien sendiri di Pengaturan > Profil Usaha. Yang tetap TIDAK boleh keluar adalah
-- data milik pelanggan klien (nama/nomor pelanggan, isi tiket, angka keuangan) -
-- dijaga tes tier2c. Kolom sengaja bernama `org_phone`, bukan `phone`, agar jelas
-- nomor siapa.
--
-- Mengubah daftar kolom RETURNS TABLE butuh drop + create; badan fungsi sama
-- persis dengan 0049 kecuali kolom baru di akhir.

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
  note text,
  org_phone text
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
    coalesce((select cn.note from client_notes cn where cn.org_id = o.id), ''),
    coalesce(o.phone, '')
  from organizations o
  order by o.plan_expired_at asc nulls last, o.name asc;
end;
$fn$;

revoke execute on function admin_list_orgs() from public, anon;
grant execute on function admin_list_orgs() to authenticated;
