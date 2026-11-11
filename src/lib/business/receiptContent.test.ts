import { describe, expect, it } from 'vitest';
import { receiptAddress, saleReceiptModel, serviceMoney, stampWithTime } from './receiptContent';
import type { Sale, Service } from '@/data/types';

type MoneySrc = Pick<Service, 'status' | 'estimateCost' | 'finalCost' | 'downPayment' | 'history'>;

const money = (over: Partial<MoneySrc>): MoneySrc => ({
  status: 'diterima',
  estimateCost: 0,
  finalCost: 0,
  downPayment: 0,
  history: [],
  ...over,
});

const keys = (m: MoneySrc) => serviceMoney(m).map((l) => l.key);

describe('serviceMoney: tiket berjalan', () => {
  it('biaya akhir 0 + DP: "Sudah dibayar (DP)", tanpa Sisa Rp 0', () => {
    const lines = serviceMoney(money({ status: 'pengerjaan', downPayment: 200000 }));
    expect(lines).toEqual([{ key: 'paidDp', amount: 200000, emphasis: true }]);
  });

  it('estimasi tetap tampil sebagai informasi, DP-nya di bawah', () => {
    expect(keys(money({ estimateCost: 500000, downPayment: 100000 }))).toEqual(['estimate', 'paidDp']);
  });

  it('biaya akhir tanpa DP: total itu yang ditebalkan', () => {
    const lines = serviceMoney(money({ finalCost: 750000 }));
    expect(lines).toEqual([{ key: 'cost', amount: 750000, emphasis: true }]);
  });

  it('biaya akhir + DP: Biaya, DP, lalu Sisa yang ditebalkan', () => {
    const lines = serviceMoney(money({ finalCost: 500000, downPayment: 200000 }));
    expect(lines.map((l) => l.key)).toEqual(['cost', 'dp', 'remaining']);
    expect(lines.find((l) => l.emphasis)?.key).toBe('remaining');
    expect(lines[2].amount).toBe(300000);
  });

  it('DP melebihi biaya: sisa dijepit 0, bukan negatif', () => {
    const lines = serviceMoney(money({ finalCost: 100000, downPayment: 150000 }));
    expect(lines.find((l) => l.key === 'remaining')?.amount).toBe(0);
  });

  it('tanpa biaya, estimasi, dan DP: tak ada baris uang', () => {
    expect(serviceMoney(money({}))).toEqual([]);
  });
});

describe('serviceMoney: tiket batal', () => {
  const cancelled = (over: Partial<MoneySrc>) => money({ status: 'batal', ...over });

  it('tanpa DP tak mencetak uang sama sekali, termasuk estimasi', () => {
    expect(serviceMoney(cancelled({ estimateCost: 500000 }))).toEqual([]);
  });

  it('DP dikembalikan penuh: diterima lalu dikembalikan (ditebalkan)', () => {
    const lines = serviceMoney(
      cancelled({ downPayment: 100000, history: [{ status: 'batal', refund: 100000 } as never] }),
    );
    expect(lines).toEqual([
      { key: 'dpReceived', amount: 100000 },
      { key: 'dpRefunded', amount: 100000, emphasis: true },
    ]);
  });

  it('DP ditahan sebagian: diterima, ditahan, dikembalikan', () => {
    const lines = serviceMoney(
      cancelled({ downPayment: 100000, history: [{ status: 'batal', refund: 60000 } as never] }),
    );
    expect(lines.map((l) => [l.key, l.amount])).toEqual([
      ['dpReceived', 100000],
      ['dpRetained', 40000],
      ['dpRefunded', 60000],
    ]);
  });

  it('DP ditahan seluruhnya (refund 0): hanya diterima dan ditahan', () => {
    const lines = serviceMoney(
      cancelled({ downPayment: 100000, history: [{ status: 'batal', refund: 0 } as never] }),
    );
    expect(lines.map((l) => l.key)).toEqual(['dpReceived', 'dpRetained']);
    expect(lines[1].emphasis).toBe(true);
  });

  // retainedDownPayment mengembalikan null untuk tiket yang dibatalkan sebelum
  // refund dicatat. Menebak "dikembalikan" atau "ditahan" di atas kertas bukti
  // adalah janji yang tak bisa ditarik.
  it('catatan refund tak ada: hanya "DP diterima", tanpa menebak', () => {
    const lines = serviceMoney(cancelled({ downPayment: 100000, history: [] }));
    expect(lines).toEqual([{ key: 'dpReceived', amount: 100000 }]);
  });
});

const sale = (over: Partial<Sale>): Sale => ({
  id: 's1',
  orgId: 'o1',
  outletId: null,
  createdAt: '2026-11-11T07:41:00.000Z',
  updatedAt: '2026-11-11T07:41:00.000Z',
  deletedAt: null,
  saleNo: 'INV-0042',
  date: '2026-11-11',
  lines: [{ itemId: 'a', name: 'Tempered Glass', qty: 2, sellPrice: 75000, costPrice: 1000 }],
  subtotal: 150000,
  discount: 0,
  discountType: 'amount',
  total: 150000,
  payments: [{ walletId: 'w-cash', amount: 150000 }],
  cashierId: 'e1',
  cashierName: 'Budi',
  customerId: null,
  customerName: '',
  voided: false,
  voidedReason: '',
  ...over,
});

