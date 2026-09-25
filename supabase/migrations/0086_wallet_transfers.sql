-- ============================================================
-- FixMaster — 0086: transfer antar wallet punya tabel sendiri
--
-- Sampai 0073 transfer tidak membukukan baris apa pun; satu-satunya jejaknya
-- adalah log aktivitas `wallet.transfer`. Audit 25 Sep 2026 menemukan akibatnya:
--   #1 purge_activity_logs (0076) ikut menghapus riwayat transfer — bukti uang
--      berpindah hilang permanen;
--   #2 Buku Kas menarik SELURUH log sebulan (818 baris ≈240 KB di toko pemilik)
--      demi 19 transfer, dan menariknya ulang tiap ada log baru;
--   #3 "Balikkan transfer" bisa diulang tanpa jejak kaitan;
--   #4 wallet yang hanya dipakai transfer bisa dihapus;
--   #5 dua transfer berlawanan serentak bisa deadlock (urutan kunci tak tetap);
--   #6 server menerima nominal pecahan.
-- Pemilik (25 Sep 2026) memilih versi lengkap: tabel sendiri + transfer bisa
-- DIEDIT dan DIBATALKAN seperti pemasukan/pengeluaran, dengan aturan yang sama:
-- hanya bulan berjalan (assert_open_month, 0071), hanya manager.
--
-- Batal = baris TETAP ada (status 'void', dicoret di Buku Kas) + saldo
-- dikembalikan; bukan dihapus. Edit = saldo lama dibalik lalu yang baru
-- diterapkan dalam SATU transaksi, dengan cek saldo per wallet. Keterangan
-- (note) bebas diedit kapan saja karena tidak menyentuh uang.
-- ============================================================

create table if not exists wallet_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  -- RESTRICT: wallet yang punya riwayat transfer tidak bisa dihapus (#4).
  from_wallet_id uuid not null references wallets(id) on delete restrict,
  to_wallet_id uuid not null references wallets(id) on delete restrict,
  -- Nama saat transfer dibuat/diedit: riwayat tetap terbaca walau wallet
  -- diganti nama, atau berada di cabang lain yang tak tampil di Buku Kas.
  from_name text not null default '',
  to_name text not null default '',
  amount numeric not null,
  note text not null default '',
  -- Tanggal lokal (WIB) — patokan kunci bulan & pengelompokan Buku Kas.
  date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  status text not null default 'active',
  created_by uuid,
  created_by_name text not null default '',
  voided_at timestamptz,
  voided_by_name text,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Tidak pernah diisi aplikasi (batal = status), tapi adapter klien menyaring
  -- `deleted_at is null` di semua tabel.
  deleted_at timestamptz,
  constraint wallet_transfers_distinct check (from_wallet_id <> to_wallet_id),
  -- Rupiah bulat, lebih dari nol (#6).
  constraint wallet_transfers_amount check (amount > 0 and amount = trunc(amount)),
  constraint wallet_transfers_status check (status in ('active', 'void'))
);

create index if not exists wallet_transfers_org_date_idx
  on wallet_transfers (org_id, date desc);

alter table wallet_transfers enable row level security;

-- Baca: manager (owner/admin), sama dengan keuangan lain (0016). Tulis: TIDAK
-- ada policy — hanya lewat RPC security definer di bawah.
drop policy if exists wallet_transfers_select on wallet_transfers;
create policy wallet_transfers_select on wallet_transfers
  for select using (is_org_manager(org_id));

-- Pelajaran 0082: default privileges Supabase memberi anon hak atas tabel baru.
revoke all on wallet_transfers from anon;

-- Realtime: Buku Kas perangkat lain ikut berubah saat transfer dibuat/diedit/batal.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'wallet_transfers') then
    alter publication supabase_realtime add table wallet_transfers;
  end if;
end $$;

-- ---------- pindahkan riwayat lama dari log aktivitas ----------
-- id log dipakai sebagai id transfer supaya migrasi aman diulang. Baris yang
-- wallet-nya sudah terhapus tidak bisa dipindahkan (FK) dan dilewati — log
-- aslinya tetap ada di Log Aktivitas.
insert into wallet_transfers (id, org_id, from_wallet_id, to_wallet_id, from_name, to_name,
                              amount, note, date, created_by_name, created_at, updated_at)
