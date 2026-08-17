-- ============================================================
-- FixMaster — 0045: Admin platform & dashboard operator (lintas-tenant)
--
-- Sampai migrasi ini, SELURUH akses di FixMaster org-scoped: `organizations`
-- hanya terbaca oleh `is_org_member(id)`, dan adapter klien menempelkan
-- `.eq('org_id', ...)` ke tiap read. Tidak ada peran global — tidak ada tabel
-- profiles, dan `auth.jwt()` / `raw_app_meta_data` nol dipakai. Satu-satunya
-- identitas di atas keanggotaan org adalah `service_role` (edge function).
--
-- Vendor FixMaster butuh melihat kondisi tiap klien untuk mengoperasikan
-- bisnis: mana yang hampir jatuh tempo, mana yang dormant, dan pembayaran
-- GoPay mana yang meleset (sinyal lemah / HP listener mati) sehingga invoice
-- menggantung padahal uangnya sudah masuk.
--
-- >>> INI PERMUKAAN LINTAS-TENANT PERTAMA DAN SATU-SATUNYA DI SISTEM. <<<
-- Satu bug gating = data seluruh klien bocor sekaligus. Karena itu:
--   * gate `is_platform_admin()` di baris pertama SETIAP fungsi admin
--   * `set search_path = public, pg_temp` (pola 0020) — permukaan definer
--     lintas-tenant tak boleh bisa dibajak lewat search_path
--   * revoke eksplisit dari `anon` (pelajaran 0044 — lihat 1f di bawah)
--   * hanya METADATA + JUMLAH AGREGAT yang diekspos, TIDAK ADA isi bisnis
--     klien (tanpa nama pelanggan mereka, detail tiket, atau angka keuangan).
--     Keputusan sadar: vendor perlu tahu klien X jatuh tempo, bukan mengintip
--     pelanggan klien X. Sekaligus memperkecil ledakan kalau surface ini bocor.
--
-- Bootstrap admin pertama SENGAJA di luar band (insert manual via SQL Editor /
-- service_role). Tidak boleh ada jalur self-promote dari aplikasi.
-- Expand-only, idempotent. Diuji di staging dulu.
-- ============================================================

-- ---------- Tabel platform_admins ----------
-- RLS aktif dengan NOL policy: tak seorang pun bisa membacanya lewat REST,
-- hanya fungsi security definer. Pola yang sama dipakai `rate_events` (0015).
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',   -- redundan tapi bikin audit enak dibaca
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

-- ---------- is_platform_admin ----------
-- Aman di-grant ke `authenticated`: ia hanya membocorkan status DIRI SENDIRI
-- (auth.uid()), bukan daftar admin. Klien memakainya untuk memutuskan
-- menampilkan dashboard atau panel "akses ditolak".
create or replace function is_platform_admin()
returns boolean
language sql security definer stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from platform_admins where user_id = auth.uid()
  );
$$;

-- ---------- admin_list_orgs ----------
-- Satu baris per org: metadata + jumlah agregat. TIDAK ADA isi bisnis.
-- `#variable_conflict use_column` menghilangkan risiko ambiguitas antara
-- nama OUT param dan nama kolom di dalam query.
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
  last_paid_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
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
    -- Hormati soft-delete & keanggotaan aktif agar angkanya konsisten dengan
    -- helper RLS di 0042 (yang juga memfilter deleted_at is null).
    (select count(*)::int from outlets t
       where t.org_id = o.id and t.deleted_at is null),
    (select count(*)::int from memberships m
       where m.org_id = o.id and m.active = true and m.deleted_at is null),
    (select count(*)::int from services s
       where s.org_id = o.id and s.deleted_at is null),
    (select count(*)::int from sales sl
       where sl.org_id = o.id and sl.deleted_at is null),
    -- Sinyal dormant. Ditopang index idx_activity_org_created (0019).
    (select max(a.created_at) from activity_logs a where a.org_id = o.id),
    (select count(*)::int from invoices i
       where i.org_id = o.id and i.status = 'pending'),
    (select max(i.paid_at) from invoices i
       where i.org_id = o.id and i.status = 'paid')
  from organizations o
  -- Yang paling dekat jatuh tempo di atas; org tanpa expiry di bawah.
  order by o.plan_expired_at asc nulls last, o.name asc;
