-- 0097 — Biaya pengecekan saat Batal + kategori "Refund Servis" (29 Sep 2026).
--
-- A. Pelanggan membatalkan servis tapi membayar biaya pengecekan. Dulu dua
--    langkah yang janggal: catat sebagai "DP" lalu Batal dengan refund 0.
--    cancel_service kini menerima p_fee_amount + p_fee_wallet_id: pemasukan
--    Servis "Biaya pengecekan servis <no>" + saldo wallet bertambah, dan
--    down_payment ikut bertambah — sehingga "DP ditahan" (retainedDownPayment,
--    category_profit 0093) otomatis memuat biaya itu sebagai pendapatan tiket,
--    tanpa jalur hitung kedua. Tiket tetap tidak dihitung unit selesai.
--
-- B. Refund DP servis, refund kelebihan bayar (0062), dan koreksi biaya turun
--    (0063) dulu dicatat "Lainnya". Sejak kategori dirinci, "Lainnya" = beban
--    operasional (overhead), padahal laba servis SUDAH memperhitungkan ketiganya
--    (DP ditahan / biaya final terkoreksi) — break-even menghitungnya dua kali.
--    Kategori "Refund Servis" dikecualikan dari overhead dan beban langsung.
--    Trigger menormalkan baris otomatis dari RPC lama (settle_service,
--    correct_service_cost) tanpa menulis ulang RPC-nya; baris lama di-backfill.

-- ---------- A ----------
drop function if exists cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid, int[]);

