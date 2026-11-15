-- ============================================================
-- 0102_demo_leads.sql
-- Gerbang demo di landing: pengunjung mengisi nama toko + nomor WhatsApp,
-- lalu demo terbuka memakai nama toko itu. Keputusan pemilik (14 Nov 2026):
--   * nomor hanya dicek formatnya (nomor seluler Indonesia), tanpa OTP;
--   * kontak baru dikirim ke email fixmaster.cs@gmail.com dan tampil di
--     /operator;
--   * disimpan paling lama 90 hari sejak terakhir diisi, lalu dihapus
--     otomatis (ditulis di /privacy).
--
-- Satu-satunya pintu tulis adalah submit_demo_lead (anon). Tabelnya RLS
-- tanpa policy: tidak ada klien yang bisa membaca daftar nomor, termasuk
-- pengunjung yang baru mengisinya.
--
-- Notifikasi memakai rantai yang sama dengan email backup (0085): pg_cron →
-- run_demo_lead_notify() → rahasia dari Vault → Edge Function `lead-notify`.
-- Dikirim sebagai ringkasan tiap 5 menit, bukan satu email per kiriman, supaya
-- banjir kiriman palsu tidak berubah menjadi banjir email.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists demo_leads (
  id uuid primary key default gen_random_uuid(),
  shop_name text not null check (char_length(shop_name) between 2 and 60),
  -- Bentuk baku 62xxxxxxxxxx tanpa '+'. Satu baris per nomor: pengunjung
  -- yang mengisi lagi (perangkat lain) memperbarui barisnya.
  phone text not null check (phone ~ '^628[1-9][0-9]{7,10}$'),
  source text not null default 'hero' check (source in ('hero', 'final', 'demo')),
  locale text not null default 'id' check (locale in ('id', 'en')),
  visits int not null default 1,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Diisi Edge Function lead-notify setelah emailnya terkirim.
  notified_at timestamptz,
  -- Diisi operator dari /operator setelah pengunjung dihubungi.
  contacted_at timestamptz
);

create unique index if not exists demo_leads_phone_key on demo_leads (phone);
create index if not exists demo_leads_pending_idx on demo_leads (created_at) where notified_at is null;
create index if not exists demo_leads_seen_idx on demo_leads (last_seen_at);

alter table demo_leads enable row level security;
-- Hak tabel bawaan Supabase memberi anon/authenticated akses; RLS tanpa
-- policy sudah menolak, pencabutan ini lapis kedua.
revoke all on table demo_leads from anon, authenticated;

comment on table demo_leads is
  'Kontak dari gerbang demo landing (nama toko + WA). Ditulis lewat submit_demo_lead, dibaca operator lewat admin_list_demo_leads, dihapus otomatis 90 hari sejak last_seen_at.';

