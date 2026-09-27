import { openReceiptWindow, receiptRow, escapeHtml } from '@/features/services/printReceipt';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import type { Sale, Organization } from '@/data/types';

/**
 * Struk penjualan kasir — dokumen kedua yang dibawa pulang pelanggan, jadi ia
 * memakai kertas, gaya, dan identitas toko yang sama persis dengan nota servis:
 * kepala dan kaki datang dari `openReceiptWindow`, yang berbeda hanya isinya.
 */
/** `change` hanya diketahui saat transaksi baru selesai — cetak ulang tak memuatnya. */
export function printSaleReceipt(sale: Sale, org: Organization, change = 0): void {
  const note = (org.settings?.publicNote ?? '').trim();

  const itemRows = sale.lines
    .map((l) => receiptRow(`${l.qty}× ${l.name}`, fmtRp(l.sellPrice * l.qty)))
    .join('');

  const moneyRows = [
    receiptRow('Subtotal', fmtRp(sale.subtotal)),
    sale.discount > 0 ? receiptRow('Diskon', `−${fmtRp(sale.discount)}`) : '',
    receiptRow('TOTAL', fmtRp(sale.total), 'strong'),
    change > 0 ? receiptRow('Dibayar', fmtRp(sale.total + change)) : '',
    change > 0 ? receiptRow('Kembalian', fmtRp(change)) : '',
  ].join('');

  const metaRows = [
    sale.customerName ? receiptRow('Pelanggan', sale.customerName) : '',
    sale.cashierName ? receiptRow('Kasir', sale.cashierName) : '',
  ].join('');

  openReceiptWindow(org, {
    demoMessage: 'Cetak struk aktif di FixMaster versi penuh — daftar gratis.',
    title: 'Struk',
    kind: 'STRUK PENJUALAN',
    no: sale.saleNo,
    date: fmtDate(sale.date),
    body: `
  <hr class="seam"/>
  <table>${itemRows}</table>
  <hr class="seam"/>
  <table class="money">${moneyRows}</table>
  ${metaRows ? `<hr class="seam"/><table>${metaRows}</table>` : ''}
  ${sale.voided ? '<hr class="seam"/><div class="fine">TRANSAKSI INI DIBATALKAN.</div>' : ''}
  ${note ? `<hr class="seam"/><div class="note">${escapeHtml(note)}</div>` : ''}
  <hr class="seam"/>
  <div class="fine">
    Simpan struk ini sebagai bukti pembelian dan syarat penukaran barang.
  </div>`,
  });
}