create or replace function cancel_service(
  p_org_id uuid,
  p_service_id uuid,
  p_history jsonb,
  p_outlet_id uuid default null,
  p_refund_amount numeric default null,
  p_refund_wallet_id uuid default null,
  p_keep_parts int[] default null,
  p_fee_amount numeric default null,
  p_fee_wallet_id uuid default null
) returns void
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jakarta'
as $$
declare
  v_service services%rowtype;
  v_sp jsonb;
  v_i int;
  v_keep int[] := coalesce(p_keep_parts, '{}');
  v_refund numeric := coalesce(p_refund_amount, 0);
  v_fee numeric := coalesce(p_fee_amount, 0);
  v_wallet_balance numeric;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;

  select * into v_service from services
    where id = p_service_id and org_id = p_org_id
    for update;
  if not found then raise exception 'Service not found'; end if;
  if not can_use_outlet(p_org_id, v_service.outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if v_service.status = 'lunas' then
    raise exception 'Tiket yang sudah Lunas tidak bisa dibatalkan';
  end if;

  if v_refund < 0 then raise exception 'Nominal refund tidak boleh negatif'; end if;
  if v_fee < 0 then raise exception 'Biaya pengecekan tidak boleh negatif'; end if;
  if v_refund > 0 and v_fee > 0 then
    raise exception 'Isi refund ATAU biaya pengecekan, bukan keduanya — kurangi refund DP bila biaya cek dipotong dari DP';
  end if;
  if v_refund > coalesce(v_service.down_payment, 0) then
    raise exception 'Refund melebihi DP yang diterima';
  end if;
  -- 'batal' diterima untuk klien lama (status disimpan dulu), tapi refund
  -- yang sudah dibukukan tidak boleh diulang.
  if v_refund > 0 and v_service.status = 'batal' and exists (
    select 1 from expenses
    where org_id = p_org_id and description = 'Refund DP servis ' || v_service.service_no
  ) then
    raise exception 'Refund DP tiket ini sudah dicatat';
  end if;
  if v_fee > 0 and exists (
    select 1 from incomes
    where org_id = p_org_id and service_id = p_service_id
      and description = 'Biaya pengecekan servis ' || v_service.service_no
  ) then
    raise exception 'Biaya pengecekan tiket ini sudah dicatat';
  end if;

  -- Indeks 0-based milik baris sparepart tiket yang dikunci di atas.
  foreach v_i in array v_keep loop
    v_sp := v_service.spareparts -> v_i;
    if v_sp is null
       or not coalesce((v_sp->>'deducted')::boolean, false)
       or coalesce(v_sp->>'kind', '') = 'manual'
       or coalesce(v_sp->>'itemId', '') = '' then
      raise exception 'Daftar sparepart tiket berubah — muat ulang lalu coba lagi';
    end if;
  end loop;

  -- Stok dikembalikan untuk baris `deducted` yang tidak ditandai terpakai; baris
  -- itu dibalik ke false, jadi pembatalan ulang tidak mengembalikan dua kali.
  for v_sp, v_i in
    select t.sp, (t.i - 1)::int
    from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) with ordinality as t(sp, i)
  loop
    if coalesce((v_sp->>'deducted')::boolean, false)
       and coalesce(v_sp->>'itemId', '') <> ''
       and not (v_i = any(v_keep)) then
      update inventory_items
        set stock = stock + (v_sp->>'qty')::int, updated_at = now()
        where id = (v_sp->>'itemId')::uuid and org_id = p_org_id;
    end if;
  end loop;

  if v_refund > 0 then
    if p_refund_wallet_id is null then raise exception 'Wallet refund wajib dipilih'; end if;
    select balance into v_wallet_balance
      from wallets where id = p_refund_wallet_id and org_id = p_org_id for update;
    if v_wallet_balance is null then raise exception 'Wallet refund tidak ditemukan'; end if;
    if v_wallet_balance < v_refund then raise exception 'Saldo wallet refund tidak cukup'; end if;

    update wallets set balance = balance - v_refund, updated_at = now()
      where id = p_refund_wallet_id and org_id = p_org_id;
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, v_service.outlet_id, current_date, 'Refund Servis', v_refund,
            p_refund_wallet_id, 'Refund DP servis ' || v_service.service_no);
  end if;

  if v_fee > 0 then
    if p_fee_wallet_id is null then raise exception 'Wallet biaya pengecekan wajib dipilih'; end if;
    -- Cabang wallet vs cabang tiket dijaga trigger assert_wallet_outlet (0095).
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
    values (p_org_id, v_service.outlet_id, current_date, 'Servis', v_fee, p_fee_wallet_id,
            'Biaya pengecekan servis ' || v_service.service_no, p_service_id);
    update wallets set balance = balance + v_fee, updated_at = now()
      where id = p_fee_wallet_id and org_id = p_org_id;
    if not found then raise exception 'Wallet biaya pengecekan tidak ditemukan'; end if;
  end if;

  update services
    set status = 'batal',
        history = p_history,
        -- Biaya cek masuk DP → terbaca sebagai "DP ditahan" = pendapatan tiket batal.
        down_payment = coalesce(down_payment, 0) + v_fee,
        spareparts = (
          select coalesce(jsonb_agg(
            case when coalesce((sp->>'deducted')::boolean, false) and not ((i - 1)::int = any(v_keep))
                 then jsonb_set(sp, '{deducted}', 'false'::jsonb)
                 else sp end
            order by i
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) with ordinality as t(sp, i)
        ),
        updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;
revoke all on function cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid, int[], numeric, uuid) from public, anon;
grant execute on function cancel_service(uuid, uuid, jsonb, uuid, numeric, uuid, int[], numeric, uuid) to authenticated;

-- ---------- B ----------
create or replace function normalize_service_refund_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.category = 'Lainnya' and new.description ~ '^(Refund DP servis|Refund kelebihan DP servis|Koreksi biaya servis) ' then
    new.category := 'Refund Servis';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_service_refund_category on expenses;
create trigger expenses_service_refund_category
  before insert on expenses
  for each row execute function normalize_service_refund_category();

update expenses
   set category = 'Refund Servis', updated_at = now()
 where category = 'Lainnya'
   and description ~ '^(Refund DP servis|Refund kelebihan DP servis|Koreksi biaya servis) ';