select l.id, l.org_id, fw.id, tw.id,
       coalesce(nullif(split_part(l.entity_label, ' → ', 1), ''), fw.name),
       coalesce(nullif(split_part(l.entity_label, ' → ', 2), ''), tw.name),
       round((l.meta->>'amount')::numeric), '',
       (l.created_at at time zone 'Asia/Jakarta')::date,
       coalesce(l.actor_name, ''), l.created_at, l.created_at
  from activity_logs l
  join wallets fw on fw.org_id = l.org_id and fw.id::text = l.entity_id
  join wallets tw on tw.org_id = l.org_id and tw.id::text = l.meta->>'toWalletId'
 where l.action = 'wallet.transfer'
   and l.meta->>'amount' ~ '^[0-9]+(\.[0-9]+)?$'
   and round((l.meta->>'amount')::numeric) > 0
   and fw.id <> tw.id
on conflict (id) do nothing;

-- ---------- rupiah untuk pesan galat ----------
-- Pesan galat tampil apa adanya di aplikasi; "tersisa 297067.00" tak terbaca.
-- Sama dengan format klien (applyTransferChange): "Rp 297.067".
create or replace function fm_rp(p numeric)
returns text
language sql immutable
set search_path = public, pg_temp
as $$ select 'Rp ' || replace(to_char(round(coalesce(p, 0)), 'FM999,999,999,999,990'), ',', '.') $$;
revoke all on function fm_rp(numeric) from public, anon;

