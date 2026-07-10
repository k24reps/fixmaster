-- ============================================================
-- FixMaster — 0039: hardening RPC uang (integritas & billing)
--
-- Temuan audit (jalur uang security-definer mem-bypass RLS, jadi guard yang
-- ada di RLS TIDAK berlaku di dalam RPC):
--
--  1) `is_org_active` (0009) dipakai di SEMUA RLS write (0010/0017/0028) untuk
--     memblokir org yang langganannya habis. Tapi process_sale (0025),
--     settle_service (0029), record_down_payment (0030) & cancel_service (0031)
--     TAK memeriksanya → org kadaluarsa tetap bisa transaksi tanpa batas,
--     membatalkan enforcement billing 0010.
--
--  2) process_sale & settle_service menerima `amount` per leg langsung dari
--     klien tanpa cek non-negatif → nominal NEGATIF akan MENDEBIT wallet
--     (exploit). record_down_payment & transfer_wallet sudah menolak <= 0;
--     dua RPC ini inkonsisten.
--
--  3) cancel_service (0031) refund: `p_refund_amount` dari klien TAK dibatasi ke
--     DP yang benar-benar diterima, TAK mengunci wallet (no FOR UPDATE), dan TAK
--     cek saldo → kasir (is_org_member) bisa membukukan expense "Refund DP"
--     sembarang / membuat saldo negatif (celah penggelapan). Bandingkan
--     transfer_wallet (0031) yang sudah lock + cek saldo.
--
-- Fix: recreate keempat fungsi (tanda tangan & grant TIDAK berubah) dengan
-- guard di atas. Idempotent, additif, tak menyentuh data. Uji staging dulu.
--
-- CATATAN (di luar cakupan migrasi ini, keputusan produk — belum diubah):
--   - start_subscription/apply_payment: harga plan berasal dari klien & cabang
--     "owner mock-confirm" (0022) mengizinkan owner mengaktifkan plan tanpa
--     pembayaran webhook. Perlu peta plan→harga server-side + membatasi
--     penandaan "lunas" ke service_role saja. Diserahkan ke keputusan rilis.
--   - Kuota max_outlets/max_users (0001) belum di-enforce di server.
-- ============================================================

-- ------------------------------------------------------------
-- process_sale (0025) + is_org_active + tolak leg negatif.
-- ------------------------------------------------------------
create or replace function process_sale(
  p_org_id uuid,
  p_sale_no text,
  p_lines jsonb,
  p_payments jsonb,
  p_subtotal numeric,
  p_discount numeric,
  p_discount_type text,
  p_total numeric,
  p_outlet_id uuid default null
) returns uuid
language plpgsql security definer as $$
declare
  v_sale_id uuid;
  v_line jsonb;
  v_payment jsonb;
  v_item inventory_items%rowtype;
  v_member memberships%rowtype;
  v_prefix text;
  v_seq int;
  v_sale_no text;
