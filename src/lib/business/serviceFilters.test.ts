import { describe, expect, it } from 'vitest';
import {
  compareServices,
  createdRange,
  matchesPayment,
  matchesQuery,
  matchesTechnician,
  stalledDays,
} from './serviceFilters';

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

describe('compareServices', () => {
  it('tiket tuntas yang ditampilkan ikut urutan tanggal, tidak dipaksa ke bawah', () => {
    const closed = { status: 'lunas' as const, pickedUp: true, createdAt: '2026-09-13', finalCost: 9 };
    const old = { status: 'pengerjaan' as const, pickedUp: false, createdAt: '2026-09-01', finalCost: 100 };
    const recent = { status: 'pengerjaan' as const, pickedUp: false, createdAt: '2026-09-12', finalCost: 500 };
    expect([old, closed, recent].sort((a, b) => compareServices(a, b, 'newest'))).toEqual([closed, recent, old]);
    expect([closed, old, recent].sort((a, b) => compareServices(a, b, 'oldest'))).toEqual([old, recent, closed]);
  });
});
