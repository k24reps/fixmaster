import { describe, expect, it } from 'vitest';
import {
  BASE_FONT_DOTS,
  DEFAULT_PAPER_WIDTH,
  charsPerLine,
  dotRemainder,
  dotsToMm,
  dotsToPx,
  normalizePaperWidth,
  pageHeightMm,
  paperSpec,
} from './receiptPaper';

describe('normalizePaperWidth', () => {
  it('hanya 58 dan 80 yang dikenal; nilai lain jatuh ke 58', () => {
    expect(normalizePaperWidth(58)).toBe(58);
    expect(normalizePaperWidth(80)).toBe(80);
    expect(normalizePaperWidth('80')).toBe(80);
    expect(normalizePaperWidth(undefined)).toBe(DEFAULT_PAPER_WIDTH);
    expect(normalizePaperWidth(null)).toBe(58);
    expect(normalizePaperWidth(57)).toBe(58);
    expect(normalizePaperWidth('besar')).toBe(58);
  });
});

describe('paperSpec', () => {
  it('area cetak = lebar head: 384 titik di 58mm, 576 titik di 80mm', () => {
    const a = paperSpec(58);
    const b = paperSpec(80);
    expect(a.printableDots).toBe(384);
    expect(b.printableDots).toBe(576);
    // ~48mm dan ~72mm
    expect(dotsToMm(a.printableDots)).toBeCloseTo(48, 0);
    expect(dotsToMm(b.printableDots)).toBeCloseTo(72, 0);
  });

  it('isi lebih sempit dari area cetak sebesar dua tepi aman, dan selalu di dalam kertas', () => {
    for (const w of [58, 80] as const) {
      const s = paperSpec(w);
      expect(s.contentDots).toBe(s.printableDots - 2 * s.insetDots);
      expect(s.insetDots).toBeGreaterThan(0);
      // kertas lebih lebar daripada head, sisanya tepi fisik yang tak terjangkau
      expect(dotsToMm(s.printableDots)).toBeLessThan(w);
    }
  });
});

describe('charsPerLine', () => {
  it('sekitar 32 huruf di 58mm dan 48 di 80mm pada ukuran dasar', () => {
    expect(charsPerLine(paperSpec(58))).toBe(31);
    expect(charsPerLine(paperSpec(80))).toBe(47);
  });

  it('font yang lebih sempit (Consolas 0,55em) memuat lebih banyak, tak pernah lebih sedikit', () => {
    expect(charsPerLine(paperSpec(58), 0.55)).toBeGreaterThanOrEqual(32);
    expect(charsPerLine(paperSpec(80), 0.55)).toBeGreaterThanOrEqual(48);
  });

  it('ukuran dasar bukan di bawah 20 titik (±9,5px)', () => {
    expect(BASE_FONT_DOTS).toBeGreaterThanOrEqual(20);
    expect(dotsToPx(BASE_FONT_DOTS)).toBeGreaterThan(9.4);
  });
});

describe('dotsToPx', () => {
  it('203 dpi: 1 titik = 96/203 px', () => {
    expect(dotsToPx(203)).toBe(96);
    expect(dotsToPx(20)).toBeCloseTo(9.458, 3);
  });

  it('ukuran hasil konversi jatuh di kelipatan titik', () => {
    expect(dotRemainder(dotsToPx(26))).toBeLessThan(0.01);
    expect(dotRemainder(11.5)).toBeGreaterThan(0.2); // 11,5px = 24,3 titik
  });
});

describe('pageHeightMm', () => {
  it('dibulatkan ke atas plus 1mm supaya baris terakhir tidak lari ke halaman kedua', () => {
    // 500px = 132,29mm → 133 → 134
    expect(pageHeightMm(500)).toBe(134);
    // 96px = 25,4mm → 26 → 27
    expect(pageHeightMm(96)).toBe(27);
  });

  it('cadangan tinggi logo yang belum dimuat ditambahkan sebelum pembulatan', () => {
    expect(pageHeightMm(500, 16)).toBe(Math.ceil((500 * 25.4) / 96 + 16) + 1);
  });

  it('tinggi negatif atau nol tidak menghasilkan halaman bernilai negatif', () => {
    expect(pageHeightMm(-10)).toBe(1);
    expect(pageHeightMm(0)).toBe(1);
  });
});
