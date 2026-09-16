-- ============================================================
-- FixMaster — 0077: kuota paket & jejak pemulihan
--
--  #1  Kuota paket (pengguna, outlet, wallet) hanya dicek di layar. Undangan,
--      outlet, dan wallet lewat REST langsung tidak dibatasi apa pun — padahal
--      kuota itulah satu-satunya sumbu pembeda harga produk ini. Migrasi 0039
--      sudah mencatat utang ini; di sini dibayar.
--  #4  restore_org_data ikut menghapus SELURUH log aktivitas, lalu pemulihannya
--      sendiri tak tercatat di mana pun — jejaknya lenyap bersama buktinya.
--      Sekarang log dipertahankan, dan pemulihan mencatat dirinya sendiri.
--  #6  Wallet tidak boleh hilang saat masih memegang saldo atau masih dipakai
--      baris kas — saldonya akan menguap tanpa penjelasan.
--  #7  Outlet tidak boleh hilang saat masih dipakai transaksi, absensi, wallet,
--      atau penugasan anggota.
-- ============================================================

-- ---------- #1 kuota per paket ----------
-- Cermin src/config/plans.ts. Sengaja diduplikasi di sini: harga dan gerbang
-- paket tidak boleh hanya hidup di browser, dan kolom max_users/max_outlets di
-- tabel organizations tidak pernah dipelihara saat paket berubah (0001).
-- -1 = tanpa batas.
create or replace function plan_quota(p_plan plan_type)
returns table (max_users int, max_outlets int, max_wallets int)
language sql immutable
set search_path = public, pg_temp
as $$
  select q.max_users, q.max_outlets, q.max_wallets from (values
    ('standard'::plan_type,   1,   1,  2),
    ('enterprise'::plan_type, -1, -1, 99),
    ('trial'::plan_type,      -1, 10, 99),
    ('suspended'::plan_type,   0,  0,  0),
    -- 'free' adalah nilai enum warisan yang tidak pernah diberikan ke toko mana
    -- pun; diperlakukan selonggar trial supaya data lama tak ikut terkunci.
    ('free'::plan_type,       -1, 10, 99)
  ) q(plan, max_users, max_outlets, max_wallets)
  where q.plan = p_plan;
$$;

create or replace function outlets_enforce_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_max int;
  v_count int;
  v_plan plan_type;
begin
  -- Fungsi server (security definer) — pemulihan data, skrip operator —
  -- memakai peran pemilik fungsi dan tidak ikut dibatasi: memulihkan backup
  -- toko lima cabang tidak boleh gagal karena gerbang harga.
  if current_user <> 'authenticated' then return new; end if;

  select plan_type into v_plan from organizations where id = new.org_id;
  select max_outlets into v_max from plan_quota(coalesce(v_plan, 'trial'));
  if v_max is null or v_max < 0 then return new; end if;

  select count(*) into v_count from outlets
    where org_id = new.org_id and deleted_at is null;
  if v_count + 1 > v_max then
    raise exception 'Paket ini dibatasi % outlet. Naik paket untuk menambah cabang.', v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists outlets_enforce_quota on outlets;
create trigger outlets_enforce_quota
  before insert on outlets
  for each row execute function outlets_enforce_quota();

create or replace function wallets_enforce_quota()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_max int;
  v_count int;
  v_plan plan_type;
begin
  if current_user <> 'authenticated' then return new; end if;

  select plan_type into v_plan from organizations where id = new.org_id;
  select max_wallets into v_max from plan_quota(coalesce(v_plan, 'trial'));
  if v_max is null or v_max < 0 then return new; end if;

  select count(*) into v_count from wallets
    where org_id = new.org_id and deleted_at is null;
  if v_count + 1 > v_max then
    raise exception 'Paket ini dibatasi % wallet. Naik paket untuk menambah kas.', v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists wallets_enforce_quota on wallets;
create trigger wallets_enforce_quota
  before insert on wallets
  for each row execute function wallets_enforce_quota();

-- Kursi: anggota AKTIF + undangan yang belum diklaim. Tanpa penjagaan
-- current_user, karena create_invite adalah security definer — justru jalur
-- itulah yang harus ikut dibatasi.
create or replace function invites_enforce_seats()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_max int;
  v_seats int;
  v_plan plan_type;
