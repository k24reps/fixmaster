import { beforeEach, describe, expect, it } from 'vitest';
import { saleReceiptDoc } from './printSaleReceipt';
import { useSettingsStore } from '@/stores/settings';
import type { Organization, Sale } from '@/data/types';

const org = { id: 'o1', name: 'TechFix', address: '', phone: '', logoDataUrl: '', settings: {} } as unknown as Organization;

const sale = (over: Partial<Sale>): Sale =>
  ({
    id: 's1',
    orgId: 'o1',
    outletId: null,
    createdAt: '2026-11-11T07:41:00.000Z',
    saleNo: 'INV-0042',
    date: '2026-11-11',
    lines: [{ itemId: 'a', name: 'Tempered Glass', qty: 2, sellPrice: 75000, costPrice: 1000 }],
    subtotal: 150000,
    discount: 0,
    total: 150000,
    payments: [{ walletId: 'w-cash', amount: 150000 }],
    cashierName: 'Budi',
    customerName: '',
    voided: false,
    voidedReason: '',
    ...over,
  }) as unknown as Sale;

const walletName = (id: string | null) => (id === 'w-cash' ? 'Tunai' : id === 'w-qris' ? 'QRIS' : '');
const text = (body: string) => {
  const el = document.createElement('div');
  el.innerHTML = body;
  return el.textContent ?? '';
};

beforeEach(() => useSettingsStore.setState({ language: 'id' }));

describe('saleReceiptDoc: struk biasa', () => {
  it('tanpa penanda BATAL atau CETAK ULANG; bukti pembelian tetap tercetak', () => {
    const doc = saleReceiptDoc(sale({}), org, { walletName });
    expect(doc.body).not.toContain('void-mark');
    expect(doc.body).not.toContain('reprint');
    expect(text(doc.body)).toContain('bukti pembelian');
    expect(doc.kind).toBe('STRUK PENJUALAN');
  });

  it('metode bayar datang dari sale.payments, tanpa Dibayar/Kembalian bila tak diketahui', () => {
    const t = text(saleReceiptDoc(sale({}), org, { walletName }).body);
    expect(t).toContain('Tunai');
    expect(t).not.toContain('Kembalian');
    expect(t).not.toContain('Dibayar');
  });

  it('kembalian diketahui: baris tunai = uang diterima, lalu Kembalian', () => {
    const t = text(saleReceiptDoc(sale({}), org, { walletName, change: 50000 }).body);
    expect(t).toMatch(/Tunai\s*Rp\s*200\.000/);
    expect(t).toMatch(/Kembalian\s*Rp\s*50\.000/);
  });
});

describe('saleReceiptDoc: struk batal', () => {
  const voided = sale({ voided: true, voidedReason: 'Salah input barang' });

  it('penanda BATAL hitam di atas, TOTAL dicoret, alasan tercetak', () => {
    const doc = saleReceiptDoc(voided, org, { walletName });
    expect(doc.body).toMatch(/<div class="void-mark">BATAL<\/div>/);
    expect(doc.body).toMatch(/<tr class="strong strike"><td>TOTAL<\/td>/);
    expect(text(doc.body)).toContain('Salah input barang');
  });

  it('tak mengaku sebagai bukti pembelian, dan tak mencetak pembayaran atau kembalian', () => {
    const t = text(saleReceiptDoc(voided, org, { walletName, change: 50000 }).body);
    expect(t).toContain('bukan bukti pembelian');
    expect(t).not.toContain('syarat penukaran');
    expect(t).not.toMatch(/Kembalian|Dibayar|Tunai/);
  });

  it('alasan kosong: blok alasan tidak dicetak', () => {
    const t = text(saleReceiptDoc(sale({ voided: true, voidedReason: '  ' }), org, { walletName }).body);
    expect(t).not.toContain('ALASAN PEMBATALAN');
  });
});

describe('saleReceiptDoc: cetak ulang', () => {
  it('membawa tanda CETAK ULANG dan tanggal-jam cetak; tak mengarang kembalian', () => {
    const now = new Date(2026, 10, 12, 9, 5);
    const doc = saleReceiptDoc(sale({}), org, { walletName, reprint: true, now });
    expect(doc.body).toMatch(/<div class="reprint">/);
    const t = text(doc.body);
    expect(t).toContain('CETAK ULANG');
    expect(t).toContain('12 Nov 2026 09:05');
    expect(t).not.toContain('Kembalian');
  });

  it('bahasa Inggris: REPRINT dan VOID', () => {
    useSettingsStore.setState({ language: 'en' });
    const doc = saleReceiptDoc(sale({ voided: true }), org, { walletName, reprint: true });
    expect(text(doc.body)).toContain('REPRINT');
    expect(doc.body).toContain('>VOID<');
    expect(doc.kind).toBe('SALES RECEIPT');
  });
});

describe('saleReceiptDoc: setelan toko', () => {
  const orgWith = (receipt: Record<string, unknown>) =>
    ({ ...org, settings: { receipt } }) as unknown as Organization;

  it('syarat toko menggantikan bawaan di struk biasa', () => {
    const doc = saleReceiptDoc(sale({}), orgWith({ saleTerms: 'Tukar dalam 3 hari.' }), { walletName });
    const t = text(doc.body);
    expect(t).toContain('Tukar dalam 3 hari.');
    expect(t).not.toContain('syarat penukaran');
  });

  it('struk batal tetap "bukan bukti pembelian" walau toko menulis syarat sendiri', () => {
    const doc = saleReceiptDoc(sale({ voided: true }), orgWith({ saleTerms: 'Tukar dalam 3 hari.' }), { walletName });
    const t = text(doc.body);
    expect(t).toContain('bukan bukti pembelian');
    expect(t).not.toContain('Tukar dalam 3 hari.');
  });

  it('jam dinyalakan: tanggal diikuti HH:MM; default hanya tanggal', () => {
    expect(saleReceiptDoc(sale({}), org, { walletName }).date).toBe('11 Nov 2026');
    expect(saleReceiptDoc(sale({}), orgWith({ showTime: true }), { walletName }).date).toMatch(
      /^11 Nov 2026 \d{2}:\d{2}$/,
    );
  });

  it('alamat kepala: alamat cabang struk ini, bukan alamat usaha', () => {
    const o = { ...org, address: 'Jl. Pusat 1' } as unknown as Organization;
    const outlets = [{ id: 'o-cimahi', address: 'Jl. Cimahi 5' }];
    expect(saleReceiptDoc(sale({ outletId: 'o-cimahi' }), o, { outlets }).address).toBe('Jl. Cimahi 5');
    expect(saleReceiptDoc(sale({ outletId: null }), o, { outlets }).address).toBe('Jl. Pusat 1');
  });
});