begin
  if not is_org_member(p_org_id) then
    raise exception 'Forbidden';
  end if;
  if not is_org_active(p_org_id) then
    raise exception 'Langganan tidak aktif';
  end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  select * into v_member from memberships where user_id = auth.uid() and org_id = p_org_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_item from inventory_items
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id for update;
    if not found then raise exception 'Item not found: %', v_line->>'itemId'; end if;
    if v_item.stock < (v_line->>'qty')::int then
      raise exception 'Insufficient stock for %', v_item.name;
    end if;
  end loop;

  -- Assign a collision-free sale number SERVER-SIDE. The client computes p_sale_no
  -- from its OUTLET-SCOPED sales list, so two cashiers (or a second outlet's first
  -- sale) can propose the same 'PFX-0001' and hit the org-wide unique(org_id,
  -- sale_no). We keep only the prefix, hold a per-(org,prefix) advisory lock (auto-
  -- released at commit), and take max+1 across ALL outlets. Guarantees uniqueness
  -- under concurrency without a client retry.
  v_prefix := split_part(p_sale_no, '-', 1);
  perform pg_advisory_xact_lock(hashtext(p_org_id::text || ':sale:' || v_prefix));
  select coalesce(max((regexp_replace(sale_no, '^.*-', ''))::int), 0) + 1
    into v_seq
    from sales
    where org_id = p_org_id and sale_no ~ ('^' || v_prefix || '-\d+$');
  v_sale_no := v_prefix || '-' || lpad(v_seq::text, 4, '0');

  insert into sales (org_id, outlet_id, sale_no, date, lines, subtotal, discount, discount_type, total, payments, cashier_id, cashier_name)
  values (p_org_id, p_outlet_id, v_sale_no, current_date, p_lines, p_subtotal, p_discount, p_discount_type, p_total, p_payments, v_member.id, v_member.name)
  returning id into v_sale_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    update inventory_items
      set stock = stock - (v_line->>'qty')::int, updated_at = now()
      where id = (v_line->>'itemId')::uuid and org_id = p_org_id;
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments) loop
    if (v_payment->>'amount')::numeric < 0 then
      raise exception 'Nominal pembayaran tidak boleh negatif';
    end if;
    update wallets
      set balance = balance + (v_payment->>'amount')::numeric, updated_at = now()
      where id = (v_payment->>'walletId')::uuid and org_id = p_org_id;
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, sale_id)
    values (p_org_id, p_outlet_id, current_date, 'Penjualan', (v_payment->>'amount')::numeric,
            (v_payment->>'walletId')::uuid, 'Penjualan ' || v_sale_no, v_sale_id);
  end loop;

  return v_sale_id;
end;
$$;
-- ponytail: cek sum(payments)==p_total / recompute total dari sell_price
-- ditunda — butuh konfirmasi semantik alokasi pembayaran & diskon di pos.ts.
-- Guard non-negatif sudah menutup exploit debit-wallet, yang paling berbahaya.
-- CATATAN: karena nomor kini ditetapkan server-side, toast klien bisa memakai
-- p_sale_no yang (jarang, saat balapan) berbeda dari nomor tersimpan; struk/
-- laporan pakai nilai tersimpan yang selalu unik & benar. Untuk menampilkan
-- nomor final seketika, ubah return jadi (id, sale_no) di iterasi berikutnya.

