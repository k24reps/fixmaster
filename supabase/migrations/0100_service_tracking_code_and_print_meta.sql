-- ============================================================
-- FixMaster — 0100: kode lacak acak + jejak cetak nota servis (11 Nov 2026)
--
-- A. service_tracking: satu baris per tiket, TERPISAH dari `services`.
--    - track_code: 10 huruf Crockford base32 (50 bit acak), unik global.
--      Alamat lacak menjadi `/t/<kode>` tanpa UUID organisasi. Nomor tiket
--      yang berurutan tak lagi cukup untuk mengintip tiket pelanggan lain.
--    - print_count / last_printed_at / last_printed_kind: dasar penanda
--      CETAK ULANG. Cetak ulang = jenis dokumen yang SAMA (tanda terima, nota,
--      nota serah) sudah pernah dicetak; nota serah sesudah tanda terima
--      adalah dokumen baru, bukan salinan.
--
--    Kenapa tabel sendiri, bukan kolom di services:
--      * tiap UPDATE services memancarkan realtime, dan useCollection lalu
--        menarik ulang daftar servis di SEMUA perangkat. Mencatat satu cetakan
--        tidak boleh semahal itu;
--      * kolom ber-default acak memaksa penulisan ulang seluruh tabel services;
--      * klien mengirim baris services penuh dari salinan yang bisa basi (lihat
--        0087), jadi kolom milik server butuh penjaga. Tabel tanpa policy tidak.
--    Pola yang sama dengan service_secrets (0094): RLS menyala, tanpa policy,
--    tak masuk publikasi realtime, akses hanya lewat RPC di bawah.
--
--    TANPA foreign key ke services, dengan sengaja: restore_org_data menghapus
--    lalu menyisipkan ulang services dengan id yang sama. Dengan cascade, kode
--    yang sudah tercetak di kertas pelanggan akan mati sesudah restore.
--
--    Baris dibuat MALAS (saat tiket pertama kali dibuka atau dicetak), jadi
--    migrasi ini tidak menyentuh satu baris pun di services, tidak mengunci
--    tabel itu, dan tidak memicu realtime. Tiket lama mendapat kode saat dibuka.
--
-- B. RPC anggota (authenticated): service_tracking_meta (ambil-atau-buat) dan
--    mark_service_printed (cap waktu dari server, bukan jam perangkat).
--
-- C. RPC publik (anon): track_service_by_code.
--    - Masukan dinormalkan: huruf besar, spasi dan tanda hubung dibuang,
--      I/L dibaca 1 dan O dibaca 0 (salah baca yang lazim pada kertas termal).
--    - Batas 30 per menit per IP, dicek SEBELUM pencarian dan tidak bergantung
--      pada ada-tidaknya kode. Terkena batas dibalas HTTP 429 (SQLSTATE PT429),
--      berbeda dari "tidak ditemukan", supaya pelanggan asli tahu cukup
--      menunggu. Kode salah format dan kode tak terdaftar dibalas sama: nol baris.
--    - IP diambil dari header permintaan; kunci di-hash ke 4096 ember supaya
--      header palsu tak bisa menumbuhkan rate_events tanpa batas. Tanpa header
--      IP (panggilan server), batas dilewati: pengaman utamanya adalah ruang
--      kode 2^50, bukan pembatas laju.
--    track_service lama (org + nomor) TETAP hidup untuk nota yang sudah beredar.
--
-- Aman diterapkan sebelum maupun sesudah frontend baru: frontend lama tidak
-- memanggil apa pun di sini, dan frontend baru jatuh ke alamat lama bila RPC
-- ini belum ada. Idempoten.
-- ============================================================

-- ---------- A ----------
create table if not exists service_tracking (
  service_id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  track_code text not null unique
    check (track_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  print_count integer not null default 0 check (print_count >= 0),
  last_printed_at timestamptz,
  last_printed_kind text
    check (last_printed_kind is null or last_printed_kind in ('intake', 'service', 'handover')),
  created_at timestamptz not null default now()
);
create index if not exists service_tracking_org_idx on service_tracking (org_id);
alter table service_tracking enable row level security;
revoke all on table service_tracking from anon, authenticated;

-- 10 simbol x 5 bit dari UUID v4 (pg_strong_random). Byte 6 dan 8 memuat bit
-- versi/varian, jadi hanya byte yang acak penuh yang dipakai.
create or replace function gen_track_code()
returns text
language plpgsql volatile
set search_path = public, pg_temp
as $$
declare
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
  v_i int;
begin
  foreach v_i in array array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12] loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_i) & 31) + 1, 1);
  end loop;
  return v_code;
end;
$$;
revoke all on function gen_track_code() from public, anon, authenticated;

-- Pembantu INTERNAL: ambil baris, atau buat dengan kode baru. Tidak memeriksa
-- pemanggil, jadi hanya boleh dipanggil fungsi definer yang sudah memeriksanya.
create or replace function service_tracking_ensure(p_org_id uuid, p_service_id uuid)
returns service_tracking
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_row service_tracking%rowtype;
  v_try int := 0;
