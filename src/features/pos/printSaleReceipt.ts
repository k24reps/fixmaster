import {
  openReceiptWindow,
  receiptRow,
  receiptConfigOf,
  paperWidthOf,
  multiline,
  escapeHtml,
  joinSections,
  voidMarkHtml,
  reprintMarkHtml,
  type ReceiptDoc,
} from '@/features/services/printReceipt';
import { receiptText } from '@/features/services/receiptText';
import {
  receiptAddress,
  saleReceiptModel,
  stampWithTime,
  type SaleReceiptItem,
  type SaleReceiptOptions,
} from '@/lib/business/receiptContent';
import { paperSpec } from '@/lib/business/receiptPaper';
import { fmtRp } from '@/lib/format';
import type { Sale, Organization, Outlet } from '@/data/types';

export interface SaleDocOptions extends SaleReceiptOptions {
  /** Cabang toko, untuk alamat kepala kertas; tanpa ini alamat usaha yang tercetak. */
  outlets?: ReadonlyArray<Pick<Outlet, 'id' | 'address'>>;
}

/**
 * Satu barang di struk, dua baris: nama utuh (membungkus bila panjang), lalu
 * "jumlah× harga satuan" di kiri dan jumlah rupiah di kanan. Dulu semuanya satu
 * baris di kolom label: "99× Charger" terbelah di tengah, dan harga satuan tak
 * tercetak sama sekali, padahal itu yang dicek pembeli di kasir.
 */
export function saleItemRow(i: SaleReceiptItem): string {
  return `<tr class="item"><td colspan="2"><div class="nm">${escapeHtml(i.name)}</div><div class="calc"><span>${i.qty}× ${escapeHtml(fmtRp(i.unitPrice))}</span><span class="amt">${escapeHtml(fmtRp(i.amount))}</span></div></td></tr>`;
}

/**
 * Dokumen struk penjualan kasir — dokumen kedua yang dibawa pulang pelanggan,
 * jadi ia memakai kertas, gaya, dan identitas toko yang sama persis dengan nota
 * servis: kepala dan kaki datang dari `openReceiptWindow`, yang berbeda hanya
 * isinya.
 *
 * Struk batal harus terbaca batal dalam sekali lirik, dari jarak lengan, tanpa
 * membaca: kotak BATAL hitam di atas dan TOTAL yang dicoret. Teks kecil "dibatalkan"
 * di dasar kertas, yang dulu satu-satunya tanda, tak terlihat dari ujung struk
 * yang menggantung di mesin.
 */
export function saleReceiptDoc(sale: Sale, org: Organization, opts: SaleDocOptions = {}): ReceiptDoc {
  const m = saleReceiptModel(sale, opts);
  const cfg = receiptConfigOf(org);
  const note = (org.settings?.publicNote ?? '').trim();

  const paper = paperSpec(paperWidthOf(org));
  const itemRows = m.items.map(saleItemRow).join('');

  // Baris bayar memakai nama metode (Tunai, QRIS) sebagai label, seperti struk
  // kasir pada umumnya; tanpa nama, jatuh ke "Dibayar".
  const payRows = m.pay
    .map((p) =>
      p.key === 'change'
        ? receiptRow(receiptText('receipt.sale.change'), fmtRp(p.amount), '', paper)
        : receiptRow(p.method ?? receiptText('receipt.sale.paid'), fmtRp(p.amount), '', paper),
    )
    .join('');

  const moneyRows = [
    receiptRow(receiptText('receipt.sale.subtotal'), fmtRp(m.subtotal), '', paper),
    m.discount > 0
      ? receiptRow(receiptText('receipt.sale.discount'), `−${fmtRp(m.discount)}`, '', paper)
      : '',
    receiptRow(
      receiptText('receipt.sale.total'),
      fmtRp(m.total),
      m.voided ? 'strong strike' : 'strong',
      paper,
    ),
    payRows,
  ].join('');

  const metaRows = [
    sale.customerName
      ? receiptRow(receiptText('receipt.sale.customer'), sale.customerName, '', paper)
      : '',
    sale.cashierName
      ? receiptRow(receiptText('receipt.sale.cashier'), sale.cashierName, '', paper)
      : '',
  ].join('');

  const voidMark = m.voided ? voidMarkHtml() : '';
  const reprint = m.reprintAt ? reprintMarkHtml(m.reprintAt) : '';

  return {
    demoMessage: receiptText('receipt.demo.sale'),
    title: receiptText('receipt.title.sale'),
    kind: receiptText('receipt.doc.sale'),
    no: sale.saleNo,
    voided: m.voided,
    date: stampWithTime(sale.date, sale.createdAt, cfg.showTime),
    address: receiptAddress(org.address, sale.outletId, opts.outlets ?? []),
    body: `
  ${voidMark}${reprint}
  ${joinSections([
    `<table>${itemRows}</table>`,
    `<table class="money">${moneyRows}</table>`,
    metaRows ? `<table>${metaRows}</table>` : '',
    m.voided && m.voidedReason
      ? `<div class="block"><p class="block-label">${escapeHtml(receiptText('receipt.sale.voidReason'))}</p><div class="note">${escapeHtml(m.voidedReason)}</div></div>`
      : '',
    note ? `<div class="note">${escapeHtml(note)}</div>` : '',
    // Struk batal selalu memakai kalimat bawaan: "bukan bukti pembelian" tak boleh
    // hilang karena toko mengganti syarat penukaran.
    `<div class="fine">${
      m.voided
        ? escapeHtml(receiptText('receipt.sale.voidedNote'))
        : cfg.saleTerms
          ? multiline(cfg.saleTerms)
          : escapeHtml(receiptText('receipt.sale.fine'))
    }</div>`,
  ])}`,
  };
}

/**
 * `change` hanya diketahui saat transaksi baru selesai; cetak ulang tak
 * memuatnya. `walletName` mengubah id wallet di `sale.payments` jadi nama
 * metode bayar.
 */
export function printSaleReceipt(sale: Sale, org: Organization, opts: SaleDocOptions = {}): void {
  openReceiptWindow(org, saleReceiptDoc(sale, org, opts));
}
