import { describe, it, expect } from 'vitest';
import {
  normalizePhone,
  findByPhone,
  checkDuplicate,
  matchesCustomer,
  searchCustomers,
  customerServiceStats,
  phoneVariants,
  phoneLookupFilter,
  customerSearchFilter,
} from './customers';
import type { Customer } from '@/data/types';

const mk = (over: Partial<Customer>): Customer => ({
  id: over.id ?? 'c1',
  orgId: 'o1',
  outletId: null,
  name: over.name ?? 'Andi',
  phone: over.phone ?? '08123456789',
  email: '',
  address: '',
  note: '',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('0812-3456-789')).toBe('08123456789');
  });
  it('unifies 62 prefix to 0', () => {
    expect(normalizePhone('+62 812 3456 789')).toBe('08123456789');
    expect(normalizePhone('62812')).toBe('0812');
  });
});

describe('findByPhone', () => {
  const list = [mk({ id: 'c1', phone: '08123456789' })];
  it('matches across formatting differences', () => {
    expect(findByPhone(list, '+62 812-3456-789')?.id).toBe('c1');
  });
  it('excludes a given id', () => {
    expect(findByPhone(list, '08123456789', 'c1')).toBeNull();
  });
});

describe('checkDuplicate', () => {
  const list = [mk({ id: 'c1', name: 'Andi', phone: '08123456789' })];
  it('blocks same phone with different name', () => {
    const r = checkDuplicate(list, { name: 'Budi', phone: '08123456789' });
    expect(r.ok).toBe(false);
  });
  it('blocks same phone with the same name too (would be a second record)', () => {
    const r = checkDuplicate(list, { name: 'Andi', phone: '+62 812-3456-789' });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('sudah terdaftar');
  });
  it('allows editing the record that owns the phone', () => {
    const r = checkDuplicate(list, { id: 'c1', name: 'Andi W', phone: '08123456789' });
    expect(r.ok).toBe(true);
  });
  it('allows a brand new phone', () => {
    const r = checkDuplicate(list, { name: 'Citra', phone: '08999999999' });
    expect(r.ok).toBe(true);
  });
});

describe('customerServiceStats', () => {
  it('menghitung tiket tanpa yang batal, nilai hanya dari Lunas, dan kategori unik', () => {
    const stats = customerServiceStats([
      { customerId: 'c1', status: 'lunas', finalCost: 150000, category: 'Laptop' },
      { customerId: 'c1', status: 'selesai', finalCost: 90000, category: 'Laptop' },
      { customerId: 'c1', status: 'batal', finalCost: 50000, category: 'HP' },
      { customerId: '', status: 'lunas', finalCost: 1, category: 'X' },
    ]);
    expect(stats.get('c1')).toEqual({ count: 2, paidTotal: 150000, categories: ['Laptop', 'HP'] });
    expect(stats.size).toBe(1);
  });
});

describe('matchesCustomer', () => {
  const c = mk({ name: 'Andi Wijaya', phone: '0812-3456-789' });
  it('nama tanpa beda huruf besar; No. HP tanpa peduli pemisah atau awalan 62', () => {
    expect(matchesCustomer(c, 'wijaya')).toBe(true);
    expect(matchesCustomer(c, '08123456')).toBe(true);
    expect(matchesCustomer(c, '+62 812 3456')).toBe(true);
    expect(matchesCustomer(c, '0899')).toBe(false);
    expect(matchesCustomer(c, '   ')).toBe(true);
  });
});

