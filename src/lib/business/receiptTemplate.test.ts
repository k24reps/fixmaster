import { describe, expect, it } from 'vitest';
import { cleanReceiptText, resolveReceiptSettings, RECEIPT_TEXT_MAX } from './receiptTemplate';

describe('resolveReceiptSettings: bawaan = kertas lama', () => {
  it.each([undefined, null, 'bukan objek', 42, []])('masukan asing %p jatuh ke bawaan', (raw) => {
    expect(resolveReceiptSettings(raw)).toEqual({
      paperWidth: 58,
      header: '',
      footer: '',
      serviceTerms: '',
      saleTerms: '',
      showQr: true,
      showTrackUrl: true,
      showImei: true,
      showTechnician: false,
      showTime: false,
    });
  });

  it('yang dulu tercetak hanya mati bila persis false; yang dulu tak ada hanya hidup bila persis true', () => {
    const r = resolveReceiptSettings({
      showQr: 0,
      showTrackUrl: 'false',
      showImei: false,
      showTechnician: 'true',
      showTime: 1,
    });
    expect(r.showQr).toBe(true);
    expect(r.showTrackUrl).toBe(true);
    expect(r.showImei).toBe(false);
    expect(r.showTechnician).toBe(false);
    expect(r.showTime).toBe(false);
    expect(resolveReceiptSettings({ showTechnician: true, showTime: true })).toMatchObject({
      showTechnician: true,
      showTime: true,
    });
  });

  it('lebar kertas ikut normalizePaperWidth', () => {
    expect(resolveReceiptSettings({ paperWidth: 80 }).paperWidth).toBe(80);
    expect(resolveReceiptSettings({ paperWidth: 72 }).paperWidth).toBe(58);
  });
});

describe('cleanReceiptText', () => {
  it('bukan string menjadi kosong', () => {
    expect(cleanReceiptText(12, 50)).toBe('');
    expect(cleanReceiptText(undefined, 50)).toBe('');
  });

  it('CRLF jadi LF, spasi tepi per baris dibuang, tiga baris kosong jadi satu', () => {
    expect(cleanReceiptText('  A  \r\n  B \r\n\r\n\r\n\r\nC  ', 100)).toBe('A\nB\n\nC');
  });

  it('dipotong ke batas dan tak berakhir dengan spasi', () => {
    const out = cleanReceiptText('abc def', 4);
    expect(out).toBe('abc');
    expect(cleanReceiptText('x'.repeat(500), RECEIPT_TEXT_MAX.terms)).toHaveLength(RECEIPT_TEXT_MAX.terms);
  });
});
