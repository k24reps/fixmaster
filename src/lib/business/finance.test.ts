import { describe, it, expect } from 'vitest';
import {
  applyBalance,
  netWalletDeltas,
  reverseIncomeDelta,
  reverseExpenseDelta,
  transfer,
  summarize,
  shouldRevertServiceOnIncomeDelete,
  transferEntries,
} from './finance';
import type { Wallet } from '@/data/types';

const wallet = (over: Partial<Wallet>): Wallet => ({
  id: over.id ?? 'w1',
  orgId: 'o1',
  outletId: null,
  name: over.name ?? 'Tunai',
  balance: over.balance ?? 0,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

describe('applyBalance', () => {
  it('adds a signed delta immutably', () => {
    const w = wallet({ balance: 1000 });
    const updated = applyBalance(w, -300);
    expect(updated.balance).toBe(700);
    expect(w.balance).toBe(1000); // original unchanged
  });
});

describe('netWalletDeltas', () => {
  it('nets income (+) and expense (-) per wallet', () => {
    const deltas = netWalletDeltas(
      [
        { walletId: 'w1', amount: 500 },
        { walletId: 'w2', amount: 200 },
      ],
      [{ walletId: 'w1', amount: 300 }],
    );
    expect(deltas.get('w1')).toBe(200);
    expect(deltas.get('w2')).toBe(200);
  });
});

describe('reverse deltas', () => {
  it('reverses income by subtracting', () => {
    expect(reverseIncomeDelta({ amount: 500 })).toBe(-500);
  });
  it('reverses expense by adding back', () => {
    expect(reverseExpenseDelta({ amount: 300 })).toBe(300);
  });
});

describe('transfer', () => {
  it('moves funds between wallets', () => {
    const r = transfer(
      wallet({ id: 'a', balance: 1000 }),
      wallet({ id: 'b', balance: 0 }),
      400,
    );
    expect(r.ok).toBe(true);
    expect(r.fromWallet?.balance).toBe(600);
    expect(r.toWallet?.balance).toBe(400);
  });
  it('rejects same-wallet transfer', () => {
    const w = wallet({ id: 'a', balance: 1000 });
    expect(transfer(w, w, 100).ok).toBe(false);
  });
  it('rejects insufficient balance', () => {
    const r = transfer(wallet({ id: 'a', balance: 100 }), wallet({ id: 'b' }), 400);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('cukup');
  });
  it('rejects non-positive amount', () => {
    expect(transfer(wallet({ id: 'a', balance: 100 }), wallet({ id: 'b' }), 0).ok).toBe(
      false,
    );
  });
});

describe('summarize', () => {
  it('computes income, expense, and net', () => {
    const s = summarize([{ amount: 500 }, { amount: 300 }], [{ amount: 200 }]);
    expect(s).toEqual({ income: 800, expense: 200, net: 600 });
  });
});

describe('shouldRevertServiceOnIncomeDelete', () => {
  it('reverts for service-linked service income', () => {
    expect(
      shouldRevertServiceOnIncomeDelete({ category: 'Servis', serviceId: 's1' }),
    ).toBe(true);
  });
  it('does not revert for non-service income', () => {
    expect(
      shouldRevertServiceOnIncomeDelete({ category: 'Penjualan', serviceId: null }),
    ).toBe(false);
    expect(
      shouldRevertServiceOnIncomeDelete({ category: 'Servis', serviceId: null }),
    ).toBe(false);
  });
});

describe('transferEntries', () => {
  const log = (over: Record<string, unknown> = {}) => ({
    id: 't1',
    action: 'wallet.transfer',
    entityId: 'w-from',
    entityLabel: 'Tunai → Bank BCA',
    createdAt: '2026-07-15T03:00:00.000Z',
    meta: { amount: 500000, toWalletId: 'w-to' },
    ...over,
  });

  it('maps a transfer log to both wallet sides', () => {
    const [t] = transferEntries([log()], '2026-07-01', '2026-07-31');
    expect(t).toMatchObject({
      amount: 500000,
      fromWalletId: 'w-from',
      toWalletId: 'w-to',
      label: 'Tunai → Bank BCA',
    });
  });

  it('ignores non-transfer actions', () => {
    expect(
      transferEntries([log({ action: 'income.create' })], '2026-07-01', '2026-07-31'),
    ).toEqual([]);
  });

  it('trims rows outside the local date range (widened timestamp window)', () => {
    const outside = log({ id: 't2', createdAt: '2026-06-30T03:00:00.000Z' });
    const ids = transferEntries([log(), outside], '2026-07-01', '2026-07-31').map(
      (t) => t.id,
    );
    expect(ids).toEqual(['t1']);
  });

  it('survives a log written without meta', () => {
    const [t] = transferEntries(
      [log({ meta: undefined, entityLabel: '' })],
      '2026-07-01',
      '2026-07-31',
    );
    expect(t).toMatchObject({
      amount: 0,
      toWalletId: '',
      label: 'Transfer antar wallet',
    });
  });
});