-- ---------- Pintu tulis (publik) ----------
create or replace function submit_demo_lead(
  p_shop_name text,
  p_phone text,
  p_source text default 'hero',
  p_locale text default 'id',
  p_trap text default ''
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_name text;
  v_phone text;
  v_headers json;
  v_ip text;
begin
  -- Kolom jebakan yang tidak terlihat manusia. Bot yang mengisinya mendapat
  -- jawaban sukses supaya tidak belajar apa-apa, tetapi tidak ada yang ditulis.
  if coalesce(btrim(p_trap), '') <> '' then
    return;
  end if;

  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(btrim(coalesce(
    v_headers ->> 'cf-connecting-ip',
    split_part(v_headers ->> 'x-forwarded-for', ',', 1)
  )), '');
  -- Per jaringan (alamat IP di-hash ke 4096 ember, tidak disimpan) dan pagar
  -- keseluruhan. Ambangnya longgar karena operator seluler Indonesia memakai
  -- CGNAT: banyak pengunjung bisa berbagi satu alamat.
  if v_ip is not null
     and not check_rate_limit('lead:' || (hashtext(v_ip) & 4095)::text, 8, 600) then
    raise exception 'rate_limited'
      using errcode = 'PT429', hint = 'demo_lead_rate_limited';
  end if;
  if not check_rate_limit('lead:all', 300, 3600) then
    raise exception 'rate_limited'
      using errcode = 'PT429', hint = 'demo_lead_rate_limited';
  end if;

  v_name := regexp_replace(btrim(coalesce(p_shop_name, '')), '\s+', ' ', 'g');
  if char_length(v_name) < 2 or char_length(v_name) > 60
     or v_name ~ '[[:cntrl:]<>]'
     or v_name ~* '(https?://|www\.)' then
    raise exception 'Nama toko tidak valid'
      using errcode = '22023', hint = 'demo_lead_name';
  end if;

  -- Sama dengan normalizeIdPhone di src/lib/business/demoLead.ts.
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if v_phone like '620%' then
    v_phone := '62' || substr(v_phone, 4);
  elsif v_phone like '0%' then
    v_phone := '62' || substr(v_phone, 2);
  elsif v_phone like '8%' then
    v_phone := '62' || v_phone;
  end if;
  if v_phone !~ '^628[1-9][0-9]{7,10}$' then
    raise exception 'Nomor WhatsApp tidak valid'
      using errcode = '22023', hint = 'demo_lead_phone';
  end if;

  insert into demo_leads (shop_name, phone, source, locale)
  values (
    v_name,
    v_phone,
    case when p_source in ('hero', 'final', 'demo') then p_source else 'hero' end,
    case when p_locale = 'en' then 'en' else 'id' end
  )
  on conflict (phone) do update
    set shop_name = excluded.shop_name,
        source = excluded.source,
        locale = excluded.locale,
        visits = demo_leads.visits + 1,
        last_seen_at = now();
end;
$fn$;

revoke all on function submit_demo_lead(text, text, text, text, text) from public;
grant execute on function submit_demo_lead(text, text, text, text, text) to anon, authenticated;

-- ---------- Notifikasi (pg_cron → Edge Function) ----------
create or replace function run_demo_lead_notify()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $fn$
declare
  v_url text;
  v_secret text;
begin
  -- Tidak ada kontak baru = tidak ada panggilan HTTP.
  if not exists (select 1 from demo_leads where notified_at is null) then
    return;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'backup_cron_secret';
  if v_url is null or v_secret is null then
    raise exception 'lead-notify: project_url / backup_cron_secret belum ada di Vault';
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/lead-notify',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$fn$;

revoke all on function run_demo_lead_notify() from public, anon, authenticated;

-- ---------- Retensi 90 hari ----------
create or replace function purge_demo_leads()
returns void
language sql
security definer
set search_path = public, pg_temp
as $fn$
  delete from demo_leads where last_seen_at < now() - interval '90 days';
$fn$;

revoke all on function purge_demo_leads() from public, anon, authenticated;

-- ---------- Jadwal ----------
select cron.unschedule('fixmaster-demo-lead-notify')
  where exists (select 1 from cron.job where jobname = 'fixmaster-demo-lead-notify');
select cron.schedule(
  'fixmaster-demo-lead-notify',
  '*/5 * * * *',
  $$ select run_demo_lead_notify(); $$
);

-- 18:45 UTC = 01:45 WIB, sesudah backup malam (18:00 UTC).
select cron.unschedule('fixmaster-purge-demo-leads')
  where exists (select 1 from cron.job where jobname = 'fixmaster-purge-demo-leads');
select cron.schedule(
  'fixmaster-purge-demo-leads',
  '45 18 * * *',
  $$ select purge_demo_leads(); $$
);

-- ---------- Operator ----------
create or replace function admin_list_demo_leads()
returns table (
  id uuid,
  shop_name text,
  phone text,
  source text,
  locale text,
  visits int,
  created_at timestamptz,
  last_seen_at timestamptz,
  notified_at timestamptz,
  contacted_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  return query
  select l.id, l.shop_name, l.phone, l.source, l.locale, l.visits,
         l.created_at, l.last_seen_at, l.notified_at, l.contacted_at
  from demo_leads l
  order by (l.contacted_at is null) desc, l.last_seen_at desc
  limit 500;
end;
$fn$;

create or replace function admin_set_demo_lead_contacted(p_id uuid, p_contacted boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_at timestamptz;
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  update demo_leads
     set contacted_at = case when p_contacted then coalesce(contacted_at, now()) else null end
   where id = p_id
  returning contacted_at into v_at;
  if not found then raise exception 'Kontak tidak ditemukan'; end if;
  return v_at;
end;
$fn$;

-- Hapus atas permintaan pemilik nomor (/privacy menjanjikannya).
create or replace function admin_delete_demo_lead(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  delete from demo_leads where id = p_id;
end;
$fn$;

revoke all on function admin_list_demo_leads() from public, anon;
revoke all on function admin_set_demo_lead_contacted(uuid, boolean) from public, anon;
revoke all on function admin_delete_demo_lead(uuid) from public, anon;
grant execute on function admin_list_demo_leads() to authenticated;
grant execute on function admin_set_demo_lead_contacted(uuid, boolean) to authenticated;
grant execute on function admin_delete_demo_lead(uuid) to authenticated;
