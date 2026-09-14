import { describe, expect, it } from 'vitest';
import { resolveServiceColumns } from './serviceColumns';
import { isClosedOut } from './services';

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
