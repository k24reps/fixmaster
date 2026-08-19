-- ============================================================
-- FixMaster — 0046: Kontrol operator + jejak aksi (lintas-tenant)
--
-- `0045` memberi vendor kemampuan MELIHAT semua klien. Migrasi ini memberi
-- kemampuan MENGUBAH: suspend, aktifkan kembali, dan menambah masa aktif lewat
-- promo. Karena itu ia dimulai dari tabel jejaknya, bukan dari fiturnya.
--
-- >>> ATURAN YANG MENGIKAT MIGRASI BERIKUTNYA <<<
-- Setiap RPC admin yang MENULIS wajib memanggil `log_operator_action()`.
-- Kalau sebuah RPC tulis tidak mencatat, jangan di-merge.
--
-- Kenapa keras soal ini: pembayaran punya bukti pendamping (mutasi GoPay
-- Merchant) sehingga log yang hilang masih bisa direkonstruksi. PROMO TIDAK
-- PUNYA ITU — tak ada uang, tak ada notifikasi, tak ada sumber kedua. Sekali
-- tidak dicatat, hilang permanen. Yang ikut hilang bukan cuma jejak audit,
-- tapi kemampuan membedakan bulan yang DIBAYAR dari bulan yang DIBERIKAN —
-- padahal itu satu-satunya hal yang harus dibuktikan Fase 0 di
-- docs/roadmap-penjualan.md ("Niat bayar").
--
-- Catatan `plan_type`: trigger `guard_plan_type_change` (0016) mengunci kolom
-- itu kecuali pemanggil menandai `fixmaster.bypass_plan_lock` (transaksi-lokal)
-- atau ber-role service_role. RPC di bawah memakai flag yang sama seperti
-- `apply_payment`.
-- Expand-only, idempotent.
-- ============================================================

create table if not exists operator_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete set null,
  org_name text not null default '',
  actor_id uuid,
  actor_email text not null default '',
  action text not null,
  reason text not null default '',
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_operator_actions_created on operator_actions (created_at desc);
create index if not exists idx_operator_actions_org on operator_actions (org_id, created_at desc);
alter table operator_actions enable row level security;

