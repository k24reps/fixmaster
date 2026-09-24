-- Baris terakhir yang berubah per tabel. Dijalankan di PRODUKSI (cloud) dan di server.
-- Dump yang dipakai server dibuat 2026-09-23 20:01:37 WIB (13:01:37 UTC).
select c.table_name as tabel,
       (xpath('/row/m/text()', query_to_xml(format('select max(%I) as m from public.%I', c.column_name, c.table_name), false, true, '')))[1]::text as terakhir_berubah
from information_schema.columns c
where c.table_schema = 'public' and c.column_name = 'updated_at'
order by 2 desc nulls last
limit 8;
