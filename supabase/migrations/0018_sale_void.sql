-- ============================================================
-- FixMaster — 0018: Koreksi transaksi (void penjualan)
-- Melengkapi alur "perbaiki kalau salah input" untuk POS.
--   A. Tautan uang: tambah kolom incomes.sale_id (FK ke sales) agar
--      pembalikan finansial saat void bersifat deterministik, bukan
--      cocok-teks. Expand-only (nullable, on delete set null).
--   B. RPC void_sale(sale_id, reason) — MANAGER-only, ATOMIK:
--        1) kembalikan stok tiap baris ke inventory_items,
--        2) kurangi saldo wallet sebesar income terkait,
--        3) hapus baris income terkait,
--        4) tandai sales.voided = true (+ alasan) — baris DITAHAN
--           untuk jejak audit; laporan sudah memfilter voided.
--      Idempoten: sale yang sudah voided = no-op.
-- Catatan: absensi TIDAK butuh policy baru — sejak 0017 manager sudah
-- boleh update/delete attendance; koreksi absensi murni UI.
-- Idempotent, expand-only. Diuji di staging dulu.
-- ============================================================

-- ---------- A. Tautan income → sale ----------
alter table incomes
  add column if not exists sale_id uuid references sales(id) on delete set null;
create index if not exists idx_incomes_sale on incomes(sale_id);

-- ---------- B. void_sale ----------
create or replace function void_sale(p_sale_id uuid, p_reason text default '')
returns void
language plpgsql security definer as $$
declare
  v_org uuid;
  v_sale_no text;
  v_voided boolean;
  v_lines jsonb;
  v_line jsonb;
  v_inc record;
begin
  select org_id, sale_no, voided, lines
    into v_org, v_sale_no, v_voided, v_lines
  from sales where id = p_sale_id;

  if v_org is null then raise exception 'Penjualan tidak ditemukan'; end if;
  if not is_org_manager(v_org) then raise exception 'Hanya manager yang dapat membatalkan penjualan'; end if;
  if v_voided then return; end if;  -- idempotent

  -- 1) Kembalikan stok tiap baris (item yang sudah dihapus → no-op aman).
  for v_line in select * from jsonb_array_elements(coalesce(v_lines, '[]'::jsonb)) loop
    update inventory_items
      set stock = stock + (v_line->>'qty')::int, updated_at = now()
      where id = (v_line->>'itemId')::uuid and org_id = v_org;
  end loop;

  -- 2+3) Balik saldo wallet & hapus income terkait. Cocokkan via sale_id
  --      (sales baru) ATAU fallback deskripsi (sales lama/RPC tanpa sale_id;
  --      sale_no unik per org sehingga deskripsi efektif unik).
  for v_inc in
    select id, wallet_id, amount from incomes
    where org_id = v_org
      and (
        sale_id = p_sale_id
        or (sale_id is null and category = 'Penjualan'
            and description = 'Penjualan ' || v_sale_no)
      )
  loop
    if v_inc.wallet_id is not null then
      update wallets set balance = balance - v_inc.amount, updated_at = now()
        where id = v_inc.wallet_id and org_id = v_org;
    end if;
    delete from incomes where id = v_inc.id;
  end loop;

  -- 4) Tandai void (tahan baris untuk audit).
  update sales
    set voided = true, voided_reason = coalesce(p_reason, ''), updated_at = now()
    where id = p_sale_id;
end;
$$;

grant execute on function void_sale(uuid, text) to authenticated;
