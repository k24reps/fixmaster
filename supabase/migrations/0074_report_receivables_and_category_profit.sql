-- ============================================================
-- FixMaster — 0074: laporan yang membaca himpunan yang benar
--
--  #3  Piutang dihitung dari tiket yang DIBUAT dalam periode, sehingga tiket
--      tiga bulan lalu yang belum lunas tidak pernah muncul — kolom umur
--      "31+ hari" nyaris selalu kosong, justru kebalikan dari guna laporan
--      umur piutang. Piutang bukan besaran periode: ia keadaan SEKARANG.
--
--  #6  Laba per kategori perangkat memakai tanggal tiket MASUK, sedangkan
--      Performa Teknisi di halaman yang sama memakai tanggal SELESAI (0063).
--      Dua kartu bertetangga dengan definisi periode berbeda. Dihitung ulang
--      di server memakai definisi yang sama dengan leaderboard.
--
-- Keduanya butuh SELURUH tabel servis, bukan jendela yang dimuat halaman —
-- karena itu dikerjakan di sini, bukan di browser.
-- ============================================================

-- ---------- #3 piutang: servis selesai yang masih ada sisa ----------
create or replace function service_receivables(
  p_org_id uuid,
  p_outlet_id uuid default null
) returns table (
  service_id uuid,
  service_no text,
  customer_name text,
  outstanding numeric,
  since date
)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.service_no,
    coalesce(s.customer_name, ''),
    coalesce(s.final_cost, 0) - coalesce(s.down_payment, 0),
    -- Umur dihitung dari tanggal SELESAI; tiket lama tanpa riwayat memakai
    -- tanggal masuk, sama seperti perhitungan di aplikasi.
    coalesce(
      (select min((h->>'at')::timestamptz)
         from jsonb_array_elements(
           case when jsonb_typeof(s.history) = 'array' then s.history else '[]'::jsonb end
         ) h
        where h->>'status' = 'selesai'),
      s.created_at
    ) at time zone 'Asia/Jakarta'
  from services s
  where s.org_id = p_org_id
    and s.deleted_at is null
    and s.status = 'selesai'
    and coalesce(s.final_cost, 0) - coalesce(s.down_payment, 0) > 0
    and (p_outlet_id is null or s.outlet_id = p_outlet_id or s.outlet_id is null)
  order by 5 asc;
$$;

grant execute on function service_receivables(uuid, uuid) to authenticated;

-- ---------- #6 laba per kategori, menurut tanggal SELESAI ----------
create or replace function category_profit(
  p_org_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_outlet_id uuid default null
) returns table (
  category text,
  units bigint,
  revenue numeric,
  profit numeric
)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  with done as (
    select
      coalesce(nullif(trim(s.category), ''), 'Lainnya') as category,
      coalesce(s.final_cost, 0) as final_cost,
      -- Modal tiket = seluruh baris biaya (sparepart inventori + biaya
      -- dadakan), cermin serviceProfit() di aplikasi.
      coalesce((
        select sum(coalesce((sp->>'qty')::numeric, 0) * coalesce((sp->>'costPrice')::numeric, 0))
        from jsonb_array_elements(
          case when jsonb_typeof(s.spareparts) = 'array' then s.spareparts else '[]'::jsonb end
        ) sp
      ), 0) as cost,
      coalesce(
        (select min((h->>'at')::timestamptz)
           from jsonb_array_elements(
             case when jsonb_typeof(s.history) = 'array' then s.history else '[]'::jsonb end
           ) h
          where h->>'status' in ('selesai', 'lunas')),
        s.updated_at
      ) as done_at
    from services s
    where s.org_id = p_org_id
      and s.deleted_at is null
      and s.status in ('selesai', 'lunas')
      and (p_outlet_id is null or s.outlet_id = p_outlet_id or s.outlet_id is null)
      -- Riwayat hanya bertambah lewat update: tiket yang tak tersentuh sejak
      -- sebelum rentang pasti selesai sebelum rentang (pola sama dgn 0063).
      and s.updated_at >= p_from
  )
  select category, count(*), sum(final_cost), sum(final_cost - cost)
  from done
  where done_at >= p_from and done_at < p_to
  group by category
  order by 4 desc;
$$;

grant execute on function category_profit(uuid, timestamptz, timestamptz, uuid) to authenticated;
