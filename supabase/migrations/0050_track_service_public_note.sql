-- ============================================================
-- 0050_track_service_public_note.sql
-- Tambahkan catatan publik toko (organizations.settings->>'publicNote') ke
-- RPC `track_service`, supaya halaman lacak menampilkan teks yang ditulis
-- pemilik toko sendiri — jam operasional, syarat garansi, aturan pengambilan.
--
-- Menyimpan catatannya memang tidak perlu migrasi (kolom `settings` sudah
-- jsonb sejak 0032), tapi MENAMPILKANNYA ke pengunjung anonim perlu: RPC ini
-- security-definer dan hanya mengembalikan kolom yang disebut eksplisit.
--
-- Model keamanan tidak berubah dari 0015/0035: security definer, grant ke
-- anon, batas laju per org, dan penyaringan history internal yang sama.
-- Catatan ini memang ditujukan untuk dibaca publik, jadi tidak menambah
-- permukaan data sensitif. Harga tetap TIDAK pernah diekspos.
-- ============================================================

-- Return type berubah (satu kolom baru), dan Postgres menolak CREATE OR
-- REPLACE untuk itu (SQLSTATE 42P13) — jadi drop dulu, lalu buat ulang.
-- Grant ke anon/authenticated dipulihkan di akhir berkas ini.
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
    -- ->> mengembalikan null kalau kuncinya tidak ada; klien menormalkannya
    -- jadi string kosong dan tidak merender bloknya sama sekali.
    (o.settings ->> 'publicNote') as org_public_note,
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