end;
$$;

-- ---------- admin_unpaid_gopay ----------
-- Menggerakkan panel rekonsiliasi: invoice GoPay yang menggantung. Logika
-- yang sama dengan scripts/reconcile-gopay.mjs, dipindah ke server supaya
-- service key tidak perlu dibawa ke mana-mana.
create or replace function admin_unpaid_gopay()
returns table (
  invoice_id uuid,
  org_id uuid,
  org_name text,
  invoice_plan plan_type,
  invoice_amount numeric,
  -- Dinamai `inv_status`, bukan `invoice_status`: nama parameter yang identik
  -- dengan nama TIPE bikin ambigu saat dibaca dan rawan saat fungsi diedit.
  inv_status invoice_status,
  opened_at timestamptz
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
begin
  if not is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select i.id, i.org_id, o.name, i.plan, i.amount, i.status, i.created_at
  from invoices i
  join organizations o on o.id = i.org_id
  where i.provider = 'gopay'
    and i.status in ('pending', 'expired')
  order by i.created_at desc;
end;
$$;

-- ---------- apply_payment: izinkan admin platform ----------
-- IDENTIK dengan 0022 kecuali satu klausa tambahan di gerbang pemanggil.
--
-- Kenapa memperluas guard ketimbang membuat `admin_apply_payment` yang
-- memalsukan klaim JWT (`set_config('request.jwt.claims', ...)`): pemalsuan
-- klaim menyamarkan siapa sebenarnya pemanggilnya dan bikin audit menyesatkan.
-- Menambah `is_platform_admin()` di guard itu eksplisit dan bisa dibaca.
--
-- Konsekuensi yang diterima sadar: admin platform bisa menandai invoice lunas
-- tanpa bukti pembayaran otomatis. Itu MEMANG tujuannya (pemulihan manual saat
-- notifikasi GoPay meleset), dan UI wajib memaksa konfirmasi dua langkah.
create or replace function apply_payment(p_invoice_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_plan plan_type;
  v_end timestamptz;
  v_status invoice_status;
  v_current_expiry timestamptz;
begin
  select org_id, plan, period_end, status into v_org, v_plan, v_end, v_status
  from invoices where id = p_invoice_id;
  if v_org is null then raise exception 'Invoice not found'; end if;

  -- Gerbang pemanggil: service_role (webhook/listener) ATAU owner org pemilik
  -- invoice (mock-confirm sah dari SettingsPage) ATAU admin platform (0045,
  -- rekonsiliasi lintas-tenant dari dashboard operator).
  if coalesce(auth.role(), '') <> 'service_role'
     and not is_org_owner(v_org)
     and not is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  if v_status = 'paid' then return; end if;  -- idempotent

  update invoices set status = 'paid', paid_at = now() where id = p_invoice_id;

  -- Tandai jalur sah agar trigger plan_type mengizinkan (transaksi-lokal).
  perform set_config('fixmaster.bypass_plan_lock', '1', true);

  select plan_expired_at into v_current_expiry from organizations where id = v_org;
  update organizations
  set plan_type = v_plan,
      plan_expired_at = greatest(coalesce(v_current_expiry, now()), now()) + interval '1 month'
  where id = v_org;
end;
$$;

-- ---------- Grants ----------
-- PELAJARAN 0044: Supabase memasang DEFAULT PRIVILEGES yang meng-grant EXECUTE
-- secara EKSPLISIT ke `anon` dan `authenticated` untuk tiap fungsi baru di
-- schema public. `revoke ... from public` TIDAK menghapus grant eksplisit itu,
-- jadi `anon` harus dicabut dengan namanya. Dua lapis: revoke menutup anon,
-- gate is_platform_admin() menutup authenticated biasa.
revoke execute on function is_platform_admin() from public, anon;
revoke execute on function admin_list_orgs() from public, anon;
revoke execute on function admin_unpaid_gopay() from public, anon;

grant execute on function is_platform_admin() to authenticated;
grant execute on function admin_list_orgs() to authenticated;
grant execute on function admin_unpaid_gopay() to authenticated;

-- apply_payment tetap seperti sebelumnya (authenticated, self-gated).
grant execute on function apply_payment(uuid) to authenticated;
