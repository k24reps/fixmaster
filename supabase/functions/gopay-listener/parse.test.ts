import { describe, it, expect } from 'vitest';
import { parseGopayAmount } from './parse';

describe('parseGopayAmount', () => {
  // Teks NYATA dari GoPay Merchant (com.gojek.gopaymerchant), ditangkap dari
  // notifikasi produksi 15 Agu 2026. Judul + isi digabung persis seperti yang
  // dikirim listener Android. Ini kontrak sebenarnya — kalau GoPay mengubah
  // kalimatnya, test inilah yang harus gagal lebih dulu.
  const REAL = 'Pembayaran QRIS statis diterima Rp 1.000 di K24 Service, CMH SLTN.';

  it('reads the real GoPay Merchant notification', () => {
    expect(parseGopayAmount(REAL)).toBe(1000);
  });

  it('reads a real notification carrying a unique-suffix amount', () => {
    expect(
      parseGopayAmount('Pembayaran QRIS statis diterima Rp 49.037 di K24 Service, CMH SLTN.'),
    ).toBe(49037);
  });

  it('reads an incoming payment with thousand separators', () => {
    expect(parseGopayAmount('Kamu menerima Rp49.037 dari Budi')).toBe(49037);
  });

  it('reads an amount with decimals and a space after Rp', () => {
    expect(parseGopayAmount('Dana diterima Rp 149.512,00')).toBe(149512);
  });

  it('reads an amount without separators', () => {
    expect(parseGopayAmount('Pembayaran QRIS Rp49037 diterima')).toBe(49037);
  });

  // The money-safety cases: anything that is not clearly incoming must be
  // ignored rather than guessed at.
  it('ignores outgoing transfers', () => {
    expect(parseGopayAmount('Kamu mengirim Rp49.037 ke Budi')).toBeNull();
  });

  it('ignores outgoing wording even when an incoming word appears', () => {
    expect(parseGopayAmount('Pembayaran ke Toko diterima Rp49.037')).toBeNull();
  });

  it('ignores refunds', () => {
    expect(parseGopayAmount('Refund Rp49.037 diterima')).toBeNull();
  });

  it('ignores notifications with no incoming marker', () => {
    expect(parseGopayAmount('Promo GoPay Rp49.037 untukmu')).toBeNull();
  });

  it('ignores text with no amount', () => {
    expect(parseGopayAmount('Kamu menerima pesan baru')).toBeNull();
  });

  it('ignores empty input', () => {
    expect(parseGopayAmount('')).toBeNull();
  });

  it('rejects an implausibly large parse', () => {
    expect(parseGopayAmount('Kamu menerima Rp999.999.999.999')).toBeNull();
  });
});
