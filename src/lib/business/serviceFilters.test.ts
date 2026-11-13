import { describe, expect, it } from 'vitest';
import {
  SERVICE_SORTS,
  SORT_LABEL_KEY,
  STATUS_FLOW,
  compareServices,
  costReadout,
  createdRange,
  listedCost,
  matchesPayment,
  SERVICE_SCOPES,
  matchesQuery,
  matchesScope,
  matchesTechnician,
  nextSort,
  scopeCounts,
  serviceSearchFilter,
  sortDirectionOn,
  stalledDays,
  type ServiceScope,
  type ServiceSort,
} from './serviceFilters';
import { STATUS_LABELS } from './services';
import { id as idDict } from '@/i18n/id';
import { en as enDict } from '@/i18n/en';

describe('serviceSearchFilter', () => {
  it('kosong → null; karakter sintaks filter dibuang; nomor HP juga dicocokkan per digit', () => {
    expect(serviceSearchFilter('   ')).toBeNull();
    expect(serviceSearchFilter('a),outlet_id.is.null')).not.toMatch(/[()]/);
    expect(serviceSearchFilter('0812-3456')).toContain('customer_phone.ilike."%0%8%1%2%3%4%5%6%"');
    expect(serviceSearchFilter('reno')).not.toContain('%r%e%');
  });
});

const svc = {
  serviceNo: 'FM-0007',
  customerName: 'Andi Pratama',
  device: 'Oppo Reno 8',
  complaint: 'Tidak mengisi daya',
  customerPhone: '081234567890',
};

describe('matchesQuery', () => {
  it('mencocokkan nomor HP tanpa peduli tanda baca, dan isi keluhan', () => {
    expect(matchesQuery(svc, '0812-3456')).toBe(true);
    expect(matchesQuery(svc, 'mengisi daya')).toBe(true);
    expect(matchesQuery(svc, 'reno')).toBe(true);
  });

  it('kueri no. servis tidak ikut mencocokkan digit di nomor HP', () => {
    expect(matchesQuery({ ...svc, serviceNo: 'FM-0002' }, 'FM-3456')).toBe(false);
  });
});

describe('matchesTechnician', () => {
  const people = [{ id: 'e1', name: 'Rizal Pratama' }];
  const me = { id: 'e1', name: 'Rizal Pratama' };
  it('memakai id bila ada, nama sebagai cadangan, dan "belum ditugaskan"', () => {
    expect(matchesTechnician({ technicianId: 'e1', technicianName: '' }, 'e1', people, me)).toBe(true);
    expect(matchesTechnician({ technicianId: null, technicianName: 'Rizal Pratama' }, 'me', people, me)).toBe(true);
    expect(matchesTechnician({ technicianId: 'e2', technicianName: 'Rizal Pratama' }, 'e1', people, me)).toBe(false);
    expect(matchesTechnician({ technicianId: null, technicianName: '' }, 'none', people, me)).toBe(true);
  });
});

describe('matchesPayment', () => {
  it('belum lunas, sudah DP, dan lunas', () => {
    expect(matchesPayment({ status: 'pengerjaan', downPayment: 0 }, 'unpaid')).toBe(true);
    expect(matchesPayment({ status: 'batal', downPayment: 100 }, 'unpaid')).toBe(false);
    expect(matchesPayment({ status: 'pengerjaan', downPayment: 200_000 }, 'dp')).toBe(true);
    expect(matchesPayment({ status: 'pengerjaan', downPayment: 0 }, 'dp')).toBe(false);
    expect(matchesPayment({ status: 'lunas', downPayment: 200_000 }, 'dp')).toBe(false);
  });
});

describe('createdRange', () => {
  it('7 hari terakhir inklusif, bulan berjalan, dan rentang custom yang terbalik ditukar', () => {
    expect(createdRange('last7', '2026-09-13', { from: '', to: '' })).toEqual({ from: '2026-09-07', to: '2026-09-13' });
    expect(createdRange('thisMonth', '2026-09-13', { from: '', to: '' })).toEqual({ from: '2026-09-01', to: '2026-09-13' });
    expect(createdRange('custom', '2026-09-13', { from: '2026-09-10', to: '2026-09-01' })).toEqual({
      from: '2026-09-01',
      to: '2026-09-10',
    });
    expect(createdRange('custom', '2026-09-13', { from: '2026-09-10', to: '' })).toBeNull();
  });
});