describe('searchCustomers', () => {
  const list = [
    mk({ id: 'c1', name: 'Andi Wijaya', phone: '08123456789' }),
    mk({ id: 'c2', name: 'Budi Santoso', phone: '08987654321' }),
    mk({ id: 'c3', name: 'Andika', phone: '08111222333' }),
    { ...mk({ id: 'c4', name: 'Citra (terhapus)', phone: '08000' }), deletedAt: 'x' },
  ];
  it('returns empty for blank query', () => {
    expect(searchCustomers(list, '   ')).toEqual([]);
  });
  it('matches by name substring, case-insensitive (both Andi* names)', () => {
    const r = searchCustomers(list, 'andi');
    expect(r.map((c) => c.id).sort()).toEqual(['c1', 'c3']);
  });
  it('matches by normalized phone', () => {
    const r = searchCustomers(list, '+62 898');
    expect(r.map((c) => c.id)).toEqual(['c2']);
  });
  it('excludes soft-deleted customers', () => {
    expect(searchCustomers(list, 'Citra')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(searchCustomers(list, 'andi', 1)).toHaveLength(1);
  });
});

describe('phoneVariants / phoneLookupFilter', () => {
  it('menghasilkan kedua bentuk yang normalisasinya sama', () => {
    expect(phoneVariants('0812 3456')).toEqual(['08123456', '628123456']);
    expect(phoneVariants('+62 812-3456')).toEqual(['08123456', '628123456']);
  });

  it('kedua penulisan menghasilkan varian yang identik', () => {
    // Inilah syarat anti-duplikat: dua cara menulis nomor yang sama HARUS
    // menghasilkan himpunan pencarian yang sama, apa pun bentuk simpanannya.
    expect(phoneVariants('+62 812-3456')).toEqual(phoneVariants('0812 3456'));
  });

  it('filter mencakup bentuk 0 DAN 62, bukan salah satu', () => {
    const f = phoneLookupFilter('08123456') ?? '';
    expect(f).toContain('%0%8%1%2%3%4%5%6%');
    expect(f).toContain('%6%2%8%1%2%3%4%5%6%');
  });

  it('nomor kosong tidak menghasilkan filter', () => {
    expect(phoneLookupFilter('')).toBeNull();
    expect(phoneLookupFilter('-')).toBeNull();
    expect(phoneVariants('')).toEqual([]);
  });

  it('filter longgar tetap mencakup nomor yang tersimpan dengan pemisah', () => {
    // Simulasi ilike: pola digit berurutan harus cocok dengan string mentah.
    const toRegExp = (pattern: string) =>
      new RegExp('^' + pattern.replace(/%/g, '.*') + '$', 'i');
    const variants = phoneVariants('0812 3456');
    const stored = ['0812-3456', '+62 812 3456', '628123456', '0812.3456'];
    for (const s of stored) {
      const hit = variants.some((v) => toRegExp('%' + v.split('').join('%') + '%').test(s));
      expect(hit, `tersimpan sebagai "${s}" harus ikut tercakup`).toBe(true);
    }
  });
});

describe('customerSearchFilter', () => {
  it('mencari berdasarkan nama', () => {
    expect(customerSearchFilter('Budi')).toContain('name.ilike."%Budi%"');
  });

  it('kueri angka ikut mencari nomor dalam kedua bentuk', () => {
    const f = customerSearchFilter('0812345') ?? '';
    expect(f).toContain('name.ilike.');
    expect(f).toContain('phone.ilike.');
    expect(f).toContain('%6%2%8%1%2%3%4%5%');
  });

  it('membuang karakter yang merusak sintaks or()', () => {
    const f = customerSearchFilter('a,b(c)*d%e"f') ?? '';
    // Ambil isi pola, lalu lepas `%` pembungkusnya — itu milik sintaks ilike,
    // bukan sisa masukan pengguna.
    const inner = (f.split('name.ilike."')[1] ?? '').split('"')[0].replace(/^%|%$/g, '');
    for (const ch of [',', '(', ')', '*', '%', '"', '\\']) {
      expect(inner, `karakter ${ch} lolos ke pola`).not.toContain(ch);
    }
  });

  it('kueri kosong tidak menghasilkan filter', () => {
    expect(customerSearchFilter('   ')).toBeNull();
  });
});
