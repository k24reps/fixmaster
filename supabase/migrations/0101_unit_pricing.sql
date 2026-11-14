-- ============================================================
-- FixMaster — 0101: harga per unit masuk (14 Nov 2026)
--
-- Model langganan bulanan Solo/Pro (masa aktif + kuota + fitur terkunci)
-- diganti satu harga: Rp 1.000 per tiket servis, dibayar dari SALDO UNIT yang
-- diisi di muka. Semua fitur, pengguna, dan outlet terbuka untuk semua toko.
-- Angka-angkanya dicerminkan di src/config/pricing.ts dan dijaga tes
-- src/config/pricing.test.ts yang membaca berkas ini:
--
--   kuota gratis toko baru ........ 50 unit
--   batas minus ................... -20 unit (setelah itu tiket BARU ditolak)
--   jendela pengembalian .......... 10 menit sejak unit dipotong
--   isi saldo minimum ............. Rp 50.000, kelipatan Rp 1.000
--
-- A. organizations.unit_balance — saldo berjalan. Klien mengirim baris
--    organizations penuh dari salinan yang bisa basi (profil usaha), jadi
--    kolom ini dijaga seperti plan_type (0016): perubahan yang tidak lewat
--    jalur berflag dibuang diam-diam, bukan ditolak.
--
-- B. unit_ledger — buku saldo. Setiap perubahan saldo adalah satu baris
--    dengan saldo sesudahnya (balance_after), seperti rekening koran.
--    service_id TANPA foreign key, dengan sengaja: tiket yang dihapus dan
--    restore_org_data (hapus lalu sisip ulang id yang sama) tidak boleh
--    menghapus jejak pemakaian. Indeks unik (service_id, kind) membuat
--    pemotongan dan pengembalian per tiket masing-masing paling banyak satu
--    kali, jadi sisip ulang saat restore tidak memotong dua kali.
--
-- C. Pemotongan di AFTER INSERT, bukan BEFORE: tiket disimpan lewat upsert
--    (repository.put). BEFORE INSERT ikut menyala untuk upsert yang berakhir
--    sebagai UPDATE, sehingga setiap perubahan status akan memotong saldo dan
--    saldo minus akan memblokir pekerjaan tiket lama. AFTER INSERT hanya
--    menyala bila baris benar-benar baru.
--    Yang dihitung hanya sisipan dari aplikasi (current_user =
--    'authenticated'). Fungsi server tidak dihitung: restore_org_data
--    mengembalikan tiket yang sudah pernah dipotong, dan klaim garansi
--    (create_warranty_claim) adalah perangkat yang sama yang kembali, bukan
--    unit masuk baru. Klaim garansi juga dikecualikan secara eksplisit lewat
--    warranty_claim_of, supaya tidak bergantung pada jalur pembuatnya.
--
-- D. Pengembalian 10 menit: tiket yang menjadi Batal, atau dihapus owner,
--    paling lama 10 menit setelah unitnya dipotong, mendapat unitnya kembali.
--    Waktu dihitung dari baris ledger (jam server), bukan services.created_at
--    yang dikirim perangkat. Batal bersifat final (0089), jadi tidak ada jalur
--    "dibuka lagi" yang perlu memotong ulang. Bila jalur itu kelak dibuat, ia
--    wajib memotong unit lagi (kind baru), karena indeks unik di atas hanya
--    mengizinkan satu pengembalian per tiket.
--
-- E. delete_service_ticket — hapus tiket permanen, owner saja, hanya tiket
--    BERSIH (tanpa DP/pembayaran, tanpa sparepart atau pembelian luar, tanpa
--    klaim garansi, bukan Lunas). Tiket yang memegang uang atau stok harus
--    lewat Batal supaya kas dan stok dibalik oleh jalur yang sudah teruji.
--    Policy services_del dicabut: hapus langsung lewat REST tidak lagi ada,
--    sehingga syarat "bersih" tidak bisa dilewati.
--
-- F. Penagihan lama dilepas: is_org_active tidak lagi membaca masa aktif,
--    kuota paket dibuka, RPC pembayaran paket dan promo hari dihapus. Kolom
--    plan_type kini hanya bermakna untuk 'suspended'. plan_expired_at dan
--    tabel invoices dibiarkan untuk riwayat.
--
-- G. Operator: admin_topup_units (isi saldo setelah transfer diverifikasi di
--    WhatsApp), admin_adjust_units (koreksi), admin_reactivate_org (membuka
--    toko yang ditangguhkan; 0049 menghapusnya karena di model lama membuka
--    akses = memberi masa aktif gratis, sedangkan kini pemakaian tetap
--    dibayar dari saldo). Semuanya mencatat operator_actions.
-- ============================================================