const names: Record<string, string> = { 'w-cash': 'Tunai', 'w-qris': 'QRIS' };
const walletName = (id: string | null) => (id ? (names[id] ?? '') : '');

describe('saleReceiptModel: baris', () => {
  it('memecah tiap barang jadi qty, harga satuan, dan jumlah', () => {
    const m = saleReceiptModel(sale({}), { walletName });
    expect(m.items).toEqual([{ qty: 2, name: 'Tempered Glass', unitPrice: 75000, amount: 150000 }]);
    expect(m.total).toBe(150000);
  });
});

describe('saleReceiptModel: pembayaran', () => {
  it('satu metode tanpa kembalian: satu baris metode dari wallet', () => {
    const m = saleReceiptModel(sale({}), { walletName });
    expect(m.pay).toEqual([{ key: 'method', amount: 150000, method: 'Tunai' }]);
  });

  it('kembalian diketahui: Dibayar = total + kembalian, metode ikut', () => {
    const m = saleReceiptModel(sale({}), { walletName, change: 50000 });
    expect(m.pay).toEqual([
      { key: 'paid', amount: 200000, method: 'Tunai' },
      { key: 'change', amount: 50000 },
    ]);
  });

  it('beberapa metode: tiap metode satu baris, lalu kembalian', () => {
    const m = saleReceiptModel(
      sale({
        payments: [
          { walletId: 'w-qris', amount: 100000 },
          { walletId: 'w-cash', amount: 50000 },
        ],
      }),
      { walletName, change: 5000 },
    );
    expect(m.pay.map((p) => [p.key, p.method ?? null, p.amount])).toEqual([
      ['method', 'QRIS', 100000],
      ['method', 'Tunai', 50000],
      ['change', null, 5000],
    ]);
  });

  it('tanpa data pembayaran dan tanpa kembalian (cetak ulang lama): tak ada baris bayar', () => {
    expect(saleReceiptModel(sale({ payments: [] }), { walletName }).pay).toEqual([]);
  });

  it('cetak ulang tak mengarang kembalian: change 0 = tidak diketahui', () => {
    const m = saleReceiptModel(sale({}), { walletName, reprint: true });
    expect(m.pay.some((p) => p.key === 'change' || p.key === 'paid')).toBe(false);
  });

  it('nama wallet kosong tidak menghasilkan metode bernama kosong', () => {
    const m = saleReceiptModel(sale({ payments: [{ walletId: 'hilang', amount: 150000 }] }), { walletName });
    expect(m.pay).toEqual([{ key: 'method', amount: 150000 }]);
  });

  it('jumlah alokasi nol diabaikan', () => {
    const m = saleReceiptModel(
      sale({ payments: [{ walletId: 'w-cash', amount: 0 }, { walletId: 'w-qris', amount: 150000 }] }),
      { walletName },
    );
    expect(m.pay.map((p) => p.method)).toEqual(['QRIS']);
  });
});

describe('saleReceiptModel: batal dan cetak ulang', () => {
  it('struk batal tak mencetak baris bayar maupun kembalian, alasan dipangkas', () => {
    const m = saleReceiptModel(sale({ voided: true, voidedReason: '  Salah input barang ' }), {
      walletName,
      change: 50000,
    });
    expect(m.voided).toBe(true);
    expect(m.voidedReason).toBe('Salah input barang');
    expect(m.pay).toEqual([]);
  });

  it('cetak ulang membawa tanggal dan jam cetak; cetak pertama tidak', () => {
    const now = new Date(2026, 10, 12, 9, 5); // 12 Nov 2026 09:05 lokal
    expect(saleReceiptModel(sale({}), { reprint: true, now }).reprintAt).toBe('12 Nov 2026 09:05');
    expect(saleReceiptModel(sale({}), { now }).reprintAt).toBeNull();
  });
});

describe('stampWithTime', () => {
  const at = new Date(2026, 10, 11, 14, 32).toISOString(); // 14:32 lokal

  it('tanpa jam: hanya tanggal, apa pun createdAt-nya', () => {
    expect(stampWithTime('2026-11-11', at, false)).toBe('11 Nov 2026');
  });

  it('dengan jam: jam transaksi dicatat, bukan jam cetak', () => {
    expect(stampWithTime('2026-11-11', at, true)).toBe('11 Nov 2026 14:32');
  });

  it('createdAt kosong atau tak terbaca menjatuhkan jam, tak mengarangnya', () => {
    expect(stampWithTime('2026-11-11', undefined, true)).toBe('11 Nov 2026');
    expect(stampWithTime('2026-11-11', 'bukan tanggal', true)).toBe('11 Nov 2026');
  });
});

describe('receiptAddress', () => {
  const outlets = [
    { id: 'a', address: ' Jl. A 1 ' },
    { id: 'b', address: '   ' },
    { id: 'c' },
  ];

  it('alamat cabang (dipangkas) bila cabang itu punya', () => {
    expect(receiptAddress('Jl. Pusat', 'a', outlets)).toBe('Jl. A 1');
  });

  it('cabang tanpa alamat, kosong, tak dikenal, atau tanpa cabang: alamat usaha', () => {
    for (const id of ['b', 'c', 'x', null, undefined])
      expect(receiptAddress(' Jl. Pusat ', id, outlets)).toBe('Jl. Pusat');
  });

  it('keduanya tak ada: string kosong', () => {
    expect(receiptAddress(undefined, null, [])).toBe('');
  });
});