begin
  select plan_type into v_plan from organizations where id = new.org_id;
  select max_users into v_max from plan_quota(coalesce(v_plan, 'trial'));
  if v_max is null or v_max < 0 then return new; end if;

  select
    (select count(*) from memberships
      where org_id = new.org_id and active = true and deleted_at is null)
    + (select count(*) from pending_invites
        where org_id = new.org_id and claimed_at is null
          and lower(email) <> lower(new.email))
    into v_seats;

  if v_seats + 1 > v_max then
    raise exception 'Paket ini hanya untuk % pengguna. Naik paket untuk menambah anggota tim.', v_max;
  end if;
  return new;
end;
$$;

drop trigger if exists invites_enforce_seats on pending_invites;
create trigger invites_enforce_seats
  before insert on pending_invites
  for each row execute function invites_enforce_seats();

-- ---------- #6 wallet tidak hilang membawa saldo ----------
create or replace function wallets_block_delete_in_use()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows int;
begin
  if current_user <> 'authenticated' then return old; end if;

  if coalesce(old.balance, 0) <> 0 then
    raise exception 'Wallet "%" masih memegang saldo. Pindahkan saldonya dulu lewat transfer.', old.name;
  end if;

  select (select count(*) from incomes  where wallet_id = old.id)
       + (select count(*) from expenses where wallet_id = old.id)
    into v_rows;
  if v_rows > 0 then
    raise exception 'Wallet "%" dipakai % baris kas — riwayatnya akan kehilangan asal uangnya.', old.name, v_rows;
  end if;
  return old;
end;
$$;

drop trigger if exists wallets_block_delete_in_use on wallets;
create trigger wallets_block_delete_in_use
  before delete on wallets
  for each row execute function wallets_block_delete_in_use();

-- ---------- #7 outlet tidak hilang saat masih dipakai ----------
create or replace function outlets_block_delete_in_use()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_rows int;
begin
  if current_user <> 'authenticated' then return old; end if;

  if coalesce(old.is_primary, false) then
    raise exception 'Outlet utama tidak bisa dihapus. Tetapkan cabang lain sebagai utama dulu.';
  end if;

  select (select count(*) from services        where outlet_id = old.id)
       + (select count(*) from sales           where outlet_id = old.id)
       + (select count(*) from incomes         where outlet_id = old.id)
       + (select count(*) from expenses        where outlet_id = old.id)
       + (select count(*) from attendance      where outlet_id = old.id)
       + (select count(*) from purchase_orders where outlet_id = old.id)
       + (select count(*) from wallets         where outlet_id = old.id)
       + (select count(*) from membership_outlets where outlet_id = old.id)
    into v_rows;
  if v_rows > 0 then
    raise exception 'Cabang "%" masih dipakai % data (transaksi, absensi, kas, atau penugasan anggota).', old.name, v_rows;
  end if;
  return old;
end;
$$;

drop trigger if exists outlets_block_delete_in_use on outlets;
create trigger outlets_block_delete_in_use
  before delete on outlets
  for each row execute function outlets_block_delete_in_use();

-- ---------- #4 pemulihan tidak menghapus jejak audit ----------
-- Sama dengan 0020, dengan dua perubahan: activity_logs TIDAK ikut dihapus,
-- dan pemulihannya sendiri dicatat. Jejak audit yang bisa dihapus oleh orang
-- yang diawasinya bukan jejak audit.
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
  if not is_org_owner(p_org_id) then
    raise exception 'Forbidden: hanya owner yang boleh memulihkan data';
  end if;

  delete from task_instances  where org_id = p_org_id;
  delete from task_templates  where org_id = p_org_id;
  delete from attendance      where org_id = p_org_id;
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
  -- activity_logs / memberships / organizations / invoices SENGAJA tidak disentuh.

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

  perform fm_log(p_org_id, 'data.restore', 'organization', p_org_id::text,
                 v_total || ' data dipulihkan dari backup',
                 jsonb_build_object('restored', v_total));

  return jsonb_build_object('ok', true, 'restored', v_total);
end;
$$;

revoke all on function restore_org_data(uuid, jsonb) from public;
grant execute on function restore_org_data(uuid, jsonb) to authenticated;
