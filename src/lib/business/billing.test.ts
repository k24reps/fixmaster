import { describe, it, expect } from 'vitest';
import {
  canCreateTicket,
  ledgerKindLabel,
  refundWindowOpen,
  ticketsUntilBlocked,
  topupAmountError,
  topupWhatsAppLink,
  unitBalanceState,
  unitsForTopup,
  unitsToRupiah,
} from './billing';
import { LOW_BALANCE_UNITS, UNIT_FLOOR } from '@/config/pricing';

describe('unitBalanceState', () => {
  it('cukup di atas ambang menipis', () => {
    expect(unitBalanceState(LOW_BALANCE_UNITS + 1)).toBe('ok');
    expect(unitBalanceState(50)).toBe('ok');
  });
  it('menipis antara 1 dan ambang', () => {
    expect(unitBalanceState(LOW_BALANCE_UNITS)).toBe('low');
    expect(unitBalanceState(1)).toBe('low');
  });
  it('minus mulai dari nol sampai sebelum batas', () => {
    expect(unitBalanceState(0)).toBe('minus');
    expect(unitBalanceState(UNIT_FLOOR + 1)).toBe('minus');
  });
  it('tertahan tepat di batas dan di bawahnya', () => {
    expect(unitBalanceState(UNIT_FLOOR)).toBe('blocked');
    expect(unitBalanceState(UNIT_FLOOR - 3)).toBe('blocked');
  });
});

describe('canCreateTicket', () => {
  it('sama dengan server: ditolak saat saldo <= batas minus', () => {
    expect(canCreateTicket(UNIT_FLOOR + 1)).toBe(true);
    expect(canCreateTicket(UNIT_FLOOR)).toBe(false);
  });
});

describe('ticketsUntilBlocked', () => {
  it('menghitung jatah minus', () => {
    expect(ticketsUntilBlocked(0)).toBe(-UNIT_FLOOR);
    expect(ticketsUntilBlocked(5)).toBe(5 - UNIT_FLOOR);
    expect(ticketsUntilBlocked(UNIT_FLOOR)).toBe(0);
    expect(ticketsUntilBlocked(UNIT_FLOOR - 4)).toBe(0);
  });
});

describe('konversi rupiah dan unit', () => {
  it('Rp 1.000 per unit', () => {
    expect(unitsToRupiah(48)).toBe(48_000);
    expect(unitsToRupiah(-3)).toBe(-3_000);
    expect(unitsForTopup(100_000)).toBe(100);
  });
});

describe('topupAmountError', () => {
  it('menolak di bawah minimum', () => {
    expect(topupAmountError(49_000)).toBe('billing.topupMin');
    expect(topupAmountError(Number.NaN)).toBe('billing.topupMin');
  });
  it('menolak yang bukan kelipatan Rp 1.000', () => {
    expect(topupAmountError(50_500)).toBe('billing.topupStep');
  });
  it('menerima minimum dan kelipatannya', () => {
    expect(topupAmountError(50_000)).toBeNull();
    expect(topupAmountError(123_000)).toBeNull();
  });
});

describe('refundWindowOpen', () => {
  const at = '2026-11-14T10:00:00.000Z';
  it('terbuka sampai tepat 10 menit', () => {
    expect(refundWindowOpen(at, new Date('2026-11-14T10:09:59.000Z'))).toBe(true);
    expect(refundWindowOpen(at, new Date('2026-11-14T10:10:00.000Z'))).toBe(true);
  });
  it('tertutup sesudahnya', () => {
    expect(refundWindowOpen(at, new Date('2026-11-14T10:10:01.000Z'))).toBe(false);
  });
});

describe('ledgerKindLabel', () => {
  it('setiap jenis punya label', () => {
    for (const kind of ['grant', 'topup', 'usage', 'refund', 'adjust'] as const) {
      expect(ledgerKindLabel(kind)).toBe(`billing.kind.${kind}`);
    }
  });
});

describe('topupWhatsAppLink', () => {
  it('membawa id organisasi, saldo, nominal, dan unit', () => {
    const link = topupWhatsAppLink({
      supportPhone: '628995318638',
      orgId: 'org-1',
      orgName: 'Konter Jaya',
      balance: -4,
      amount: 100_000,
    });
    const text = decodeURIComponent(link.split('text=')[1] ?? '');
    expect(link).toContain('628995318638');
    expect(text).toContain('ID organisasi: org-1');
    expect(text).toContain('Saldo sekarang: -4 unit');
    expect(text).toContain('(100 unit)');
  });
});
