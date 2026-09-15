-- ============================================================
-- 0060_track_service_part_warranties.sql
-- Garansi per sparepart di halaman lacak publik.
--
-- Garansi kini ditetapkan per part saat tiket Selesai dan disimpan di JSONB
-- `services.spareparts` (warrantyDays, warrantyUntil) — tanpa kolom baru. RPC
-- `track_service` mengembalikan `part_warranties`: HANYA nama part dan tanggal
-- akhir garansinya (null = tanpa garansi). Harga modal/jual TIDAK ikut, sama
-- seperti model keamanan 0015/0035/0050. Part yang belum pernah diatur
-- garansinya (tanpa kunci warrantyDays) dilewati.
--
-- Return type berubah (satu kolom baru), jadi drop lalu buat ulang; grant ke
-- anon/authenticated dipulihkan di akhir berkas ini.
-- ============================================================

drop function if exists track_service(uuid, text);

create or replace function track_service(p_org_id uuid, p_service_no text)
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
language plpgsql security definer as $$
begin
  if not check_rate_limit('track:' || p_org_id::text, 60, 60) then
    return; -- over the limit → return no rows (graceful, no error leak)
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
  from services s
  join organizations o on o.id = s.org_id
  where s.org_id = p_org_id
    and lower(s.service_no) = lower(p_service_no)
  limit 1;
end;
$$;

grant execute on function track_service(uuid, text) to anon, authenticated;