-- ------------------------------------------------------------
-- settle_service (0029) + is_org_active + tolak leg negatif.
-- ------------------------------------------------------------
create or replace function settle_service(
  p_org_id uuid,
  p_service_id uuid,
  p_payments jsonb,
  p_history jsonb,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_payment jsonb;
  v_service_no text;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select service_no into v_service_no
    from services where id = p_service_id and org_id = p_org_id;
  if v_service_no is null then raise exception 'Service not found'; end if;

  update services
    set status = 'lunas', history = p_history, updated_at = now()
    where id = p_service_id and org_id = p_org_id;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    if (v_payment->>'amount')::numeric < 0 then
      raise exception 'Nominal pembayaran tidak boleh negatif';
    end if;
    update wallets
      set balance = balance + (v_payment->>'amount')::numeric, updated_at = now()
      where id = (v_payment->>'walletId')::uuid and org_id = p_org_id;
    insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
    values (p_org_id, p_outlet_id, current_date, 'Servis', (v_payment->>'amount')::numeric,
            (v_payment->>'walletId')::uuid, 'Pelunasan servis ' || v_service_no, p_service_id);
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- record_down_payment (0030) + is_org_active.
-- ------------------------------------------------------------
create or replace function record_down_payment(
  p_org_id uuid,
  p_service_id uuid,
  p_wallet_id uuid,
  p_amount numeric,
  p_outlet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_service_no text;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;
  if p_amount <= 0 then raise exception 'Nominal DP harus lebih dari 0'; end if;

  select service_no into v_service_no
    from services where id = p_service_id and org_id = p_org_id;
  if v_service_no is null then raise exception 'Service not found'; end if;

  insert into incomes (org_id, outlet_id, date, category, amount, wallet_id, description, service_id)
  values (p_org_id, p_outlet_id, current_date, 'Servis', p_amount, p_wallet_id,
          'DP servis ' || v_service_no, p_service_id);

  update wallets set balance = balance + p_amount, updated_at = now()
    where id = p_wallet_id and org_id = p_org_id;

  update services set down_payment = down_payment + p_amount, updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

-- ------------------------------------------------------------
-- cancel_service (0031) + is_org_active + refund dibatasi ke DP,
-- lock wallet refund (FOR UPDATE) + cek saldo (fail-safe non-negatif).
-- ------------------------------------------------------------
create or replace function cancel_service(
  p_org_id uuid,
  p_service_id uuid,
  p_history jsonb,
  p_outlet_id uuid default null,
  p_refund_amount numeric default null,
  p_refund_wallet_id uuid default null
) returns void
language plpgsql security definer as $$
declare
  v_service services%rowtype;
  v_sp jsonb;
  v_refund numeric := coalesce(p_refund_amount, 0);
  v_wallet_balance numeric;
begin
  if not is_org_member(p_org_id) then raise exception 'Forbidden'; end if;
  if not is_org_active(p_org_id) then raise exception 'Langganan tidak aktif'; end if;
  if not can_use_outlet(p_org_id, p_outlet_id) then
    raise exception 'Outlet di luar penugasan Anda';
  end if;

  select * into v_service from services where id = p_service_id and org_id = p_org_id;
  if not found then raise exception 'Service not found'; end if;

  if v_refund < 0 then raise exception 'Nominal refund tidak boleh negatif'; end if;
  if v_refund > coalesce(v_service.down_payment, 0) then
    raise exception 'Refund melebihi DP yang diterima';
  end if;

  for v_sp in select * from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) loop
    if coalesce((v_sp->>'deducted')::boolean, false)
       and coalesce(v_sp->>'itemId', '') <> '' then
      update inventory_items
        set stock = stock + (v_sp->>'qty')::int, updated_at = now()
        where id = (v_sp->>'itemId')::uuid and org_id = p_org_id;
    end if;
  end loop;

  if v_refund > 0 then
    if p_refund_wallet_id is null then raise exception 'Wallet refund wajib dipilih'; end if;
    -- Lock wallet refund & validasi saldo cukup (cegah saldo negatif / double-refund).
    select balance into v_wallet_balance
      from wallets where id = p_refund_wallet_id and org_id = p_org_id for update;
    if v_wallet_balance is null then raise exception 'Wallet refund tidak ditemukan'; end if;
    if v_wallet_balance < v_refund then raise exception 'Saldo wallet refund tidak cukup'; end if;

    update wallets set balance = balance - v_refund, updated_at = now()
      where id = p_refund_wallet_id and org_id = p_org_id;
    insert into expenses (org_id, outlet_id, date, category, amount, wallet_id, description)
    values (p_org_id, p_outlet_id, current_date, 'Lainnya', v_refund,
            p_refund_wallet_id, 'Refund DP servis ' || v_service.service_no);
  end if;

  update services
    set status = 'batal',
        history = p_history,
        spareparts = (
          select coalesce(jsonb_agg(
            case when coalesce((sp->>'deducted')::boolean, false)
                 then jsonb_set(sp, '{deducted}', 'false'::jsonb)
                 else sp end
          ), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_service.spareparts, '[]'::jsonb)) sp
        ),
        updated_at = now()
    where id = p_service_id and org_id = p_org_id;
end;
$$;

-- ------------------------------------------------------------
-- check_rate_limit (0015): jangan ekspos ke klien. Satu-satunya pemanggil
-- adalah track_service (security-definer) yang jalan sebagai owner fungsi,
-- jadi call internalnya tetap boleh setelah grant dicabut. Mencabut grant
-- mencegah: (a) flood tabel rate_events via key acak (DoS storage), dan
-- (b) menghabiskan kuota 'track:<orgId>' korban untuk memblokir lookup sah.
-- ------------------------------------------------------------
revoke execute on function check_rate_limit(text, int, int) from anon, authenticated;
