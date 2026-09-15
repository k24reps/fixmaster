import { describe, expect, it } from 'vitest';
import {
  isUnfinished,
  overpaidAmount,
  overpaidRefundDescription,
  visibleServices,
} from './services';

describe('hitungan status & arsip', () => {
  it('"belum selesai" tidak memasukkan Selesai, Lunas, atau Batal', () => {
    expect(['diterima', 'diagnosa', 'konfirmasi', 'tunggu', 'pengerjaan'].every((s) => isUnfinished(s as never))).toBe(true);
    expect(isUnfinished('selesai')).toBe(false);
    expect(isUnfinished('lunas')).toBe(false);
    expect(isUnfinished('batal')).toBe(false);
  });

  it('tiket yang diarsipkan disembunyikan', () => {
    const rows = [{ id: 'a', archived: false }, { id: 'b', archived: true }];
    expect(visibleServices(rows).map((r) => r.id)).toEqual(['a']);
  });
});

describe('kelebihan DP', () => {
  it('selisih DP di atas biaya final; 0 bila DP tidak melebihi', () => {
    expect(overpaidAmount(250000, 300000)).toBe(50000);
    expect(overpaidAmount(300000, 300000)).toBe(0);
    expect(overpaidAmount(400000, 100000)).toBe(0);
  });

  it('deskripsi refund baku (dicocokkan server supaya tidak tercatat dua kali)', () => {
    expect(overpaidRefundDescription('FM-0007')).toBe('Refund kelebihan DP servis FM-0007');
  });
});