create table if not exists client_notes (
  org_id uuid primary key references organizations(id) on delete cascade,
  note text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table client_notes enable row level security;

create or replace function log_operator_action(
  p_org uuid, p_action text, p_reason text, p_detail jsonb
)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email text;
  v_org_name text;
begin
  select email into v_email from platform_admins where user_id = auth.uid();
  select name into v_org_name from organizations where id = p_org;
  insert into operator_actions (org_id, org_name, actor_id, actor_email, action, reason, detail)
  values (p_org, coalesce(v_org_name, ''), auth.uid(), coalesce(v_email, ''),
          p_action, coalesce(p_reason, ''), coalesce(p_detail, '{}'::jsonb));
end;
$fn$;

-- ---------- Suspend ----------
-- `suspended` sudah ditegakkan sejak 0009: is_org_active() false -> RLS
-- memblokir SEMUA operasi tulis org itu. Migrasi ini hanya memberi tuas.
create or replace function admin_suspend_org(p_org_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old plan_type;
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  -- Alasan WAJIB: aksi ini mematikan operasional sebuah usaha. Jejak tanpa
  -- alasan tidak menjawab pertanyaan yang akan ditanyakan kemudian.
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi';
  end if;

  select plan_type into v_old from organizations where id = p_org_id;
  if v_old is null then raise exception 'Org tidak ditemukan'; end if;
  if v_old = 'suspended' then return; end if;

  perform set_config('fixmaster.bypass_plan_lock', '1', true);
  update organizations set plan_type = 'suspended' where id = p_org_id;

  perform log_operator_action(p_org_id, 'suspend', p_reason,
    jsonb_build_object('plan_sebelum', v_old));
end;
$fn$;

create or replace function admin_reactivate_org(p_org_id uuid, p_plan plan_type, p_reason text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old plan_type;
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  if p_plan = 'suspended' then raise exception 'Pakai admin_suspend_org untuk menangguhkan'; end if;

  select plan_type into v_old from organizations where id = p_org_id;
  if v_old is null then raise exception 'Org tidak ditemukan'; end if;

  perform set_config('fixmaster.bypass_plan_lock', '1', true);
  update organizations set plan_type = p_plan where id = p_org_id;

  perform log_operator_action(p_org_id, 'reactivate', p_reason,
    jsonb_build_object('plan_sebelum', v_old, 'plan_sesudah', p_plan));
end;
$fn$;

-- ---------- Promo (menambah masa aktif TANPA uang) ----------
-- SENGAJA terpisah dari `apply_payment`. Memisahkannya membuat pertanyaan
-- "bulan ini berapa yang dibayar, berapa yang digratiskan" bisa dijawab satu
-- query — `apply_payment` tetap berarti uang sungguhan masuk.
create or replace function admin_apply_promo(
  p_org_id uuid, p_promo text, p_days int, p_reason text
)
returns timestamptz
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
declare
  v_before timestamptz;
  v_after timestamptz;
  v_plan plan_type;
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  if coalesce(btrim(p_promo), '') = '' then raise exception 'Jenis promo wajib diisi'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then
    raise exception 'Durasi promo harus 1-365 hari';
  end if;

  select plan_expired_at, plan_type into v_before, v_plan
  from organizations where id = p_org_id;
  if v_plan is null then raise exception 'Org tidak ditemukan'; end if;
  -- Menambah hari ke org yang ditangguhkan menyesatkan: aksesnya tetap mati.
  if v_plan = 'suspended' then
    raise exception 'Org sedang suspended - aktifkan kembali dulu';
  end if;

  v_after := greatest(coalesce(v_before, now()), now()) + make_interval(days => p_days);
  update organizations set plan_expired_at = v_after where id = p_org_id;

  perform log_operator_action(p_org_id, 'promo', p_reason,
    jsonb_build_object('promo', p_promo, 'hari', p_days,
                       'expiry_sebelum', v_before, 'expiry_sesudah', v_after));
  return v_after;
end;
$fn$;

-- ---------- Catatan klien ----------
-- SENGAJA tidak menulis operator_actions: `client_notes` sudah menyimpan
-- updated_by + updated_at, jadi ia jejaknya sendiri. Mencatat tiap penyuntingan
-- hanya membanjiri log dan menenggelamkan aksi yang mengubah akses/masa aktif.
create or replace function admin_set_client_note(p_org_id uuid, p_note text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  insert into client_notes (org_id, note, updated_by, updated_at)
  values (p_org_id, coalesce(p_note, ''), auth.uid(), now())
  on conflict (org_id) do update
    set note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
end;
$fn$;

create or replace function admin_list_operator_actions(p_limit int default 50)
returns table (
  action_id uuid,
  org_id uuid,
  org_name text,
  actor_email text,
  action text,
  reason text,
  detail jsonb,
  acted_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  return query
  select a.id, a.org_id, a.org_name, a.actor_email, a.action, a.reason, a.detail, a.created_at
  from operator_actions a
  order by a.created_at desc
  limit least(coalesce(p_limit, 50), 200);
end;
$fn$;

-- ---------- admin_list_orgs: tambah kolom scorecard + catatan ----------
-- Tiga kolom pertama memetakan Scorecard Pilot di docs/roadmap-penjualan.md:
-- Aktivasi (daftar -> transaksi pertama), Retensi mingguan, Kedalaman pakai.
-- Semuanya dihitung dari data yang SUDAH ada — tak ada isi bisnis klien baru
-- yang diekspos, hanya hitungan.
-- CREATE OR REPLACE TIDAK BISA mengubah tipe kembalian sebuah fungsi
-- (SQLSTATE 42P13). `0045` membuat admin_list_orgs() dengan 13 kolom OUT;
-- di sini jadi 17, jadi harus DROP dulu. Wajib diingat untuk migrasi
-- berikutnya yang menambah kolom ke RPC ber-RETURNS TABLE.
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
  weeks_active int,
  modules_used int,
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
    (select count(distinct date_trunc('week', a.created_at))::int
       from activity_logs a
       where a.org_id = o.id and a.created_at >= now() - interval '21 days'),
    (
      (case when exists (select 1 from services s where s.org_id = o.id) then 1 else 0 end)
      + (case when exists (select 1 from sales sl where sl.org_id = o.id) then 1 else 0 end)
      + (case when exists (select 1 from inventory_items iv where iv.org_id = o.id) then 1 else 0 end)
      + (case when exists (select 1 from incomes ic where ic.org_id = o.id)
                or exists (select 1 from expenses ex where ex.org_id = o.id) then 1 else 0 end)
    ),
    coalesce((select cn.note from client_notes cn where cn.org_id = o.id), '')
  from organizations o
  order by o.plan_expired_at asc nulls last, o.name asc;
end;
$fn$;

-- ---------- apply_payment: catat bila dilakukan admin platform ----------
-- IDENTIK dengan 0045 kecuali satu pemanggilan log di akhir. Pembayaran yang
-- diterima MANUAL oleh operator (rekonsiliasi GoPay meleset) harus punya jejak
-- yang sama dengan promo — dari luar, keduanya sama-sama "masa aktif bertambah
-- tanpa webhook".
create or replace function apply_payment(p_invoice_id uuid)
returns void
language plpgsql security definer as $fn$
declare
  v_org uuid;
  v_plan plan_type;
  v_end timestamptz;
  v_status invoice_status;
  v_current_expiry timestamptz;
  v_amount numeric;
begin
  select org_id, plan, period_end, status, amount
    into v_org, v_plan, v_end, v_status, v_amount
  from invoices where id = p_invoice_id;
  if v_org is null then raise exception 'Invoice not found'; end if;

  if coalesce(auth.role(), '') <> 'service_role'
     and not is_org_owner(v_org)
     and not is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  if v_status = 'paid' then return; end if;

  update invoices set status = 'paid', paid_at = now() where id = p_invoice_id;

  perform set_config('fixmaster.bypass_plan_lock', '1', true);

  select plan_expired_at into v_current_expiry from organizations where id = v_org;
  update organizations
  set plan_type = v_plan,
      plan_expired_at = greatest(coalesce(v_current_expiry, now()), now()) + interval '1 month'
  where id = v_org;

  -- Hanya jalur operator yang dicatat. Webhook (service_role) sudah punya log
  -- Edge Function; owner mock-confirm bukan aksi lintas-tenant.
  if coalesce(auth.role(), '') <> 'service_role' and is_platform_admin() then
    perform log_operator_action(v_org, 'payment', 'rekonsiliasi manual',
      jsonb_build_object('invoice_id', p_invoice_id, 'nominal', v_amount));
  end if;
end;
$fn$;

-- ---------- Grants ----------
-- Pelajaran 0044: Supabase meng-grant EXECUTE eksplisit ke anon + authenticated
-- untuk fungsi baru, jadi `revoke from public` saja tidak cukup.
-- admin_list_orgs baru saja di-DROP + CREATE, jadi DEFAULT PRIVILEGES Supabase
-- memasang ulang EXECUTE untuk anon + authenticated. Tanpa revoke ulang di
-- sini, lubang 0044 kembali terbuka pada fungsi ini secara diam-diam.
revoke execute on function admin_list_orgs() from public, anon;
grant execute on function admin_list_orgs() to authenticated;

revoke execute on function log_operator_action(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function admin_suspend_org(uuid, text) from public, anon;
revoke execute on function admin_reactivate_org(uuid, plan_type, text) from public, anon;
revoke execute on function admin_apply_promo(uuid, text, int, text) from public, anon;
revoke execute on function admin_set_client_note(uuid, text) from public, anon;
revoke execute on function admin_list_operator_actions(int) from public, anon;

grant execute on function admin_suspend_org(uuid, text) to authenticated;
grant execute on function admin_reactivate_org(uuid, plan_type, text) to authenticated;
grant execute on function admin_apply_promo(uuid, text, int, text) to authenticated;
grant execute on function admin_set_client_note(uuid, text) to authenticated;
grant execute on function admin_list_operator_actions(int) to authenticated;
