import { describe, expect, it } from 'vitest';
import { RECEIPT_MONO_STACK, receiptStyle } from './receiptStyle';
import { BASE_FONT_DOTS, dotRemainder, dotsToPx, paperSpec } from '@/lib/business/receiptPaper';

describe('receiptStyle', () => {
  it('@page tanpa margin dan selebar gulungan; panjangnya diisi skrip cetak', () => {
    expect(receiptStyle(paperSpec(58))).toContain('@page { size: 58mm 297mm; margin: 0; }');
    expect(receiptStyle(paperSpec(80))).toContain('@page { size: 80mm 297mm; margin: 0; }');
  });

  it('lebar badan = area cetak head, di tengah kertas', () => {
    const css58 = receiptStyle(paperSpec(58));
    const css80 = receiptStyle(paperSpec(80));
    expect(css58).toContain(`width: ${paperSpec(58).printablePx}px`);
    expect(css80).toContain(`width: ${paperSpec(80).printablePx}px`);
    expect(css58).toContain('margin: 0 auto');
  });

  it('font mono sistem yang eksplisit, tanpa webfont yang tak termuat di jendela cetak', () => {
    expect(RECEIPT_MONO_STACK).not.toMatch(/JetBrains/i);
    expect(RECEIPT_MONO_STACK.endsWith('monospace')).toBe(true);
    expect(receiptStyle(paperSpec(58))).toContain(RECEIPT_MONO_STACK);
  });

  it('semua ukuran huruf dan tinggi baris jatuh di kelipatan titik 203 dpi', () => {
    const css = receiptStyle(paperSpec(58));
    const sizes = [...css.matchAll(/(?:font-size|line-height):\s*([\d.]+)px/g)].map((m) =>
      Number(m[1]),
    );
    expect(sizes.length).toBeGreaterThan(5);
    for (const px of sizes) expect(dotRemainder(px), `${px}px`).toBeLessThan(0.02);
  });

  it('sel tabel, catatan, dan kontak boleh patah di mana saja; QR dan baris tak terbelah', () => {
    const css = receiptStyle(paperSpec(58));
    expect(css).toContain('overflow-wrap: anywhere');
    expect(css).toMatch(/\.track \{[^}]*break-inside: avoid/);
    expect(css).toMatch(/tr \{ break-inside: avoid; \}/);
  });

  // Head termal = dua keadaan. Driver berambang 50% menghapus abu-abu: #8a8a8a
  // dan #9a9a9a pernah menghasilkan 0% titik hitam (garis pemisah dan baris
  // atribusi hilang dari kertas). Tak ada literal warna selain hitam dan putih.
  it('semua tinta hitam pekat: tak ada abu-abu yang akan hilang di ambang 50%', () => {
    const css = receiptStyle(paperSpec(58));
    const colors = [...css.matchAll(/#[0-9a-fA-F]{3,6}/g)].map((m) => m[0].toLowerCase());
    expect(colors.length).toBeGreaterThan(2);
    for (const c of colors) expect(['#000', '#fff'], c).toContain(c);
    expect(css).not.toMatch(/color-mix|rgba?\(|opacity:/);
  });

  it('jahitan pemisah hitam pekat setebal 4 titik, bukan garis rambut', () => {
    expect(receiptStyle(paperSpec(58))).toMatch(/\.seam \{[^}]*border-top: 2px dotted #000/);
  });

  it('tak ada teks di bawah huruf dasar 20 titik (±9,5px): terbaca di kertas termal', () => {
    const css = receiptStyle(paperSpec(58));
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => Number(m[1]));
    for (const px of sizes) expect(px, `${px}px`).toBeGreaterThanOrEqual(dotsToPx(BASE_FONT_DOTS) - 0.001);
  });
});