-- ---------- A. saldo unit ----------
-- Default 50 sekaligus mengisi toko yang sudah ada dengan kuota gratis.
alter table organizations
  add column if not exists unit_balance integer not null default 50;

create or replace function guard_unit_balance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Toko baru selalu mulai dari kuota gratis, apa pun isi kiriman klien.
    new.unit_balance := 50;
    return new;
  end if;
  if new.unit_balance is distinct from old.unit_balance
     and coalesce(current_setting('fixmaster.bypass_unit_lock', true), '') <> '1'
     and coalesce(auth.role(), '') <> 'service_role' then
    new.unit_balance := old.unit_balance;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_unit_balance on organizations;
create trigger trg_guard_unit_balance
  before insert or update on organizations
  for each row execute function guard_unit_balance();

-- ---------- B. buku saldo ----------
create table if not exists unit_ledger (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('grant', 'topup', 'usage', 'refund', 'adjust')),
  units integer not null check (units <> 0),
  balance_after integer not null,
  -- Rupiah yang ditransfer; hanya untuk isi saldo.
  amount numeric(14,2),
  service_id uuid,
  service_no text,
  reference text,
  note text not null default '',
  actor_name text not null default '',
  created_at timestamptz not null default now(),
  constraint unit_ledger_service_kinds
    check ((kind in ('usage', 'refund')) = (service_id is not null)),
  constraint unit_ledger_topup_fields
    check (kind <> 'topup' or (amount > 0 and coalesce(btrim(reference), '') <> ''))
);

create unique index if not exists uq_unit_ledger_service_kind
  on unit_ledger(service_id, kind) where service_id is not null;
create unique index if not exists uq_unit_ledger_topup_ref
  on unit_ledger(org_id, reference) where kind = 'topup';
create index if not exists idx_unit_ledger_org_created
  on unit_ledger(org_id, created_at desc);

alter table unit_ledger enable row level security;

-- Baca: owner saja, sama dengan tab penagihan. Tulis: tidak ada policy;
-- semua baris lahir dari fungsi security definer di bawah.
drop policy if exists unit_ledger_select on unit_ledger;
create policy unit_ledger_select on unit_ledger
  for select using (is_org_owner(org_id));

insert into unit_ledger (org_id, kind, units, balance_after, note, actor_name)
select o.id, 'grant', 50, 50, 'Kuota gratis saat peralihan ke harga per unit', 'FixMaster'
from organizations o
where not exists (
  select 1 from unit_ledger l where l.org_id = o.id and l.kind = 'grant'
);

-- Satu-satunya penulis saldo. Mengunci baris organisasi, mencatat ledger, lalu
-- memperbarui saldo. Mengembalikan saldo sesudahnya, atau null bila entri yang
-- sama (tiket + jenis, atau referensi isi saldo) sudah pernah dicatat.
create or replace function unit_ledger_apply(
  p_org_id uuid,
  p_kind text,
  p_units int,
  p_service_id uuid default null,
  p_service_no text default null,
  p_amount numeric default null,
  p_reference text default null,
  p_note text default '',
  p_actor_name text default ''
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance int;
  v_after int;
  v_id uuid;
begin
  select unit_balance into v_balance
  from organizations where id = p_org_id
  for update;
  if v_balance is null then raise exception 'Organisasi tidak ditemukan'; end if;

  v_after := v_balance + p_units;

  insert into unit_ledger (
    org_id, kind, units, balance_after, amount, service_id, service_no,
    reference, note, actor_name
  ) values (
    p_org_id, p_kind, p_units, v_after, p_amount, p_service_id, p_service_no,
    nullif(btrim(coalesce(p_reference, '')), ''), coalesce(p_note, ''), coalesce(p_actor_name, '')
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then return null; end if;

  perform set_config('fixmaster.bypass_unit_lock', '1', true);
  update organizations set unit_balance = v_after where id = p_org_id;
  perform set_config('fixmaster.bypass_unit_lock', '', true);

  return v_after;
end;
$$;

revoke execute on function unit_ledger_apply(uuid, text, int, uuid, text, numeric, text, text, text)
  from public, anon, authenticated;

-- Nama anggota yang sedang login di org ini, untuk kolom actor_name.
create or replace function unit_actor_name(p_org_id uuid)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select m.name from memberships m
      where m.user_id = auth.uid() and m.org_id = p_org_id
      limit 1),
    ''
  );
