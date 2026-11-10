import { describe, expect, it } from 'vitest';
import { SERVICE_COLUMNS, resolveServiceColumns } from './serviceColumns';
import { isClosedOut } from './services';
import { id as idDict } from '@/i18n/id';
import { en as enDict } from '@/i18n/en';

describe('SERVICE_COLUMNS', () => {
  it('membawa kunci i18n, bukan teks: setiap label & petunjuk ada di id dan en', () => {
    for (const c of SERVICE_COLUMNS) {
      expect(c).not.toHaveProperty('label');
      expect(c).not.toHaveProperty('hint');
      for (const key of [c.labelKey, c.hintKey]) {
        expect(idDict[key], `id: ${key}`).toBeTruthy();
        expect(enDict[key], `en: ${key}`).toBeTruthy();
      }
    }
  });

  it('label kolom = judul kolom di Daftar (kunci services.col*), bukan salinan teksnya', () => {
    expect(SERVICE_COLUMNS.map((c) => c.labelKey)).toEqual([
      'services.colCustomer',
      'services.colDevice',
      'services.colComplaint',
      'services.colFix',
      'services.colTech',
      'services.colCost',
    ]);
  });

  it('petunjuk Indonesia tak berubah dari teks lama (pengaturan tetap terbaca sama)', () => {
    expect(SERVICE_COLUMNS.map((c) => idDict[c.hintKey])).toEqual([
      'Nama dan nomor HP',
      'Perangkat, kategori, dan status ambil',
      'Keluhan saat unit diterima',
      'Tindakan perbaikan, wajib saat status Selesai',
      'Teknisi yang menangani',
      'Biaya final, plus modal dan profit untuk pemilik',
    ]);
  });
});

describe('resolveServiceColumns', () => {
  it('belum pernah diatur → semua kolom tampil', () => {
    expect(resolveServiceColumns(undefined)).toEqual([
      'customer',
      'device',
      'complaint',
      'completionNote',
      'technician',
      'cost',
    ]);
  });

  it('membuang id usang dan memakai urutan tetap, bukan urutan simpan', () => {
    expect(resolveServiceColumns(['cost', 'kolomLama', 'customer'])).toEqual(['customer', 'cost']);
  });

  it('daftar kosong tetap dihormati (hanya kolom wajib yang tampil)', () => {
    expect(resolveServiceColumns([])).toEqual([]);
  });
});

describe('isClosedOut', () => {
  it('hanya lunas/batal yang SUDAH diambil yang turun ke dasar daftar', () => {
    expect(isClosedOut({ status: 'lunas', pickedUp: true })).toBe(true);
    expect(isClosedOut({ status: 'batal', pickedUp: true })).toBe(true);
    expect(isClosedOut({ status: 'lunas', pickedUp: false })).toBe(false);
    expect(isClosedOut({ status: 'selesai', pickedUp: true })).toBe(false);
  });
});
