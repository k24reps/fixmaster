import { describe, it, expect } from 'vitest';
import {
  applyBalance,
  netWalletDeltas,
  reverseIncomeDelta,
  reverseExpenseDelta,
  applyTransferChange,
  transferDeltas,
  transferMoneyLocked,
  summarize,
  shouldRevertServiceOnIncomeDelete,
  entryDateError,
  findRecentDuplicate,
  walletMovement,
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

describe('transfer antar wallet (0086)', () => {
  const ws = () => [
    wallet({ id: 'a', name: 'Tunai', balance: 1000 }),
    wallet({ id: 'b', name: 'BCA', balance: 200 }),
    wallet({ id: 'c', name: 'QRIS', balance: 0 }),
  ];
  const bal = (r: ReturnType<typeof applyTransferChange>, id: string) =>
    r.ok ? r.wallets.find((w) => w.id === id)?.balance : undefined;

  it('buat: asal berkurang, tujuan bertambah', () => {
    const r = applyTransferChange(ws(), null, { fromWalletId: 'a', toWalletId: 'b', amount: 400 });
    expect(bal(r, 'a')).toBe(600);
    expect(bal(r, 'b')).toBe(600);
  });

  it('menolak wallet sama, nol, pecahan, dan saldo kurang — pesan sama dengan RPC', () => {
    const e = (after: { fromWalletId: string; toWalletId: string; amount: number }) => {
      const r = applyTransferChange(ws(), null, after);
      return r.ok ? '' : r.error;
    };
    expect(e({ fromWalletId: 'a', toWalletId: 'a', amount: 1 })).toBe('Wallet asal & tujuan sama');
    expect(e({ fromWalletId: 'a', toWalletId: 'b', amount: 0 })).toBe('Nominal harus lebih dari 0');
    expect(e({ fromWalletId: 'a', toWalletId: 'b', amount: 10.5 })).toBe('Nominal harus rupiah bulat');
    expect(e({ fromWalletId: 'c', toWalletId: 'b', amount: 5 })).toBe('Saldo QRIS tidak cukup (tersisa Rp 0)');
  });

  it('edit nominal + tujuan: yang lama dibalik, yang baru diterapkan', () => {
    // a->b 300 sudah terjadi; saldo di bawah adalah SESUDAHNYA. Diedit jadi a->c 500.
    const w = [
      wallet({ id: 'a', name: 'Tunai', balance: 1000 }),
      wallet({ id: 'b', name: 'BCA', balance: 400 }),
      wallet({ id: 'c', name: 'QRIS', balance: 0 }),
    ];
    const r = applyTransferChange(
      w,
      { fromWalletId: 'a', toWalletId: 'b', amount: 300 },
      { fromWalletId: 'a', toWalletId: 'c', amount: 500 },
    );
    expect(bal(r, 'a')).toBe(800); // +300 -500
    expect(bal(r, 'b')).toBe(100); // -300
    expect(bal(r, 'c')).toBe(500);
  });

  it('edit ditolak bila tujuan lama sudah menghabiskan uangnya', () => {
    const r = applyTransferChange(
      ws(),
      { fromWalletId: 'a', toWalletId: 'b', amount: 300 },
      { fromWalletId: 'a', toWalletId: 'c', amount: 500 },
    );
    expect(r).toEqual({ ok: false, error: 'Saldo BCA tidak cukup (tersisa Rp 200, perlu Rp 300)' });
  });

  it('batal mengembalikan saldo persis, dan ditolak bila uangnya sudah terpakai', () => {
    const ok = applyTransferChange(ws(), { fromWalletId: 'a', toWalletId: 'b', amount: 150 }, null);
    expect(bal(ok, 'a')).toBe(1150);
    expect(bal(ok, 'b')).toBe(50);
    const no = applyTransferChange(ws(), { fromWalletId: 'a', toWalletId: 'b', amount: 250 }, null);
    expect(no).toEqual({
      ok: false,
      error: 'Saldo BCA tinggal Rp 200 — tidak cukup untuk mengembalikan Rp 250',
    });
  });

  it('edit keterangan saja tidak menyentuh saldo', () => {
    const same = { fromWalletId: 'a', toWalletId: 'b', amount: 300 };
    expect(applyTransferChange(ws(), same, { ...same })).toEqual({ ok: true, wallets: [] });
  });

  it('uang transfer bulan lalu atau yang dibatalkan terkunci', () => {
    expect(transferMoneyLocked({ date: '2026-09-01', status: 'active' }, '2026-09-25')).toBe(false);
    expect(transferMoneyLocked({ date: '2026-08-31', status: 'active' }, '2026-09-25')).toBe(true);
    expect(transferMoneyLocked({ date: '2026-09-20', status: 'void' }, '2026-09-25')).toBe(true);
  });

  it('transferDeltas menjumlahkan wallet yang muncul di kedua sisi', () => {
    const d = transferDeltas(
      { fromWalletId: 'a', toWalletId: 'b', amount: 100 },
      { fromWalletId: 'b', toWalletId: 'a', amount: 100 },
    );
    expect(d.get('a')).toBe(200);
    expect(d.get('b')).toBe(-200);
  });
});

describe('summarize', () => {
  it('computes income, expense, and net', () => {
    const s = summarize(
      [
        { amount: 500, category: 'Servis' },
        { amount: 300, category: 'Penjualan' },
      ],
      [{ amount: 200, category: 'Sparepart' }],
    );
    expect(s).toEqual({ income: 800, expense: 200, net: 600 });
  });

  // Bug asli: suntikan modal pemilik terhitung sebagai omzet -> laba
  // menggelembung 43% tanpa satu pun error.
  it('excludes owner capital (Modal) from income and profit', () => {
    const s = summarize(
      [
        { amount: 500, category: 'Servis' },
        { amount: 13500000, category: 'Modal' },
      ],
      [{ amount: 200, category: 'Sparepart' }],
    );
    expect(s).toEqual({ income: 500, expense: 200, net: 300 });
  });

  it('excludes owner drawings (Prive) from expense and profit', () => {
    const s = summarize(
      [{ amount: 500, category: 'Servis' }],
      [
        { amount: 200, category: 'Sparepart' },
        { amount: 9000, category: 'Prive' },
      ],
    );
    expect(s).toEqual({ income: 500, expense: 200, net: 300 });
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

describe('entryDateError', () => {
  it('awal bulan s/d hari ini diterima; bulan lalu & masa depan ditolak', () => {
    expect(entryDateError('2026-09-01', '2026-09-27')).toBeNull();
    expect(entryDateError('2026-09-27', '2026-09-27')).toBeNull();
    expect(entryDateError('2026-08-31', '2026-09-27')).toMatch(/terkunci/);
    expect(entryDateError('2026-09-28', '2026-09-27')).toMatch(/masa depan/);
  });
});

describe('findRecentDuplicate', () => {
  const now = new Date('2026-09-27T10:10:00Z');
  const row = { amount: 75000, walletId: 'w1', description: 'Beli lem B7000', date: '2026-09-27', createdAt: '2026-09-27T10:05:00Z' };
  it('baris identik 5 menit lalu = duplikat (keterangan tak peka huruf/spasi)', () => {
    expect(findRecentDuplicate([row], { ...row, description: ' beli lem b7000 ' }, now)).toBe(row);
  });
  it('beda nominal, wallet, atau sudah lewat 10 menit = bukan duplikat', () => {
    expect(findRecentDuplicate([row], { ...row, amount: 80000 }, now)).toBeNull();
    expect(findRecentDuplicate([row], { ...row, walletId: 'w2' }, now)).toBeNull();
    expect(findRecentDuplicate([row], row, new Date('2026-09-27T10:30:00Z'))).toBeNull();
  });
});

describe('walletMovement', () => {
  it('masuk, keluar, dan transfer bersih; transfer batal diabaikan', () => {
    const m = walletMovement(
      'w1',
      [{ amount: 100, walletId: 'w1' }, { amount: 50, walletId: 'w2' }],
      [{ amount: 30, walletId: 'w1' }],
      [
        { amount: 20, fromWalletId: 'w2', toWalletId: 'w1', status: 'active' },
        { amount: 5, fromWalletId: 'w1', toWalletId: 'w2', status: 'active' },
        { amount: 999, fromWalletId: 'w2', toWalletId: 'w1', status: 'void' },
      ],
    );
    expect(m).toEqual({ in: 100, out: 30, transfer: 15 });
  });
});
