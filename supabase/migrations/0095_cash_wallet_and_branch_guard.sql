-- ============================================================
-- FixMaster — 0095: wallet tunai & wallet per cabang (28 Sep 2026)
--
-- A. wallets.is_cash: uang fisik di laci. Kembalian Kasir selalu diambil dari
--    wallet ini (aplikasi, settleTender). Diisi awal untuk wallet yang namanya
--    jelas tunai; pemilik bisa mengubahnya di Pengaturan › Wallet.
--
-- B. Model hybrid (0023/0028) sudah lama ada: wallet bersama (outlet_id null)
--    atau khusus satu cabang. Yang belum ada: penjaga. Transaksi cabang Dago
--    bisa masuk ke "Tunai Pusat", sehingga laci Pusat tak pernah cocok. Semua
--    uang — Kasir, pelunasan & DP servis, refund, modal dadakan, PO, entri
--    manual — berakhir sebagai baris incomes/expenses berpasangan wallet_id +
--    outlet_id, jadi SATU trigger di dua tabel itu menjaga semua RPC sekaligus.
--    Transfer antar wallet (setor laci ke bank) sengaja tidak dibatasi.
-- ============================================================

-- ---------- A ----------
alter table wallets add column if not exists is_cash boolean not null default false;
update wallets set is_cash = true
 where not is_cash and deleted_at is null
   and name ~* '(tunai|cash|laci|kas kecil)';

-- ---------- B ----------
create or replace function assert_wallet_outlet()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_outlet uuid;
  v_name text;
begin
  if new.wallet_id is null or new.outlet_id is null then
    return new;
  end if;
  select outlet_id, name into v_outlet, v_name from wallets where id = new.wallet_id;
  if v_outlet is not null and v_outlet <> new.outlet_id then
    raise exception 'Wallet "%" khusus cabang lain — pilih wallet cabang ini atau wallet bersama', v_name;
  end if;
  return new;
end;
$$;

drop trigger if exists incomes_wallet_outlet on incomes;
create trigger incomes_wallet_outlet
  before insert or update of wallet_id, outlet_id on incomes
  for each row execute function assert_wallet_outlet();

drop trigger if exists expenses_wallet_outlet on expenses;
create trigger expenses_wallet_outlet
  before insert or update of wallet_id, outlet_id on expenses
  for each row execute function assert_wallet_outlet();