describe('stalledDays', () => {
  const at = (date: string) => `${date}T10:00:00`;
  it('ambang per keadaan: konfirmasi 2, dikerjakan 3, belum diambil 7 hari', () => {
    expect(stalledDays({ status: 'konfirmasi', pickedUp: false, updatedAt: at('2026-09-11') }, '2026-09-13')).toBe(2);
    expect(stalledDays({ status: 'pengerjaan', pickedUp: false, updatedAt: at('2026-09-11') }, '2026-09-13')).toBeNull();
    expect(stalledDays({ status: 'pengerjaan', pickedUp: false, updatedAt: at('2026-09-10') }, '2026-09-13')).toBe(3);
    expect(stalledDays({ status: 'lunas', pickedUp: false, updatedAt: at('2026-09-04') }, '2026-09-13')).toBe(9);
    expect(stalledDays({ status: 'lunas', pickedUp: true, updatedAt: at('2026-09-04') }, '2026-09-13')).toBeNull();
  });
});

describe('lingkup daftar (Semua / Belum tuntas / Tertahan)', () => {
  const today = '2026-09-13';
  const at = (date: string) => `${date}T10:00:00`;
  const tickets = {
    // Arsip: lunas/batal DAN sudah diambil, walau sudah lama tanpa aktivitas.
    arsipLunas: { status: 'lunas', pickedUp: true, updatedAt: at('2026-08-01') },
    arsipBatal: { status: 'batal', pickedUp: true, updatedAt: at('2026-08-01') },
    // Belum tuntas tapi tidak tertahan.
    baru: { status: 'diterima', pickedUp: false, updatedAt: at('2026-09-13') },
    lunasBelumDiambil: { status: 'lunas', pickedUp: false, updatedAt: at('2026-09-12') },
    // Tertahan.
    konfirmasiLama: { status: 'konfirmasi', pickedUp: false, updatedAt: at('2026-09-10') },
    batalBelumDiambil: { status: 'batal', pickedUp: false, updatedAt: at('2026-09-01') },
  } as const;
  const shown = (scope: ServiceScope) =>
    Object.entries(tickets)
      .filter(([, s]) => matchesScope(s, scope, today))
      .map(([k]) => k);

  it('bertingkat: Semua ⊃ Belum tuntas ⊃ Tertahan', () => {
    expect(shown('all')).toHaveLength(6);
    expect(shown('open')).toEqual(['baru', 'lunasBelumDiambil', 'konfirmasiLama', 'batalBelumDiambil']);
    expect(shown('stalled')).toEqual(['konfirmasiLama', 'batalBelumDiambil']);
    for (const k of shown('stalled')) expect(shown('open')).toContain(k);
  });

  it('angka sakelar = jumlah yang tampil di posisi itu; arsip = sisanya', () => {
    const list = Object.values(tickets);
    const counts = scopeCounts(list, today);
    expect(counts).toEqual({ open: shown('open').length, stalled: shown('stalled').length, closed: 2 });
    expect(counts.open + counts.closed).toBe(list.length);
    expect(scopeCounts([], today)).toEqual({ open: 0, stalled: 0, closed: 0 });
  });

  it('urutan sakelar tetap: Semua, Belum tuntas, Tertahan', () => {
    expect(SERVICE_SCOPES).toEqual(['all', 'open', 'stalled']);
  });
});

type SortRow = Parameters<typeof compareServices>[0] & { tag: string };
const row = (tag: string, o: Partial<SortRow> = {}): SortRow => ({
  tag,
  createdAt: '2026-09-05',
  customerName: 'Budi',
  status: 'diterima',
  finalCost: 0,
  estimateCost: 0,
  downPayment: 0,
  ...o,
});
const order = (rows: SortRow[], sort: ServiceSort) =>
  [...rows].sort((a, b) => compareServices(a, b, sort)).map((r) => r.tag);

