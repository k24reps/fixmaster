-- 0098 — Bayar Gaji + kasbon per karyawan (29 Sep 2026).
--
-- Gaji yang dipotong kasbon dulu dua catatan manual (Gaji penuh + Pemasukan
-- Pelunasan Kasbon) dan sisa kasbon tiap karyawan dihitung sendiri dari
-- keterangan. Kini catatan kasbon/gaji terhubung ke karyawan (employee_id =
-- memberships.id; di mode lokal = employees.id), sisa kasbon dihitung server,
-- dan "Bayar Gaji" menulis gaji penuh + potongan kasbon + saldo dalam satu
-- transaksi.

-- ---------- Kolom karyawan ----------
alter table incomes add column if not exists employee_id uuid references memberships(id) on delete set null;
alter table expenses add column if not exists employee_id uuid references memberships(id) on delete set null;
create index if not exists idx_incomes_employee on incomes(org_id, employee_id) where employee_id is not null;
create index if not exists idx_expenses_employee on expenses(org_id, employee_id) where employee_id is not null;

-- ---------- record_finance_entry: + p_employee_id ----------
drop function if exists record_finance_entry(uuid, text, date, text, numeric, uuid, text, uuid);

create or replace function record_finance_entry(
  p_org_id uuid,
  p_kind text,
  p_date date,
  p_category text,
  p_amount numeric,
  p_wallet_id uuid,
  p_description text default '',
  p_outlet_id uuid default null,
  p_employee_id uuid default null
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_id uuid;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  perform 1 from wallets where id = p_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;
  if p_employee_id is not null then
    perform 1 from memberships where id = p_employee_id and org_id = p_org_id;
    if not found then raise exception 'Karyawan tidak ditemukan'; end if;
  end if;
  perform assert_entry_date(coalesce(p_date, current_date));
  -- Pelunasan tiket & penjualan Kasir sudah mencatat pemasukannya sendiri;
  -- kategori ini dari Keuangan = dihitung dua kali.
  if p_kind = 'income' and p_category in ('Servis', 'Penjualan') then
    raise exception 'Pemasukan Servis dan Penjualan tercatat otomatis dari tiket dan Kasir — pilih kategori lain';
  end if;

  if p_kind = 'income' then
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id, employee_id)
    values (p_org_id, p_outlet_id, coalesce(p_date, current_date), p_category, p_amount,
            p_wallet_id, coalesce(p_description, ''), null, p_employee_id)
    returning id into v_id;
    update wallets set balance = balance + p_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
  elsif p_kind = 'expense' then
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description, employee_id)
    values (p_org_id, p_outlet_id, coalesce(p_date, current_date), p_category, p_amount,
            p_wallet_id, coalesce(p_description, ''), p_employee_id)
    returning id into v_id;
    update wallets set balance = balance - p_amount, updated_at = now()
      where id = p_wallet_id and org_id = p_org_id;
  else
    raise exception 'Jenis transaksi tidak valid';
  end if;

  return v_id;
end;
$$;
revoke all on function record_finance_entry(uuid, text, date, text, numeric, uuid, text, uuid, uuid) from public, anon;
grant execute on function record_finance_entry(uuid, text, date, text, numeric, uuid, text, uuid, uuid) to authenticated;

-- ---------- Ringkasan gaji & kasbon per karyawan ----------
create or replace function payroll_overview(p_org_id uuid)
returns table (employee_id uuid, advance_outstanding numeric, last_salary numeric)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  return query
  with adv as (
    select e.employee_id, sum(e.amount) as amt from expenses e
     where e.org_id = p_org_id and e.employee_id is not null and e.deleted_at is null
       and e.category = 'Kasbon Karyawan'
     group by 1
  ), paid as (
    select i.employee_id, sum(i.amount) as amt from incomes i
     where i.org_id = p_org_id and i.employee_id is not null and i.deleted_at is null
       and i.category = 'Pelunasan Kasbon'
     group by 1
  ), sal as (
    select distinct on (e.employee_id) e.employee_id, e.amount from expenses e
     where e.org_id = p_org_id and e.employee_id is not null and e.deleted_at is null
       and e.category = 'Gaji'
     order by e.employee_id, e.date desc, e.created_at desc
  )
  select m.id,
         greatest(0, coalesce(adv.amt, 0) - coalesce(paid.amt, 0)),
         sal.amount
    from memberships m
    left join adv on adv.employee_id = m.id
    left join paid on paid.employee_id = m.id
    left join sal on sal.employee_id = m.id
   where m.org_id = p_org_id;
end;
$$;
revoke all on function payroll_overview(uuid) from public, anon;
grant execute on function payroll_overview(uuid) to authenticated;

-- ---------- Bayar Gaji ----------
create or replace function pay_salary(
  p_org_id uuid,
  p_employee_id uuid,
  p_gross numeric,
  p_advance_deduction numeric,
  p_wallet_id uuid,
  p_outlet_id uuid default null,
  p_date date default null,
  p_description text default ''
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_name text;
  v_deduct numeric := coalesce(p_advance_deduction, 0);
  v_outstanding numeric;
  v_date date := coalesce(p_date, current_date);
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if coalesce(p_gross, 0) <= 0 then raise exception 'Gaji harus lebih dari 0'; end if;
  if v_deduct < 0 then raise exception 'Potongan kasbon tidak boleh negatif'; end if;
  if v_deduct > p_gross then raise exception 'Potongan kasbon melebihi gaji'; end if;
  perform assert_entry_date(v_date);

  select name into v_name from memberships where id = p_employee_id and org_id = p_org_id;
  if v_name is null then raise exception 'Karyawan tidak ditemukan'; end if;
  perform 1 from wallets where id = p_wallet_id and org_id = p_org_id for update;
  if not found then raise exception 'Wallet tidak ditemukan'; end if;

  if v_deduct > 0 then
    select coalesce(sum(amount) filter (where src = 'adv'), 0) - coalesce(sum(amount) filter (where src = 'paid'), 0)
      into v_outstanding
      from (
        select 'adv' as src, amount from expenses
         where org_id = p_org_id and employee_id = p_employee_id and deleted_at is null and category = 'Kasbon Karyawan'
        union all
        select 'paid', amount from incomes
         where org_id = p_org_id and employee_id = p_employee_id and deleted_at is null and category = 'Pelunasan Kasbon'
      ) t;
    if v_deduct > v_outstanding then
      raise exception 'Potongan melebihi sisa kasbon % (sisa %)', v_name, v_outstanding;
    end if;
  end if;

  -- Gaji penuh = beban (overhead); potongan kasbon = pelunasan piutang (bukan omzet).
  insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description, employee_id)
  values (p_org_id, p_outlet_id, v_date, 'Gaji', p_gross, p_wallet_id,
          coalesce(nullif(trim(p_description), ''), 'Gaji ' || v_name), p_employee_id);
  if v_deduct > 0 then
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id, employee_id)
    values (p_org_id, p_outlet_id, v_date, 'Pelunasan Kasbon', v_deduct, p_wallet_id,
            'Potong kasbon ' || v_name || ' (gaji)', null, p_employee_id);
  end if;
  update wallets set balance = balance - (p_gross - v_deduct), updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;
end;
$$;
revoke all on function pay_salary(uuid, uuid, numeric, numeric, uuid, uuid, date, text) from public, anon;
grant execute on function pay_salary(uuid, uuid, numeric, numeric, uuid, uuid, date, text) to authenticated;
