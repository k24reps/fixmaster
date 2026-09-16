import { PRINT_STYLE, escapeHtml } from '@/features/services/printReceipt';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';
import type { Sale, Organization } from '@/data/types';

/**
 * Struk penjualan kasir — dokumen kedua yang dibawa pulang pelanggan, jadi ia
 * memakai kertas, gaya, dan identitas toko yang sama persis dengan nota servis
 * (`printServiceReceipt`); yang berbeda hanya isinya: baris barang dan uang.
 */
export function printSaleReceipt(sale: Sale, org: Organization): void {
  if (demoGuard('Cetak struk aktif di FixMaster versi penuh — daftar gratis.')) return;
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) {
    toast.error('Popup diblokir browser');
    return;
  }

  const contact = [org.address, org.phone].filter(Boolean).join(' · ');
  const note = (org.settings?.publicNote ?? '').trim();
  const row = (label: string, value: string, cls = '') =>
    `<tr class="${cls}"><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;

  const itemRows = sale.lines
    .map((l) => row(`${l.qty}× ${l.name}`, fmtRp(l.sellPrice * l.qty)))
    .join('');

  const moneyRows = [
    row('Subtotal', fmtRp(sale.subtotal)),
    sale.discount > 0 ? row('Diskon', `−${fmtRp(sale.discount)}`) : '',
    row('TOTAL', fmtRp(sale.total), 'strong'),
  ].join('');

  const metaRows = [
    sale.customerName ? row('Pelanggan', sale.customerName) : '',
    sale.cashierName ? row('Kasir', sale.cashierName) : '',
  ].join('');

  win.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"/>
<title>Struk ${escapeHtml(sale.saleNo)} — ${escapeHtml(org.name)}</title>
<style>${PRINT_STYLE}</style>
</head><body>
  <div class="brand">
    ${
      org.logoDataUrl
        ? `<img class="logo" src="${escapeHtml(org.logoDataUrl)}" alt="" onerror="this.remove()"/>`
        : ''
    }
    <h1 class="shop">${escapeHtml(org.name)}</h1>
    ${contact ? `<p class="contact">${escapeHtml(contact)}</p>` : ''}
  </div>
  <hr class="seam"/>
  <div class="docline">
    <span class="kind">STRUK PENJUALAN</span>
    <span class="no">${escapeHtml(sale.saleNo)}</span>
  </div>
  <div class="date">${escapeHtml(fmtDate(sale.date))}</div>
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
  </div>
  <hr class="seam"/>
  <div class="foot">
    Terima kasih atas kepercayaan Anda.<br/>
    Senang bisa membantu — sampai jumpa kembali!
  </div>
  <div class="by">DICETAK DENGAN FIXMASTER</div>
  <script>
    var done = false;
    function go() { if (!done) { done = true; window.print(); } }
    window.onload = go;
    setTimeout(go, 3000);
  </script>
</body></html>`);
  win.document.close();
}