describe('compareServices', () => {
  it('tiket tuntas yang ditampilkan ikut urutan tanggal, tidak dipaksa ke bawah', () => {
    const closed = row('closed', { status: 'lunas', createdAt: '2026-09-13', finalCost: 9 });
    const old = row('old', { status: 'pengerjaan', createdAt: '2026-09-01', finalCost: 100 });
    const recent = row('recent', { status: 'pengerjaan', createdAt: '2026-09-12', finalCost: 500 });
    expect(order([old, closed, recent], 'newest')).toEqual(['closed', 'recent', 'old']);
    expect(order([closed, old, recent], 'oldest')).toEqual(['old', 'recent', 'closed']);
  });

  it('pelanggan: A-Z tak peduli huruf besar/aksen dan angka dibaca sebagai angka; Z-A membaliknya', () => {
    const rows = [
      row('budi', { customerName: 'budi' }),
      row('Andi', { customerName: 'Andi' }),
      row('Toko 10', { customerName: 'Toko 10' }),
      row('Toko 9', { customerName: 'Toko 9' }),
      row('Édo', { customerName: 'Édo' }),
    ];
    expect(order(rows, 'customerAsc')).toEqual(['Andi', 'budi', 'Édo', 'Toko 9', 'Toko 10']);
    expect(order(rows, 'customerDesc')).toEqual(['Toko 10', 'Toko 9', 'Édo', 'budi', 'Andi']);
  });

  it('nama pelanggan kosong selalu di dasar, apa pun arahnya', () => {
    const rows = [row('kosong', { customerName: '  ' }), row('Zed', { customerName: 'Zed' }), row('Ani', { customerName: 'Ani' })];
    expect(order(rows, 'customerAsc')).toEqual(['Ani', 'Zed', 'kosong']);
    expect(order(rows, 'customerDesc')).toEqual(['Zed', 'Ani', 'kosong']);
  });

  it('status: mengikuti alur kerja, bukan abjad; Batal di ujung akhir', () => {
    const rows = STATUS_FLOW.map((status) => row(status, { status })).reverse();
    expect(order(rows, 'statusAsc')).toEqual([...STATUS_FLOW]);
    expect(order(rows, 'statusDesc')).toEqual([...STATUS_FLOW].reverse());
  });

  it('STATUS_FLOW memuat setiap status tepat sekali (status baru tak bisa terlewat)', () => {
    expect([...STATUS_FLOW].sort()).toEqual(Object.keys(STATUS_LABELS).sort());
    expect(new Set(STATUS_FLOW).size).toBe(STATUS_FLOW.length);
  });

  it('biaya: yang diurutkan adalah nominal yang tampil (final, atau estimasi bila final belum ada)', () => {
    const rows = [
      row('final 500', { finalCost: 500, estimateCost: 100 }),
      row('estimasi 300', { finalCost: 0, estimateCost: 300 }),
      row('final 50', { finalCost: 50 }),
    ];
    expect(listedCost(rows[0])).toBe(500);
    expect(listedCost(rows[1])).toBe(300);
    expect(order(rows, 'costAsc')).toEqual(['final 50', 'estimasi 300', 'final 500']);
    expect(order(rows, 'costDesc')).toEqual(['final 500', 'estimasi 300', 'final 50']);
  });

  it('tiket batal: kolom Biaya = DP ditahan (biaya cek), bukan estimasi atau biaya final', () => {
    const batal = (refund: number | undefined, o: Partial<SortRow> = {}) =>
      row('batal', {
        status: 'batal',
        estimateCost: 300,
        history: [{ at: '2026-09-05', status: 'batal', by: 'e', byName: 'A', note: 'Batal', internal: false, refund }],
        ...o,
      });
    // Biaya cek 50 rb tanpa DP sebelumnya: cancel_service menambahkannya ke DP.
    expect(costReadout(batal(0, { downPayment: 50 }))).toEqual({ kind: 'kept', amount: 50 });
    // DP 100 rb, refund 50 rb: toko menahan 50 rb.
    expect(costReadout(batal(50, { downPayment: 100, finalCost: 400 }))).toEqual({ kind: 'kept', amount: 50 });
    // DP dikembalikan penuh, atau tak ada DP: kosong, estimasinya tidak ikut tampil.
    expect(costReadout(batal(100, { downPayment: 100 }))).toEqual({ kind: 'none', amount: 0 });
    expect(costReadout(batal(0))).toEqual({ kind: 'none', amount: 0 });
    // Tiket lama tanpa catatan refund: DP ditahan tak diketahui.
    expect(costReadout(batal(undefined, { downPayment: 100 }))).toEqual({ kind: 'none', amount: 0 });
    expect(costReadout(row('final', { finalCost: 500 })).kind).toBe('final');
    expect(costReadout(row('est', { estimateCost: 300 })).kind).toBe('estimate');
  });

  it('urutan Biaya memakai DP ditahan tiket batal', () => {
    const cek = row('batal cek 80', {
      status: 'batal',
      downPayment: 80,
      history: [{ at: '2026-09-05', status: 'batal', by: 'e', byName: 'A', note: 'Batal', internal: false, refund: 0 }],
    });
    const rows = [row('final 50', { finalCost: 50 }), cek, row('final 100', { finalCost: 100 })];
    expect(order(rows, 'costAsc')).toEqual(['final 50', 'batal cek 80', 'final 100']);
  });

  it('biaya kosong (0) selalu di dasar: "tanpa biaya" bukan yang termurah', () => {
    const rows = [row('kosong'), row('100', { finalCost: 100 }), row('900', { finalCost: 900 })];
    expect(order(rows, 'costAsc')).toEqual(['100', '900', 'kosong']);
    expect(order(rows, 'costDesc')).toEqual(['900', '100', 'kosong']);
  });

  it('seri jatuh ke Terbaru, apa pun urutan masuknya', () => {
    const a = row('lama', { customerName: 'Sama', status: 'diagnosa', finalCost: 10, createdAt: '2026-09-01' });
    const b = row('baru', { customerName: 'Sama', status: 'diagnosa', finalCost: 10, createdAt: '2026-09-09' });
    for (const sort of ['customerAsc', 'customerDesc', 'statusAsc', 'statusDesc', 'costAsc', 'costDesc'] as const) {
      expect(order([a, b], sort), sort).toEqual(['baru', 'lama']);
      expect(order([b, a], sort), sort).toEqual(['baru', 'lama']);
    }
  });

  it('nilai urutan asing jatuh ke Terbaru, tak melempar', () => {
    const rows = [row('lama', { createdAt: '2026-09-01' }), row('baru', { createdAt: '2026-09-09' })];
    expect(order(rows, 'acak' as ServiceSort)).toEqual(['baru', 'lama']);
  });
});

