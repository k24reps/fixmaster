import { describe, it, expect } from 'vitest';
import {
  roleAllows,
  isManager,
  isOwner,
  planAllows,
  withinOutletQuota,
  withinWalletQuota,
  outletTierFor,
  priceForOutlets,
  PLANS,
  BILLING_TERMS,
  BILLING_TERM_IDS,
  monthlyRateForTerm,
  totalForTerm,
  savingForTerm,
  PAID_TIERS,
  PRO_BASE_PRICE,
  PRO_INCLUDED_OUTLETS,
} from './plans';

describe('roleAllows', () => {
  it('owner can do everything', () => {
    expect(roleAllows('owner', '*')).toBe(true);
    expect(roleAllows('owner', 'finance.view')).toBe(true);
    expect(roleAllows('owner', 'reports.view')).toBe(true);
    expect(roleAllows('owner', 'anything.at.all')).toBe(true);
  });

  it('admin has operational + financial read, but NOT reports (owner-only) nor the owner wildcard', () => {
    expect(roleAllows('admin', 'finance.view')).toBe(true);
    expect(roleAllows('admin', 'reports.view')).toBe(false);
    expect(roleAllows('admin', 'services.write')).toBe(true);
    expect(roleAllows('admin', '*')).toBe(false);
  });

  it('karyawan cannot view finance/reports', () => {
    expect(roleAllows('karyawan', 'finance.view')).toBe(false);
    expect(roleAllows('karyawan', 'reports.view')).toBe(false);
  });

  it('karyawan keeps scoped operational writes', () => {
    expect(roleAllows('karyawan', 'services.write')).toBe(true);
    expect(roleAllows('karyawan', 'pos.sell')).toBe(true);
    expect(roleAllows('karyawan', 'attendance.self')).toBe(true);
    // but not org-wide attendance write
    expect(roleAllows('karyawan', 'attendance.write')).toBe(false);
  });
});

describe('isManager', () => {
  it('is true for owner and admin only', () => {
    expect(isManager('owner')).toBe(true);
    expect(isManager('admin')).toBe(true);
    expect(isManager('karyawan')).toBe(false);
  });
});

describe('isOwner', () => {
  it('is true for owner only', () => {
    expect(isOwner('owner')).toBe(true);
    expect(isOwner('admin')).toBe(false);
    expect(isOwner('karyawan')).toBe(false);
  });
});

describe('planAllows', () => {
  // Sumbu pembedanya cuma satu: jumlah ORANG dan jumlah TEMPAT. Empat fitur
  // inilah yang benar-benar berkorelasi dengan itu; sisanya milik Solo juga.
  const PRO_ONLY = ['suppliers', 'attendance', 'multiOutlet', 'waTemplates'] as const;
  // Pernah terkunci, lalu sengaja dibuka: logo (identitas toko di dokumen yang
  // dipegang pelanggan), tasks (justru dibutuhkan yang bekerja sendirian), dan
  // exportImport (mengunci portabilitas data itu retensi, bukan nilai).
  const SOLO_INCLUDED = [
    'services',
    'customers',
    'pos',
    'inventory',
    'finance',
    'reports',
    'tasks',
    'logo',
    'exportImport',
  ] as const;

  it('Solo hanya kehilangan fitur yang menuntut lebih dari satu orang atau tempat', () => {
    for (const f of PRO_ONLY) {
      expect(planAllows('standard', f), f).toBe(false);
    }
    for (const f of SOLO_INCLUDED) {
      expect(planAllows('standard', f), f).toBe(true);
    }
  });

  it('Pro membuka semua yang tidak dimiliki Solo', () => {
    for (const f of PRO_ONLY) {
      expect(planAllows('enterprise', f), f).toBe(true);
    }
  });

  // Menahan dua daftar di atas tetap menyeluruh: kalau ada Feature baru
  // ditambahkan dan lupa ditempatkan, tes ini yang jatuh lebih dulu.
  it('setiap fitur terdaftar di salah satu dari dua kelompok', () => {
    const covered = new Set<string>([...PRO_ONLY, ...SOLO_INCLUDED]);
    for (const f of PLANS.enterprise.features) {
      expect(covered.has(f), `fitur "${f}" belum ditempatkan di tes paket`).toBe(true);
    }
  });
});

// Kuota wallet dideklarasikan sejak awal tapi baru ditegakkan sekarang;
// tesnya menjaga angkanya tetap punya arti.
describe('withinWalletQuota', () => {
  it('Solo berhenti di 2 wallet, Pro praktis tak terbatas', () => {
    expect(withinWalletQuota('standard', 2)).toBe(true);
    expect(withinWalletQuota('standard', 3)).toBe(false);
    expect(withinWalletQuota('enterprise', 99)).toBe(true);
    expect(withinWalletQuota('enterprise', 100)).toBe(false);
  });

  it('Suspended tidak boleh menambah wallet sama sekali', () => {
    expect(withinWalletQuota('suspended', 1)).toBe(false);
  });
});

