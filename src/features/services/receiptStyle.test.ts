import { describe, expect, it } from 'vitest';
import { RECEIPT_MONO_STACK, receiptStyle } from './receiptStyle';
import { dotRemainder, paperSpec } from '@/lib/business/receiptPaper';

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
});
