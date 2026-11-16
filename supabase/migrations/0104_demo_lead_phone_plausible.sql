-- ============================================================
-- 0104_demo_lead_phone_plausible.sql
-- Saringan nomor asal-asalan di gerbang demo. Gerbang 0102 hanya memeriksa
-- format (cek format, tanpa OTP: keputusan pemilik 14 Nov 2026), sehingga
-- 0812-0000-0000 atau contoh di placeholder 0812-3456-7890 lolos. Keputusan
-- pemilik 16 Nov 2026: tetap tanpa OTP, tetapi tolak pola yang jelas palsu.
--
-- Yang ditolak:
--   * awalan yang tidak dipakai operator seluler mana pun (0800, 0845, ...);
--   * nomor pelanggan nol semua (0812-0000-0000);
--   * deret urut naik/turun, minimal 6 digit, sesudah 08 atau pada nomor
--     pelanggan saja (0812-3456-7890, 0857-1234-5678, 0898-765-432).
-- Yang sengaja tetap diterima: nomor cantik berangka sama (0812-8888-8888),
-- karena memang dijual dan dipakai untuk usaha. Menolak nomor asli lebih
-- mahal daripada meloloskan nomor palsu.
--
-- Cermin di klien: isPlausibleIdMobile di src/lib/business/demoLead.ts;
-- demoLead.test.ts membaca berkas ini supaya kedua sisi tidak berbeda.
-- Baris yang sudah tersimpan tidak disentuh.
-- ============================================================

-- Angka beruntun naik atau turun (9->0 dan 0->9 ikut dihitung).
create or replace function demo_lead_digit_run(p_digits text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $fn$
declare
  v_first int;
  v_step int;
  i int;
begin
  if p_digits is null or char_length(p_digits) < 6 or p_digits !~ '^[0-9]+$' then
    return false;
  end if;
  v_first := (substr(p_digits, 2, 1)::int - substr(p_digits, 1, 1)::int + 10) % 10;
  if v_first not in (1, 9) then
    return false;
  end if;
  for i in 2 .. char_length(p_digits) - 1 loop
    v_step := (substr(p_digits, i + 1, 1)::int - substr(p_digits, i, 1)::int + 10) % 10;
    if v_step <> v_first then
      return false;
    end if;
  end loop;
  return true;
end;
$fn$;

-- p_phone dalam bentuk baku 628xxxxxxxxx (sesudah normalisasi submit_demo_lead).
create or replace function demo_lead_phone_plausible(p_phone text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select p_phone ~ '^628(1[1-9]|2[1238]|3[1238]|5[1-35-9]|68|7[7-9]|8[1-9]|9[5-9])'
     and substr(p_phone, 6) !~ '^0+$'
     and not demo_lead_digit_run(substr(p_phone, 4))
     and not demo_lead_digit_run(substr(p_phone, 6));
$fn$;

-- Pembantu internal: tidak dibuka lewat PostgREST.
revoke all on function demo_lead_digit_run(text) from public, anon, authenticated;
revoke all on function demo_lead_phone_plausible(text) from public, anon, authenticated;

-- ---------- Pintu tulis (publik): sama dengan 0102 + saringan di atas ----------
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
  -- 0104: tolak isian asal-asalan yang jelas (lihat demo_lead_phone_plausible).
  if not demo_lead_phone_plausible(v_phone) then
    raise exception 'Nomor WhatsApp tidak terlihat aktif'
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