begin
  select * into v_row from service_tracking where service_id = p_service_id;
  if found then
    return v_row;
  end if;
  loop
    begin
      insert into service_tracking (service_id, org_id, track_code)
        values (p_service_id, p_org_id, gen_track_code())
      on conflict (service_id) do nothing
      returning * into v_row;
      if not found then
        -- Dibuat bersamaan oleh panggilan lain: pakai milik mereka.
        select * into v_row from service_tracking where service_id = p_service_id;
      end if;
      return v_row;
    exception when unique_violation then
      -- Tabrakan track_code (peluangnya n / 2^50). Coba kode lain.
      v_try := v_try + 1;
      if v_try >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;
revoke all on function service_tracking_ensure(uuid, uuid) from public, anon, authenticated;

-- ---------- B ----------
create or replace function service_tracking_meta(p_org_id uuid, p_service_id uuid)
returns table (
  track_code text,
  print_count integer,
  last_printed_at timestamptz,
  last_printed_kind text
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_row service_tracking%rowtype;
begin
  if not is_org_member(p_org_id) then
    raise exception 'Forbidden';
  end if;
  perform 1 from services
    where id = p_service_id and org_id = p_org_id and deleted_at is null;
  if not found then
    raise exception 'Service not found';
  end if;
  v_row := service_tracking_ensure(p_org_id, p_service_id);
  return query
    select v_row.track_code, v_row.print_count, v_row.last_printed_at, v_row.last_printed_kind;
end;
$$;
revoke all on function service_tracking_meta(uuid, uuid) from public, anon;
grant execute on function service_tracking_meta(uuid, uuid) to authenticated;

-- Dicatat sesudah jendela cetak terbuka. Dialog yang dibatalkan tetap
-- terhitung: lebih aman menandai salinan berlebih daripada membiarkan dua
-- kertas "asli" beredar.
create or replace function mark_service_printed(
  p_org_id uuid,
  p_service_id uuid,
  p_kind text
)
returns table (
  track_code text,
  print_count integer,
  last_printed_at timestamptz,
  last_printed_kind text
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_row service_tracking%rowtype;
begin
  if not is_org_member(p_org_id) then
    raise exception 'Forbidden';
  end if;
  if p_kind is null or p_kind not in ('intake', 'service', 'handover') then
    raise exception 'Jenis dokumen tidak valid';
  end if;
  perform 1 from services
    where id = p_service_id and org_id = p_org_id and deleted_at is null;
  if not found then
    raise exception 'Service not found';
  end if;
  perform service_tracking_ensure(p_org_id, p_service_id);
  update service_tracking st
     set print_count = st.print_count + 1,
         last_printed_at = now(),
         last_printed_kind = p_kind
   where st.service_id = p_service_id
  returning st.* into v_row;
  return query
    select v_row.track_code, v_row.print_count, v_row.last_printed_at, v_row.last_printed_kind;
end;
$$;
revoke all on function mark_service_printed(uuid, uuid, text) from public, anon;
grant execute on function mark_service_printed(uuid, uuid, text) to authenticated;

-- ---------- C ----------
create or replace function track_service_by_code(p_code text)
returns table (
  service_no text,
  device text,
  category text,
  status service_status,
  org_name text,
  org_phone text,
  org_address text,
  org_logo_url text,
  org_public_note text,
  warranty_service_until date,
  warranty_parts_until date,
  part_warranties jsonb,
  picked_up boolean,
  public_history jsonb
)
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_code text := translate(
    upper(regexp_replace(coalesce(p_code, ''), '[[:space:]-]', '', 'g')),
    'ILO',
    '110'
  );
  v_headers json;
  v_ip text;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(btrim(coalesce(
    v_headers ->> 'cf-connecting-ip',
    split_part(v_headers ->> 'x-forwarded-for', ',', 1)
  )), '');
  if v_ip is not null
     and not check_rate_limit('trackcode:' || (hashtext(v_ip) & 4095)::text, 30, 60) then
    raise exception 'rate_limited'
      using errcode = 'PT429',
            hint = 'Terlalu banyak permintaan lacak dari jaringan ini. Coba lagi dalam satu menit.';
  end if;

  if v_code !~ '^[0-9A-HJKMNP-TV-Z]{10}$' then
    return;
  end if;

  return query
  select
    s.service_no,
    s.device,
    s.category,
    s.status,
    o.name as org_name,
    o.phone as org_phone,
    o.address as org_address,
    o.logo_data_url as org_logo_url,
    (o.settings ->> 'publicNote') as org_public_note,
    s.warranty_service_until,
    s.warranty_parts_until,
    coalesce(
      (select jsonb_agg(jsonb_build_object('name', sp->>'name', 'until', sp->>'warrantyUntil'))
       from jsonb_array_elements(
         case when jsonb_typeof(s.spareparts) = 'array' then s.spareparts else '[]'::jsonb end
       ) sp
       where sp ? 'warrantyDays'),
      '[]'::jsonb
    ) as part_warranties,
    s.picked_up,
    coalesce(
      (select jsonb_agg(h) from jsonb_array_elements(s.history) h
       where coalesce((h->>'internal')::boolean, false) = false),
      '[]'::jsonb
    ) as public_history
  from service_tracking st
  join services s on s.id = st.service_id and s.org_id = st.org_id
  join organizations o on o.id = s.org_id
  where st.track_code = v_code
    and s.deleted_at is null
  limit 1;
end;
$$;
revoke all on function track_service_by_code(text) from public;
grant execute on function track_service_by_code(text) to anon, authenticated;
