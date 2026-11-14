import { describe, it, expect } from 'vitest';
import migration from '../../supabase/migrations/0101_unit_pricing.sql?raw';
import {
  FREE_UNITS,
  MAX_WALLETS,
  MIN_TOPUP,
  REFUND_WINDOW_MINUTES,
  TOPUP_STEP,
  UNIT_FLOOR,
  UNIT_PRICE,
} from './pricing';

// Server dan klien memegang angka harga masing-masing. Tes ini membaca
// migrasinya supaya perubahan di satu sisi langsung memerahkan sisi lainnya.
describe('angka harga sama dengan migrasi 0101', () => {
  it('kuota gratis toko baru', () => {
    expect(migration).toContain(`new.unit_balance := ${FREE_UNITS};`);
    expect(migration).toContain(`add column if not exists unit_balance integer not null default ${FREE_UNITS};`);
  });

  it('batas minus sebelum tiket baru ditolak', () => {
    expect(migration).toContain(`if v_balance <= ${UNIT_FLOOR} then`);
  });

  it('jendela pengembalian unit', () => {
    expect(migration).toContain(`interval '${REFUND_WINDOW_MINUTES} minutes'`);
  });

  it('isi saldo minimum, kelipatan, dan konversi rupiah ke unit', () => {
    expect(migration).toContain(`p_amount < ${MIN_TOPUP}`);
    expect(migration).toContain(`mod(p_amount, ${TOPUP_STEP}) <> 0`);
    expect(migration).toContain(`(p_amount / ${UNIT_PRICE})::int`);
  });

  it('pagar jumlah wallet sama dengan plan_quota', () => {
    expect(migration).toContain(`case when p_plan = 'suspended' then 0 else ${MAX_WALLETS} end;`);
  });
});
