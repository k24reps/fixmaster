import { describe, expect, it } from 'vitest';
import {
  BASE_FONT_DOTS,
  DEFAULT_PAPER_WIDTH,
  MONO_ADVANCE_EM,
  QR_MODULE_DOTS,
  QR_QUIET_MODULES,
  ROW_GAP_DOTS,
  charsPerLine,
  dotRemainder,
  dotsToMm,
  dotsToPx,
  fitsBeside,
  normalizePaperWidth,
  pageHeightMm,
  paperSpec,
  qrModuleDots,
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

describe('fitsBeside', () => {
  const p58 = paperSpec(58);
  const p80 = paperSpec(80);

  it('label dan nilai pendek berdampingan', () => {
    expect(fitsBeside('Perangkat', 'iPhone 12', p58)).toBe(true);
  });

  it('IMEI ganda (31 huruf) tak pernah berdampingan di 58 mm, tapi tetap utuh sebaris bila ditumpuk', () => {
    expect(fitsBeside('IMEI/SN', '352999112345678/352999112345686', p58)).toBe(false);
    // Ditumpuk, nilainya sendirian di barisnya: 31 huruf = 372 titik dari 376 yang ada.
    expect(31 * BASE_FONT_DOTS * MONO_ADVANCE_EM).toBeLessThanOrEqual(p58.contentDots);
  });

  it('batasnya: jumlah huruf + sela 16 titik + 1 huruf cadangan harus muat di isi', () => {
    // 58 mm: (376 - 16) / 12 = 30 huruf, dikurangi 1 cadangan = 29.
    expect(fitsBeside('a'.repeat(10), 'b'.repeat(19), p58)).toBe(true);
    expect(fitsBeside('a'.repeat(10), 'b'.repeat(20), p58)).toBe(false);
    // 80 mm: (568 - 16) / 12 = 46 huruf, dikurangi 1 cadangan = 45.
    expect(fitsBeside('a'.repeat(10), 'b'.repeat(35), p80)).toBe(true);
    expect(fitsBeside('a'.repeat(10), 'b'.repeat(36), p80)).toBe(false);
  });

  it('kertas lebih lebar memuat lebih banyak berdampingan', () => {
    const label = 'Keluhan';
    const value = 'Layar bergaris saat dilipat';
    expect(fitsBeside(label, value, p58)).toBe(false);
    expect(fitsBeside(label, value, p80)).toBe(true);
  });

  it('huruf besar (26 titik) memuat lebih sedikit huruf', () => {
    expect(fitsBeside('Sudah dibayar (DP)', 'Rp 200.000', p58, 26)).toBe(false);
    expect(fitsBeside('Sisa', 'Rp 200.000', p58, 26)).toBe(true);
  });

  it('sela kolom ikut dihitung: tepat di batas muat, satu titik lebih sempit tidak', () => {
    const glyph = BASE_FONT_DOTS * MONO_ADVANCE_EM;
    // 29 huruf + sela + 1 cadangan = 376 titik di 58 mm: persis penuh.
    expect(29 * glyph + ROW_GAP_DOTS + glyph).toBe(p58.contentDots);
    expect(fitsBeside('a'.repeat(10), 'b'.repeat(19), p58)).toBe(true);
    expect(fitsBeside('a'.repeat(10), 'b'.repeat(19), { ...p58, contentDots: p58.contentDots - 1 })).toBe(false);
  });

  it('jarak huruf label (baris TOTAL) mengurangi jumlah huruf yang muat', () => {
    const label = 'Sudah dibayar (DP)';
    // 18 + 4 huruf di 26 titik: 374,8 dari 376 tanpa jarak, 393,5 dengan jarak 0,04em.
    expect(fitsBeside(label, 'Rp 5', p58, 26)).toBe(true);
    expect(fitsBeside(label, 'Rp 5', p58, 26, 0.04)).toBe(false);
    // TOTAL dengan nominal hampir sembilan digit tetap berdampingan di 58 mm.
    expect(fitsBeside('TOTAL', 'Rp 99.999.999', p58, 26, 0.04)).toBe(true);
  });

  it('menghitung huruf sungguhan, bukan unit UTF-16 (tanda × dan − satu huruf)', () => {
    expect(fitsBeside('Diskon', '−Rp 25.000', p58)).toBe(true);
    // Emoji = dua unit UTF-16 tapi satu huruf.
    expect(fitsBeside('a'.repeat(14), '😀'.repeat(14), p58)).toBe(true);
  });
});

describe('qrModuleDots', () => {
  const p58 = paperSpec(58);
  const p80 = paperSpec(80);
  const side = (modules: number) => modules + 2 * QR_QUIET_MODULES;

  it('kode lacak pendek (versi 4, 33 modul): 6 titik = 0,75 mm, kode ±25 mm di kedua kertas', () => {
    expect(QR_MODULE_DOTS).toBe(6);
    expect(qrModuleDots(33, p58)).toBe(6);
    expect(qrModuleDots(33, p80)).toBe(6);
    expect(dotsToMm(33 * qrModuleDots(33, p58))).toBeGreaterThanOrEqual(24);
  });

  it('alamat lama ?org=&no= (versi 6, 41 modul) tetap 6 titik di 58 mm', () => {
    expect(qrModuleDots(41, p58)).toBe(6);
  });

  it('simbol terbesar (versi 10, 57 modul) turun ke ukuran yang muat, tak pernah meluap', () => {
    expect(qrModuleDots(57, p58)).toBe(4);
    expect(qrModuleDots(57, p80)).toBe(6);
    for (let v = 1; v <= 10; v++) {
      const modules = 17 + 4 * v;
      for (const p of [p58, p80]) expect(side(modules) * qrModuleDots(modules, p), `v${v}`).toBeLessThanOrEqual(p.contentDots);
    }
  });

  it('selalu genap: sisa ruang genap sehingga kode rata-tengah jatuh tepat di titik', () => {
    for (let v = 1; v <= 10; v++) {
      const modules = 17 + 4 * v;
      for (const p of [p58, p80]) {
        const dots = qrModuleDots(modules, p);
        expect(dots % 2, `v${v}`).toBe(0);
        expect((p.contentDots - side(modules) * dots) % 2, `v${v}`).toBe(0);
      }
    }
  });
});