describe('judul kolom: nextSort dan sortDirectionOn', () => {
  it('Pelanggan/Status/Biaya: naik → turun → kembali ke Terbaru', () => {
    expect(nextSort('newest', 'customer')).toBe('customerAsc');
    expect(nextSort('customerAsc', 'customer')).toBe('customerDesc');
    expect(nextSort('customerDesc', 'customer')).toBe('newest');
    expect(nextSort('oldest', 'status')).toBe('statusAsc');
    expect(nextSort('statusDesc', 'status')).toBe('newest');
    expect(nextSort('costAsc', 'cost')).toBe('costDesc');
  });

  it('klik kolom lain selalu mulai dari klik pertama kolom itu, bukan melanjutkan siklus lama', () => {
    expect(nextSort('customerDesc', 'cost')).toBe('costAsc');
    expect(nextSort('statusAsc', 'customer')).toBe('customerAsc');
    expect(nextSort('costAsc', 'date')).toBe('newest');
  });

  it('No. Servis hanya Terbaru ⇄ Terlama (tanggal tak punya "tanpa urutan")', () => {
    expect(nextSort('newest', 'date')).toBe('oldest');
    expect(nextSort('oldest', 'date')).toBe('newest');
  });

  it('arah per kolom: tanggal Terbaru = menurun; kolom lain klik pertama = menaik; selain itu none', () => {
    expect(sortDirectionOn('newest', 'date')).toBe('descending');
    expect(sortDirectionOn('oldest', 'date')).toBe('ascending');
    expect(sortDirectionOn('customerAsc', 'customer')).toBe('ascending');
    expect(sortDirectionOn('costDesc', 'cost')).toBe('descending');
    expect(sortDirectionOn('customerAsc', 'cost')).toBe('none');
    expect(sortDirectionOn('newest', 'status')).toBe('none');
  });

  it('SERVICE_SORTS = tepat nilai yang dikenal nextSort + teksnya; tiap nilai punya label', () => {
    const reachable = new Set<ServiceSort>(['newest']);
    for (const column of ['date', 'customer', 'status', 'cost'] as const) {
      for (const from of SERVICE_SORTS) reachable.add(nextSort(from, column));
    }
    expect([...reachable].sort()).toEqual([...SERVICE_SORTS].sort());
    expect(Object.keys(SORT_LABEL_KEY).sort()).toEqual([...SERVICE_SORTS].sort());
    for (const sort of SERVICE_SORTS) {
      expect(idDict[SORT_LABEL_KEY[sort]], `id: ${sort}`).toBeTruthy();
      expect(enDict[SORT_LABEL_KEY[sort]], `en: ${sort}`).toBeTruthy();
    }
  });
});
