-- 0099 — Hubungkan catatan lama ke karyawan (6 Okt 2026).
--
-- 0098 menambah employee_id, tapi kasbon/gaji yang dicatat sebelumnya tidak
-- punya karyawan, dan catatan bulan lalu terkunci (0071) — satu-satunya jalan
-- adalah mencatat ulang lalu menghapus. Menautkan karyawan tidak mengubah uang
-- (nominal, tanggal, wallet, kategori tetap), jadi diizinkan juga untuk bulan
-- yang terkunci: laporan bulan itu tidak berubah, hanya sisa kasbon per orang
-- yang kini terhitung benar.

create or replace function set_finance_entry_employee(
  p_org_id uuid,
  p_kind text,
  p_id uuid,
  p_employee_id uuid
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_category text;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if p_employee_id is not null then
    perform 1 from memberships where id = p_employee_id and org_id = p_org_id;
    if not found then raise exception 'Karyawan tidak ditemukan'; end if;
  end if;

  if p_kind = 'expense' then
    select category into v_category from expenses where id = p_id and org_id = p_org_id;
  elsif p_kind = 'income' then
    select category into v_category from incomes where id = p_id and org_id = p_org_id;
  else
    raise exception 'Jenis transaksi tidak valid';
  end if;
  if v_category is null then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_category not in ('Gaji', 'Kasbon Karyawan', 'Pelunasan Kasbon') then
    raise exception 'Hanya Gaji, Kasbon Karyawan, dan Pelunasan Kasbon yang bisa dihubungkan ke karyawan';
  end if;

  if p_kind = 'expense' then
    update expenses set employee_id = p_employee_id, updated_at = now()
      where id = p_id and org_id = p_org_id;
  else
    update incomes set employee_id = p_employee_id, updated_at = now()
      where id = p_id and org_id = p_org_id;
  end if;
end;
$$;
revoke all on function set_finance_entry_employee(uuid, text, uuid, uuid) from public, anon;
grant execute on function set_finance_entry_employee(uuid, text, uuid, uuid) to authenticated;
