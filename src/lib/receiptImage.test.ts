import { describe, expect, it } from 'vitest';
import { paperSpec } from '@/lib/business/receiptPaper';
import { DOTS_PER_PX, receiptSvg, thresholdPixels } from './receiptImage';

describe('receiptSvg', () => {
  it('lebar gambar = lebar head printer dalam titik, viewBox dalam px CSS', () => {
    for (const w of [58, 80] as const) {
      const paper = paperSpec(w);
      const svg = receiptSvg('<html xmlns="http://www.w3.org/1999/xhtml"></html>', paper.printablePx, 500);
      expect(svg).toContain(`width="${paper.printableDots}"`);
      expect(svg).toContain(`height="${Math.round(500 * DOTS_PER_PX)}"`);
      expect(svg).toContain(`viewBox="0 0 ${paper.printablePx} 500"`);
      expect(svg).toContain('<foreignObject');
    }
  });
});

describe('thresholdPixels', () => {
  it('hanya hitam atau putih, transparan dianggap kertas putih', () => {
    const px = new Uint8ClampedArray([
      0, 0, 0, 255, // hitam
      90, 90, 90, 255, // abu gelap → hitam
      200, 200, 200, 255, // abu terang → putih
      0, 0, 0, 0, // transparan → putih
      0, 0, 0, 100, // hitam tipis di atas putih → putih
    ]);
    thresholdPixels(px);
    expect([...px]).toEqual([
      0, 0, 0, 255,
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
    ]);
  });
});