$$;

revoke execute on function unit_actor_name(uuid) from public, anon, authenticated;

-- Toko baru: catat kuota gratisnya di ledger (saldonya dipaksa 50 oleh guard).
create or replace function organizations_grant_free_units()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into unit_ledger (org_id, kind, units, balance_after, note, actor_name)
  values (new.id, 'grant', new.unit_balance, new.unit_balance, 'Kuota gratis toko baru', 'FixMaster');
  return new;
end;
$$;

drop trigger if exists trg_organizations_grant_free_units on organizations;
create trigger trg_organizations_grant_free_units
  after insert on organizations
  for each row execute function organizations_grant_free_units();

-- ---------- C. pemotongan saat tiket dibuat ----------
create or replace function charge_service_unit(p_org_id uuid, p_service_id uuid, p_service_no text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance int;
begin
  select unit_balance into v_balance
  from organizations where id = p_org_id
  for update;

  -- Sudah pernah dipotong (tiket yang sama disisip ulang): bukan unit baru.
  if exists (
    select 1 from unit_ledger where service_id = p_service_id and kind = 'usage'
  ) then
    return;
  end if;

  if v_balance <= -20 then
    raise exception 'Saldo unit habis (% unit). Isi saldo di Pengaturan > Saldo untuk menerima unit baru. Tiket yang sudah ada tetap bisa dikerjakan.', v_balance
      using errcode = 'P0001', hint = 'unit_balance_exhausted';
  end if;

  perform unit_ledger_apply(
    p_org_id, 'usage', -1, p_service_id, p_service_no,
    null, null, '', unit_actor_name(p_org_id)
  );
end;
$$;

revoke execute on function charge_service_unit(uuid, uuid, text) from public, anon, authenticated;

-- Bukan security definer: current_user harus tetap peran pemanggil supaya
-- sisipan dari fungsi server (restore, klaim garansi) bisa dikenali.
create or replace function services_charge_unit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.warranty_claim_of is not null then return new; end if;
  perform charge_service_unit(new.org_id, new.id, new.service_no);
  return new;
end;
$$;

drop trigger if exists trg_services_charge_unit on services;
create trigger trg_services_charge_unit
  after insert on services
  for each row execute function services_charge_unit();

-- ---------- D. pengembalian 10 menit ----------
create or replace function refund_service_unit_if_fresh(
  p_org_id uuid,
  p_service_id uuid,
  p_service_no text,
  p_note text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_charged_at timestamptz;
begin
  select created_at into v_charged_at
  from unit_ledger
  where service_id = p_service_id and kind = 'usage' and org_id = p_org_id;

  if v_charged_at is null then return false; end if;
  if now() - v_charged_at > interval '10 minutes' then return false; end if;

  return unit_ledger_apply(
    p_org_id, 'refund', 1, p_service_id, p_service_no,
    null, null, p_note, unit_actor_name(p_org_id)
  ) is not null;
end;
$$;

revoke execute on function refund_service_unit_if_fresh(uuid, uuid, text, text)
  from public, anon, authenticated;

create or replace function services_refund_on_cancel()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'batal' and old.status is distinct from 'batal' then
    perform refund_service_unit_if_fresh(
      new.org_id, new.id, new.service_no, 'Dibatalkan dalam 10 menit'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_services_refund_on_cancel on services;
create trigger trg_services_refund_on_cancel
  after update of status on services
  for each row execute function services_refund_on_cancel();

-- ---------- E. hapus tiket (owner, tiket bersih) ----------
drop policy if exists services_del on services;

create or replace function delete_service_ticket(p_org_id uuid, p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_service services%rowtype;
  v_refunded boolean;
begin
  if not is_org_owner(p_org_id) then
    raise exception 'Hanya owner yang bisa menghapus tiket';
  end if;
  if not is_org_active(p_org_id) then
    raise exception 'Akun toko sedang ditangguhkan';
  end if;

  select * into v_service from services
  where id = p_service_id and org_id = p_org_id
  for update;
  if not found then raise exception 'Tiket tidak ditemukan'; end if;

  if v_service.status = 'lunas' then
    raise exception 'Tiket Lunas tidak bisa dihapus';
  end if;
  if coalesce(v_service.down_payment, 0) > 0 or exists (
    select 1 from incomes where service_id = p_service_id and org_id = p_org_id
  ) then
    raise exception 'Tiket ini sudah menerima pembayaran. Batalkan tiketnya agar uangnya ikut dibalik.';
  end if;
  if jsonb_array_length(coalesce(v_service.spareparts, '[]'::jsonb)) > 0 then
    raise exception 'Tiket ini memakai sparepart atau pembelian luar. Lepaskan dulu dari tiket, atau batalkan tiketnya.';
  end if;
  if exists (
    select 1 from services where warranty_claim_of = p_service_id and org_id = p_org_id
  ) then
    raise exception 'Tiket ini punya klaim garansi, jadi tidak bisa dihapus.';
  end if;

  v_refunded := refund_service_unit_if_fresh(
    p_org_id, p_service_id, v_service.service_no, 'Dihapus dalam 10 menit'
  );

  perform fm_log(
    p_org_id,
    'service.delete',
    'service',
    p_service_id::text,
    v_service.service_no,
    jsonb_build_object(
      'device', concat_ws(' ', v_service.category, v_service.device),
      'customer', v_service.customer_name,
      'status', v_service.status,
      'unit_refunded', v_refunded
    ),
    v_service.outlet_id
  );

  -- Kode lacak tidak ber-FK ke services (0100); tanpa ini tautan lacak di
  -- kertas pelanggan masih menunjuk tiket yang sudah tidak ada.
  delete from service_tracking where service_id = p_service_id;
  delete from services where id = p_service_id;

  return jsonb_build_object('refunded', v_refunded);
end;
$$;

revoke execute on function delete_service_ticket(uuid, uuid) from public, anon;
grant execute on function delete_service_ticket(uuid, uuid) to authenticated;

-- ---------- F. penagihan lama dilepas ----------
create or replace function is_org_active(p_org_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_plan plan_type;
begin
  select plan_type into v_plan from organizations where id = p_org_id;
  if v_plan is null or v_plan = 'suspended' then return false; end if;
  return true;
end;
$$;

-- Semua toko mendapat semua fitur. Batas wallet 99 dipertahankan sebagai
-- pagar kewajaran, bukan pembeda harga.
create or replace function plan_quota(p_plan plan_type)
returns table (max_users int, max_outlets int, max_wallets int)
language sql immutable
set search_path = public, pg_temp
as $$
  select
    case when p_plan = 'suspended' then 0 else -1 end,
    case when p_plan = 'suspended' then 0 else -1 end,
    case when p_plan = 'suspended' then 0 else 99 end;
$$;

drop function if exists admin_confirm_manual_payment(uuid, plan_type, int, numeric, text, text);
drop function if exists admin_apply_promo(uuid, text, int, text);
drop function if exists admin_reactivate_org(uuid, plan_type, text);

-- ---------- G. operator ----------
create or replace function admin_topup_units(
  p_org_id uuid,
  p_amount numeric,
  p_reference text,
  p_reason text
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_units int;
  v_after int;
  v_existing int;
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  if p_amount is null or p_amount < 50000 then
    raise exception 'Isi saldo minimal Rp 50.000';
  end if;
  if p_amount <> trunc(p_amount) or mod(p_amount, 1000) <> 0 then
    raise exception 'Nominal isi saldo harus kelipatan Rp 1.000';
  end if;
  if p_amount > 100000000 then
    raise exception 'Nominal isi saldo tidak wajar';
  end if;
  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'Referensi pembayaran wajib diisi';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Catatan verifikasi wajib diisi';
  end if;

  v_units := (p_amount / 1000)::int;
  v_after := unit_ledger_apply(
    p_org_id, 'topup', v_units, null, null,
    p_amount, btrim(p_reference), btrim(p_reason), 'FixMaster'
  );

  -- Referensi yang sama adalah retry, bukan transfer baru.
  if v_after is null then
    select unit_balance into v_existing from organizations where id = p_org_id;
    return v_existing;
  end if;

  perform log_operator_action(
    p_org_id,
    'topup_units',
    btrim(p_reason),
    jsonb_build_object(
      'nominal', p_amount,
      'unit', v_units,
      'referensi', btrim(p_reference),
      'saldo_sesudah', v_after
    )
  );

  return v_after;
end;
$fn$;

create or replace function admin_adjust_units(
  p_org_id uuid,
  p_units int,
  p_reason text
) returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_after int;
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  if p_units is null or p_units = 0 or abs(p_units) > 1000 then
    raise exception 'Koreksi harus antara -1000 dan 1000 unit, dan bukan 0';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi';
  end if;

  v_after := unit_ledger_apply(
    p_org_id, 'adjust', p_units, null, null, null, null, btrim(p_reason), 'FixMaster'
  );

  perform log_operator_action(
    p_org_id,
    'adjust_units',
    btrim(p_reason),
    jsonb_build_object('unit', p_units, 'saldo_sesudah', v_after)
  );

  return v_after;
end;
$fn$;

create or replace function admin_reactivate_org(p_org_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old plan_type;
begin
  if not is_platform_admin() then raise exception 'Forbidden'; end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Alasan wajib diisi';
  end if;

  select plan_type into v_old from organizations where id = p_org_id for update;
  if v_old is null then raise exception 'Org tidak ditemukan'; end if;
  if v_old <> 'suspended' then return; end if;

  -- Nilainya tak lagi membedakan apa pun selain 'suspended'; enterprise
  -- dipilih karena artinya paling dekat dengan "semua fitur".
  perform set_config('fixmaster.bypass_plan_lock', '1', true);
  update organizations set plan_type = 'enterprise' where id = p_org_id;

  perform log_operator_action(p_org_id, 'reactivate', btrim(p_reason),
    jsonb_build_object('plan_sebelum', v_old));
end;
$fn$;

drop function if exists admin_list_orgs();

create or replace function admin_list_orgs()
returns table (
  org_id uuid,
  org_name text,
  org_plan plan_type,
  unit_balance int,
  units_used_30d int,
  registered_at timestamptz,
  demo boolean,
  outlet_count int,
  user_count int,
  service_count int,
  last_activity_at timestamptz,
  last_topup_at timestamptz,
  last_topup_reference text,
  note text,
  org_phone text
)
language plpgsql security definer
set search_path = public, pg_temp
as $fn$
#variable_conflict use_column
begin
  if not is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  return query
  select
    o.id,
    o.name,
    o.plan_type,
    o.unit_balance,
    (select coalesce(-sum(l.units), 0)::int from unit_ledger l
       where l.org_id = o.id and l.kind in ('usage', 'refund')
         and l.created_at > now() - interval '30 days'),
    o.created_at,
    o.is_demo,
    (select count(*)::int from outlets t
       where t.org_id = o.id and t.deleted_at is null),
    (select count(*)::int from memberships m
       where m.org_id = o.id and m.active = true and m.deleted_at is null),
    (select count(*)::int from services s
       where s.org_id = o.id and s.deleted_at is null),
    (select max(a.created_at) from activity_logs a where a.org_id = o.id),
    (select max(l.created_at) from unit_ledger l
       where l.org_id = o.id and l.kind = 'topup'),
    (select l.reference from unit_ledger l
       where l.org_id = o.id and l.kind = 'topup'
       order by l.created_at desc
       limit 1),
    coalesce((select cn.note from client_notes cn where cn.org_id = o.id), ''),
    coalesce(o.phone, '')
  from organizations o
  order by (o.plan_type = 'suspended'), o.unit_balance asc, o.name asc;
end;
$fn$;

revoke execute on function admin_list_orgs() from public, anon;
grant execute on function admin_list_orgs() to authenticated;
revoke execute on function admin_topup_units(uuid, numeric, text, text) from public, anon;
grant execute on function admin_topup_units(uuid, numeric, text, text) to authenticated;
revoke execute on function admin_adjust_units(uuid, int, text) from public, anon;
grant execute on function admin_adjust_units(uuid, int, text) to authenticated;
revoke execute on function admin_reactivate_org(uuid, text) from public, anon;
grant execute on function admin_reactivate_org(uuid, text) to authenticated;