-- ---------- kunci wallet dalam urutan tetap ----------
-- Semua RPC transfer mengunci wallet yang terlibat urut id, jadi dua transfer
-- berlawanan (A→B & B→A) tidak lagi saling menunggu selamanya (#5).
create or replace function wallet_transfer_lock(p_org_id uuid, p_ids uuid[])
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform 1 from wallets
   where org_id = p_org_id and id = any(p_ids)
   order by id
   for update;
end;
$$;
revoke all on function wallet_transfer_lock(uuid, uuid[]) from public, anon, authenticated;

-- ---------- buat transfer ----------
-- Tanda tangan berubah (note + mengembalikan id), jadi fungsi lama dibuang:
-- membiarkannya berdampingan membuat panggilan 4 argumen bernama jadi ambigu.
-- Klien lama tetap jalan — p_note punya default.
drop function if exists transfer_wallet(uuid, uuid, uuid, numeric);

create or replace function transfer_wallet(
  p_org_id uuid,
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_amount numeric,
  p_note text default ''
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_from wallets%rowtype;
  v_to wallets%rowtype;
  v_member memberships%rowtype;
  v_id uuid;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if p_from_wallet_id = p_to_wallet_id then raise exception 'Wallet asal & tujuan sama'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
  if p_amount <> trunc(p_amount) then raise exception 'Nominal harus rupiah bulat'; end if;

  perform wallet_transfer_lock(p_org_id, array[p_from_wallet_id, p_to_wallet_id]);
  select * into v_from from wallets where id = p_from_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet asal tidak ditemukan'; end if;
  select * into v_to from wallets where id = p_to_wallet_id and org_id = p_org_id;
  if not found then raise exception 'Wallet tujuan tidak ditemukan'; end if;
  if v_from.balance < p_amount then
    raise exception 'Saldo % tidak cukup (tersisa %)', v_from.name, fm_rp(v_from.balance);
  end if;

  select * into v_member from memberships where user_id = auth.uid() and org_id = p_org_id;

  insert into wallet_transfers (org_id, from_wallet_id, to_wallet_id, from_name, to_name,
                                amount, note, created_by, created_by_name)
  values (p_org_id, v_from.id, v_to.id, v_from.name, v_to.name,
          p_amount, coalesce(trim(p_note), ''), v_member.id, coalesce(v_member.name, 'Sistem'))
  returning id into v_id;

  update wallets set balance = balance - p_amount, updated_at = now() where id = v_from.id;
  update wallets set balance = balance + p_amount, updated_at = now() where id = v_to.id;

  -- Log tetap ditulis untuk Log Aktivitas; sumber kebenaran transfer kini tabelnya.
  perform fm_log(p_org_id, 'wallet.transfer', 'wallet', v_from.id::text,
                 v_from.name || ' → ' || v_to.name,
                 jsonb_build_object('amount', p_amount, 'toWalletId', v_to.id, 'transferId', v_id));
  return v_id;
end;
$$;

-- ---------- edit transfer ----------
create or replace function update_wallet_transfer(
  p_org_id uuid,
  p_transfer_id uuid,
  p_from_wallet_id uuid,
  p_to_wallet_id uuid,
  p_amount numeric,
  p_note text default ''
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_t wallet_transfers%rowtype;
  v_from wallets%rowtype;
  v_to wallets%rowtype;
  v_w record;
  v_delta numeric;
  v_money boolean;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_t from wallet_transfers
   where id = p_transfer_id and org_id = p_org_id for update;
  if not found then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status <> 'active' then raise exception 'Transfer ini sudah dibatalkan'; end if;

  v_money := (v_t.from_wallet_id, v_t.to_wallet_id, v_t.amount)
             is distinct from (p_from_wallet_id, p_to_wallet_id, p_amount);

  if v_money then
    perform assert_open_month(v_t.date, 'Transfer');
    if p_from_wallet_id = p_to_wallet_id then raise exception 'Wallet asal & tujuan sama'; end if;
    if coalesce(p_amount, 0) <= 0 then raise exception 'Nominal harus lebih dari 0'; end if;
    if p_amount <> trunc(p_amount) then raise exception 'Nominal harus rupiah bulat'; end if;

    perform wallet_transfer_lock(p_org_id,
      array[v_t.from_wallet_id, v_t.to_wallet_id, p_from_wallet_id, p_to_wallet_id]);
    select * into v_from from wallets where id = p_from_wallet_id and org_id = p_org_id;
    if not found then raise exception 'Wallet asal tidak ditemukan'; end if;
    select * into v_to from wallets where id = p_to_wallet_id and org_id = p_org_id;
    if not found then raise exception 'Wallet tujuan tidak ditemukan'; end if;

    -- Selisih bersih per wallet: balik transfer lama, terapkan yang baru. Wallet
    -- yang berkurang tidak boleh jatuh di bawah nol — uang yang sudah terpakai
    -- tidak bisa ditarik kembali.
    for v_w in
      select w.id, w.name, w.balance from wallets w
       where w.org_id = p_org_id
         and w.id = any(array[v_t.from_wallet_id, v_t.to_wallet_id, p_from_wallet_id, p_to_wallet_id])
    loop
      v_delta := (case when v_w.id = v_t.from_wallet_id then v_t.amount else 0 end)
               - (case when v_w.id = v_t.to_wallet_id then v_t.amount else 0 end)
               - (case when v_w.id = p_from_wallet_id then p_amount else 0 end)
               + (case when v_w.id = p_to_wallet_id then p_amount else 0 end);
      if v_delta < 0 and v_w.balance + v_delta < 0 then
        raise exception 'Saldo % tidak cukup (tersisa %, perlu %)', v_w.name, fm_rp(v_w.balance), fm_rp(-v_delta);
      end if;
      if v_delta <> 0 then
        update wallets set balance = balance + v_delta, updated_at = now() where id = v_w.id;
      end if;
    end loop;

    update wallet_transfers
       set from_wallet_id = v_from.id, to_wallet_id = v_to.id,
           from_name = v_from.name, to_name = v_to.name, amount = p_amount
     where id = v_t.id;
  end if;

  update wallet_transfers set note = coalesce(trim(p_note), ''), updated_at = now()
   where id = v_t.id;

  perform fm_log(p_org_id, 'wallet.transfer.edit', 'wallet_transfer', v_t.id::text,
                 coalesce(v_from.name, v_t.from_name) || ' → ' || coalesce(v_to.name, v_t.to_name),
                 jsonb_build_object(
                   'before', jsonb_build_object('from', v_t.from_wallet_id, 'to', v_t.to_wallet_id,
                                                'amount', v_t.amount, 'note', v_t.note),
                   'after', jsonb_build_object('from', p_from_wallet_id, 'to', p_to_wallet_id,
                                               'amount', p_amount, 'note', coalesce(trim(p_note), ''))));
end;
$$;

-- ---------- batalkan transfer ----------
create or replace function void_wallet_transfer(
  p_org_id uuid,
  p_transfer_id uuid,
  p_reason text default ''
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_t wallet_transfers%rowtype;
  v_to wallets%rowtype;
  v_member memberships%rowtype;
begin
  if not is_org_manager(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_t from wallet_transfers
   where id = p_transfer_id and org_id = p_org_id for update;
  if not found then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status <> 'active' then raise exception 'Transfer ini sudah dibatalkan'; end if;
  perform assert_open_month(v_t.date, 'Transfer');

  perform wallet_transfer_lock(p_org_id, array[v_t.from_wallet_id, v_t.to_wallet_id]);
  select * into v_to from wallets where id = v_t.to_wallet_id and org_id = p_org_id;
  if v_to.balance < v_t.amount then
    raise exception 'Saldo % tinggal % — tidak cukup untuk mengembalikan %', v_to.name, fm_rp(v_to.balance), fm_rp(v_t.amount);
  end if;

  update wallets set balance = balance - v_t.amount, updated_at = now() where id = v_t.to_wallet_id;
  update wallets set balance = balance + v_t.amount, updated_at = now() where id = v_t.from_wallet_id;

  select * into v_member from memberships where user_id = auth.uid() and org_id = p_org_id;
  update wallet_transfers
     set status = 'void', voided_at = now(), voided_by_name = coalesce(v_member.name, 'Sistem'),
         void_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now()
   where id = v_t.id;

  perform fm_log(p_org_id, 'wallet.transfer.void', 'wallet_transfer', v_t.id::text,
                 v_t.from_name || ' → ' || v_t.to_name,
                 jsonb_build_object('amount', v_t.amount, 'reason', coalesce(p_reason, '')));
end;
$$;

revoke all on function transfer_wallet(uuid, uuid, uuid, numeric, text) from public, anon;
revoke all on function update_wallet_transfer(uuid, uuid, uuid, uuid, numeric, text) from public, anon;
revoke all on function void_wallet_transfer(uuid, uuid, text) from public, anon;
grant execute on function transfer_wallet(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function update_wallet_transfer(uuid, uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function void_wallet_transfer(uuid, uuid, text) to authenticated;

-- ---------- wallet dengan riwayat transfer tidak bisa dihapus (#4) ----------
-- Salinan 0077 + satu cek tambahan.
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
  -- 0086: transfer kini punya tabel sendiri; FK RESTRICT sudah menolak, ini
  -- memberi pesan yang bisa dibaca pemilik toko alih-alih galat foreign key.
  select count(*) into v_rows from wallet_transfers
   where from_wallet_id = old.id or to_wallet_id = old.id;
  if v_rows > 0 then
    raise exception 'Wallet "%" punya % riwayat transfer — riwayatnya akan kehilangan asal uangnya.', old.name, v_rows;
  end if;
  return old;
end;
$$;

-- ---------- pemulihan ikut membawa transfer ----------
-- Salinan 0077 + wallet_transfers (hapus sebelum wallets, isi sesudahnya).
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

  -- 0086: transfer lebih dulu — FK RESTRICT ke wallets.
  delete from wallet_transfers where org_id = p_org_id;
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

  -- 0086: sesudah wallets (FK). Backup lama tanpa kunci ini = tanpa transfer.
  insert into wallet_transfers
  select (jsonb_populate_record(null::wallet_transfers,
    e || jsonb_build_object('org_id', p_org_id, 'created_by', null))).*
  from jsonb_array_elements(coalesce(p_payload->'wallet_transfers','[]'::jsonb)) e;
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