describe('plan user quota', () => {
  it('Solo is single-user; Pro is unlimited', () => {
    expect(PLANS.standard.maxUsers).toBe(1);
    expect(PLANS.enterprise.maxUsers).toBe(-1);
  });
});

describe('outlet quota helpers', () => {
  it('Solo fits 1 outlet, not 2; Pro is unlimited', () => {
    expect(withinOutletQuota('standard', 1)).toBe(true);
    expect(withinOutletQuota('standard', 2)).toBe(false);
    expect(withinOutletQuota('enterprise', 50)).toBe(true);
  });
  it('suggests cheapest tier that fits; Pro now covers any count', () => {
    expect(outletTierFor(1)).toBe('standard');
    expect(outletTierFor(5)).toBe('enterprise');
    expect(outletTierFor(999)).toBe('enterprise');
  });
});

describe('priceForOutlets (Pro per-outlet add-on)', () => {
  it('includes 2 outlets in the base price', () => {
    expect(priceForOutlets(1)).toBe(199000);
    expect(priceForOutlets(2)).toBe(199000);
  });
  it('adds Rp50rb per extra outlet', () => {
    expect(priceForOutlets(3)).toBe(249000);
    expect(priceForOutlets(4)).toBe(299000);
  });
  it('caps at the Rp349rb ceiling', () => {
    expect(priceForOutlets(5)).toBe(349000);
    expect(priceForOutlets(100)).toBe(349000);
  });
});

// priceMonthly kini sumber tunggal semua perhitungan; priceLabel hanya
// tampilan. Keduanya dulu satu string yang diurai ulang di dua tempat.
describe('harga paket', () => {
  it('priceLabel dan priceMonthly menyebut angka yang sama', () => {
    for (const id of PAID_TIERS) {
      const def = PLANS[id];
      const fromLabel = Number(def.priceLabel.replace(/[^0-9]/g, ''));
      expect(def.priceMonthly, def.name).toBe(fromLabel);
    }
  });

  it('harga dasar Pro cocok dengan PRO_BASE_PRICE', () => {
    expect(PLANS.enterprise.priceMonthly).toBe(PRO_BASE_PRICE);
    expect(priceForOutlets(PRO_INCLUDED_OUTLETS)).toBe(PLANS.enterprise.priceMonthly);
  });
});

describe('termin berlangganan', () => {
  // Tangga tarifnya harus terbaca sekali lihat: 99 / 89 / 79 dan 199 / 179 / 159.
  it('menurunkan tarif bulanan ke angka ribuan yang bulat', () => {
    expect(monthlyRateForTerm(99_000, 'monthly')).toBe(99_000);
    expect(monthlyRateForTerm(99_000, 'semiannual')).toBe(89_000);
    expect(monthlyRateForTerm(99_000, 'annual')).toBe(79_000);
    expect(monthlyRateForTerm(199_000, 'semiannual')).toBe(179_000);
    expect(monthlyRateForTerm(199_000, 'annual')).toBe(159_000);
  });

  it('total di muka = tarif termin × jumlah bulan', () => {
    expect(totalForTerm(99_000, 'semiannual')).toBe(534_000);
    expect(totalForTerm(99_000, 'annual')).toBe(948_000);
    expect(totalForTerm(199_000, 'semiannual')).toBe(1_074_000);
    expect(totalForTerm(199_000, 'annual')).toBe(1_908_000);
  });

  it('penghematan dihitung terhadap bayar bulanan selama durasi yang sama', () => {
    expect(savingForTerm(99_000, 'monthly')).toBe(0);
    expect(savingForTerm(99_000, 'semiannual')).toBe(60_000);
    expect(savingForTerm(99_000, 'annual')).toBe(240_000);
    expect(savingForTerm(199_000, 'annual')).toBe(480_000);
  });

  // Satu aturan untuk semua harga: add-on outlet Pro ikut terdiskon tanpa
  // tabel harga kedua yang bisa melenceng.
  it('add-on outlet ikut terdiskon lewat aturan yang sama', () => {
    const fourOutlets = priceForOutlets(4); // 199rb + 2 x 50rb
    expect(fourOutlets).toBe(299_000);
    expect(monthlyRateForTerm(fourOutlets, 'annual')).toBe(239_000);
    expect(totalForTerm(fourOutlets, 'annual')).toBe(2_868_000);
  });

  // Termin makin panjang, tagihan makin besar — peringatannya harus makin awal.
  it('masa peringatan ikut memanjang bersama termin', () => {
    const days = BILLING_TERM_IDS.map((id) => BILLING_TERMS[id].reminderDays);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(BILLING_TERMS.monthly.reminderDays).toBeLessThan(
      BILLING_TERMS.annual.reminderDays,
    );
  });

  it('diskonnya monoton: makin panjang tidak pernah lebih mahal per bulan', () => {
    for (const price of [99_000, 199_000, 299_000, 349_000]) {
      const rates = BILLING_TERM_IDS.map((id) => monthlyRateForTerm(price, id));
      expect(rates).toEqual([...rates].sort((a, b) => b - a));
    }
  });
});
