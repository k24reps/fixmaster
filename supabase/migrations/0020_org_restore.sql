-- ============================================================
-- FixMaster — 0020: Restore data org (aman, transaksional, demo-only)
-- Tujuan: mengisi ulang akun DEMO dengan data dummy dari file backup,
-- tanpa membahayakan tenant lain / langganan / akun login.
--
-- Pengaman berlapis:
--   1) security definer + is_org_owner(p_org_id) → hanya OWNER org itu.
--   2) Gate is_demo = true → org pelanggan ASLI mustahil ke-wipe.
--   3) org_id tiap baris DIPAKSA = p_org_id (abaikan org_id dalam file)
--      → file yang dimanipulasi tak bisa menyentuh org lain.
--   4) memberships / organizations / billing TIDAK disentuh
--      → enterprise plan & akun login demo aman walau di-restore berkali2.
--   5) FK ke memberships (teknisi/kasir/karyawan/aktor/assignee) di-NULL
--      saat insert (nama tetap tampil lewat kolom *_name denormalized).
--   6) Satu transaksi (fungsi plpgsql) → atomik; gagal di tengah = rollback
--      penuh, tak ada keadaan "data separuh terhapus".
--
-- Expand-only, idempotent. Diuji di staging dulu.
-- ============================================================

-- 1) Penanda akun demo. Default false → semua org existing aman by default.
alter table organizations
  add column if not exists is_demo boolean not null default false;

-- 2) RPC restore. Payload = jsonb objek { "<table>": [ {row}, ... ], ... }
--    dengan KEY kolom snake_case (klien mengonversi via toRow sebelum kirim).
create or replace function restore_org_data(p_org_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total int := 0;
  v_n int;
begin
  -- Pengaman 1: harus owner org target.
  if not is_org_owner(p_org_id) then
    raise exception 'Forbidden: hanya owner yang boleh memulihkan data';
  end if;

  -- Pengaman 2: hanya akun demo.
  if not exists (select 1 from organizations where id = p_org_id and is_demo) then
    raise exception 'Restore hanya tersedia untuk akun demo';
  end if;

  -- ---- HAPUS data org (urutan FK: anak → induk) ----
  delete from task_instances  where org_id = p_org_id;
  delete from task_templates  where org_id = p_org_id;
  delete from attendance      where org_id = p_org_id;
  delete from activity_logs   where org_id = p_org_id;
  delete from incomes         where org_id = p_org_id;
  delete from expenses        where org_id = p_org_id;
  delete from sales           where org_id = p_org_id;
  delete from purchase_orders where org_id = p_org_id;
  delete from services        where org_id = p_org_id;
  delete from inventory_items where org_id = p_org_id;
  delete from fixed_costs     where org_id = p_org_id;
  delete from wallets         where org_id = p_org_id;
  delete from customers       where org_id = p_org_id;
  delete from suppliers       where org_id = p_org_id;
  delete from outlets         where org_id = p_org_id;
  -- memberships / organizations / invoices SENGAJA tidak disentuh.

  -- ---- INSERT dari payload (urutan FK: induk → anak) ----
  -- Pola: merge override jsonb agar org_id dipaksa & FK membership di-null,
  -- lalu jsonb_populate_record memetakan key→kolom (key asing diabaikan).

  insert into outlets
  select (jsonb_populate_record(null::outlets,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'outlets','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into suppliers
  select (jsonb_populate_record(null::suppliers,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'suppliers','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into customers
  select (jsonb_populate_record(null::customers,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'customers','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into wallets
  select (jsonb_populate_record(null::wallets,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'wallets','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into inventory_items
  select (jsonb_populate_record(null::inventory_items,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'inventory_items','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into fixed_costs
  select (jsonb_populate_record(null::fixed_costs,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'fixed_costs','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into services
  select (jsonb_populate_record(null::services,
    e || jsonb_build_object('org_id', p_org_id, 'technician_id', null))).*
  from jsonb_array_elements(coalesce(p_payload->'services','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into purchase_orders
  select (jsonb_populate_record(null::purchase_orders,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'purchase_orders','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into sales
  select (jsonb_populate_record(null::sales,
    e || jsonb_build_object('org_id', p_org_id, 'cashier_id', null))).*
  from jsonb_array_elements(coalesce(p_payload->'sales','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into incomes
  select (jsonb_populate_record(null::incomes,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'incomes','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into expenses
  select (jsonb_populate_record(null::expenses,
    e || jsonb_build_object('org_id', p_org_id))).*
  from jsonb_array_elements(coalesce(p_payload->'expenses','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into attendance
  select (jsonb_populate_record(null::attendance,
    e || jsonb_build_object('org_id', p_org_id, 'employee_id', null))).*
  from jsonb_array_elements(coalesce(p_payload->'attendance','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into activity_logs
  select (jsonb_populate_record(null::activity_logs,
    e || jsonb_build_object('org_id', p_org_id, 'actor_id', null))).*
  from jsonb_array_elements(coalesce(p_payload->'activity_logs','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into task_templates
  select (jsonb_populate_record(null::task_templates,
    e || jsonb_build_object('org_id', p_org_id, 'assignee_employee_id', null))).*
  from jsonb_array_elements(coalesce(p_payload->'task_templates','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  insert into task_instances
  select (jsonb_populate_record(null::task_instances,
    e || jsonb_build_object('org_id', p_org_id, 'completed_by_id', null))).*
  from jsonb_array_elements(coalesce(p_payload->'task_instances','[]'::jsonb)) e;
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return jsonb_build_object('ok', true, 'restored', v_total);
end;
$$;

-- Hak akses: hanya pengguna terautentikasi (RLS owner-check di dalam fungsi).
revoke all on function restore_org_data(uuid, jsonb) from public;
grant execute on function restore_org_data(uuid, jsonb) to authenticated;
