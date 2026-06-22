-- ============================================================
-- 0035_track_service_contact.sql
-- Enrich the PUBLIC `track_service` RPC so the customer-facing tracking
-- page can show: (a) store contact details (phone, address, logo) so the
-- customer knows who to reach, and (b) warranty validity for the finished
-- job. Keeps the same security model as 0015 (security definer, anon grant,
-- per-org rate limit) and the SAME internal-history filtering.
--
-- DELIBERATELY OMITTED: cost/estimate/down-payment fields. Per product
-- decision, the public link must never expose pricing — only status,
-- identity, store contact, and warranty.
-- ============================================================

-- Postgres tak mengizinkan CREATE OR REPLACE mengubah tipe return fungsi yang
-- sudah ada (SQLSTATE 42P13). track_service sudah ada sejak 0015 dengan kolom
-- return berbeda, jadi drop dulu lalu buat ulang. Signature argumen tetap sama,
-- dan grant ke anon/authenticated di-restore di akhir migrasi ini.
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
  warranty_service_until date,
  warranty_parts_until date,
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
    s.warranty_service_until,
    s.warranty_parts_until,
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
