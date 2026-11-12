import { describe, expect, it } from 'vitest';
import {
  isServiceReprint,
  receiptAddress,
  reprintStamp,
  saleReceiptModel,
  serviceDocPlan,
  serviceMoney,
  serviceStage,
  stampWithTime,
} from './receiptContent';
import type { Sale, Service, ServiceStatus } from '@/data/types';

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

  it('biaya akhir belum ada: estimasi tetap tampil sebagai informasi, DP-nya di bawah', () => {
    expect(keys(money({ estimateCost: 500000, downPayment: 100000 }))).toEqual(['estimate', 'paidDp']);
  });

  // Dua angka (Estimasi dan Biaya) berdampingan memaksa pelanggan menebak mana
  // yang ditagih. Begitu Biaya ada, hanya Biaya yang tercetak.
  it('biaya akhir ada: estimasi tak ikut tercetak, dengan atau tanpa DP', () => {
    expect(keys(money({ estimateCost: 450000, finalCost: 500000 }))).toEqual(['cost']);
    expect(keys(money({ estimateCost: 450000, finalCost: 500000, downPayment: 100000 }))).toEqual([
      'cost',
      'dp',
      'remaining',
    ]);
    expect(serviceMoney(money({ estimateCost: 450000, finalCost: 500000, downPayment: 100000 })).find((l) => l.emphasis)?.amount).toBe(400000);
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

const ALL_STATUSES: ServiceStatus[] = [
  'diterima',
  'diagnosa',
  'konfirmasi',
  'tunggu',
  'pengerjaan',
  'selesai',
  'lunas',
  'batal',
];

describe('serviceStage', () => {
  const stage = (status: ServiceStatus, pickedUp = false) => serviceStage({ status, pickedUp });

  it('tiap status jatuh ke tahap yang dilihat pelanggan', () => {
    expect(stage('diterima')).toBe('received');
    for (const s of ['diagnosa', 'konfirmasi', 'tunggu', 'pengerjaan'] as const)
      expect(stage(s), s).toBe('working');
    expect(stage('selesai')).toBe('ready');
    expect(stage('batal')).toBe('cancelled');
  });

  // Sama dengan halaman lacak dan nextStepFor: lunas yang belum diambil masih
  // "siap diambil", jadi kertasnya belum boleh berjudul serah terima.
  it('lunas yang belum diambil masih "siap"; sudah diambil = diambil', () => {
    expect(stage('lunas')).toBe('ready');
    expect(stage('lunas', true)).toBe('pickedUp');
  });

  it('bendera pickedUp menang atas status mana pun kecuali batal', () => {
    for (const s of ALL_STATUSES.filter((x) => x !== 'batal')) expect(stage(s, true), s).toBe('pickedUp');
    expect(stage('batal', true)).toBe('cancelled');
  });
});

describe('serviceDocPlan', () => {
  const plan = (status: ServiceStatus, pickedUp = false) => serviceDocPlan({ status, pickedUp });

  it('unit masih di toko (diterima s.d. dikerjakan): tanda terima, tanpa tanda tangan', () => {
    for (const s of ['diterima', 'diagnosa', 'konfirmasi', 'tunggu', 'pengerjaan'] as const) {
      expect(plan(s).kind, s).toBe('intake');
      expect(plan(s).signature, s).toBe(false);
    }
  });

  it('selesai atau lunas yang belum diambil: nota servis biasa', () => {
    expect(plan('selesai').kind).toBe('service');
    expect(plan('lunas').kind).toBe('service');
    expect(plan('selesai').signature).toBe(false);
  });

  it('sudah diambil: serah terima, satu-satunya yang memuat kotak tanda tangan', () => {
    for (const s of ALL_STATUSES.filter((x) => x !== 'batal')) {
      expect(plan(s, true).kind, s).toBe('handover');
      expect(plan(s, true).signature, s).toBe(true);
    }
    const signed = ALL_STATUSES.flatMap((s) => [plan(s), plan(s, true)]).filter((p) => p.signature);
    expect(signed.every((p) => p.kind === 'handover')).toBe(true);
  });

  it('tiket batal: judul netral, tanpa tanda tangan, walau pickedUp menyala', () => {
    for (const pickedUp of [false, true]) {
      const p = plan('batal', pickedUp);
      expect(p).toEqual({ stage: 'cancelled', kind: 'service', signature: false });
    }
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

describe('isServiceReprint', () => {
  const plan = (status: ServiceStatus, pickedUp = false) => serviceDocPlan({ status, pickedUp });

  it('cetakan pertama, atau jejak belum termuat, bukan cetak ulang', () => {
    expect(isServiceReprint(null, plan('diterima'))).toBe(false);
    expect(isServiceReprint(undefined, plan('diterima'))).toBe(false);
    expect(isServiceReprint({ lastPrintedKind: null }, plan('diterima'))).toBe(false);
  });

  it('dokumen berjenis sama yang dicetak lagi adalah salinan', () => {
    expect(isServiceReprint({ lastPrintedKind: 'intake' }, plan('diterima'))).toBe(true);
    expect(isServiceReprint({ lastPrintedKind: 'service' }, plan('selesai'))).toBe(true);
    expect(isServiceReprint({ lastPrintedKind: 'handover' }, plan('lunas', true))).toBe(true);
  });

  // Tiket yang naik tahap mencetak dokumen baru (tanda terima → nota → serah
  // terima); itu cetakan pertama dokumen tersebut, bukan salinan.
  it('dokumen tahap berikutnya bukan cetak ulang', () => {
    expect(isServiceReprint({ lastPrintedKind: 'intake' }, plan('selesai'))).toBe(false);
    expect(isServiceReprint({ lastPrintedKind: 'service' }, plan('lunas', true))).toBe(false);
  });

  it('kertas batal tak pernah diberi penanda salinan', () => {
    expect(isServiceReprint({ lastPrintedKind: 'service' }, plan('batal'))).toBe(false);
  });
});

describe('reprintStamp', () => {
  it('tanggal dan jam lokal, format yang sama dengan struk POS', () => {
    expect(reprintStamp(new Date(2026, 10, 12, 9, 5))).toBe('12 Nov 2026 09:05');
  });
});
