import { serviceReceiptLines, trackingUrl, type ReceiptLine } from '@/lib/business/notify';
import { qrSvg } from '@/lib/qr';
import { toast } from '@/stores/toast';
import { demoGuard } from '@/stores/demo';
import type { Service, Organization } from '@/data/types';

/** Escape user/org text before injecting into the print window markup. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Nota dicetak dari dokumen terpisah yang dibuka lewat `window.open`, jadi ia
 * tidak bisa menjangkau `tokens.css` maupun webfont aplikasi. Nilai di bawah
 * ini adalah satu-satunya tempat di produk yang boleh menulis warna literal:
 * bukan pelanggaran Token-Only Rule, melainkan konsekuensi media — tinta di
 * kertas tidak punya tema gelap dan tidak punya `var()`.
 *
 * Monospace di sini juga bukan kostum "biar terlihat teknis": seluruh isi nota
 * adalah data dan nominal yang dibaca berkolom, persis kasus yang Mono Numbers
 * Rule maksudkan.
 */
const PRINT_STYLE = `
  @page { margin: 6mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 4px 0 16px;
    max-width: 280px;
    color: #111;
    background: #fff;
    font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    font-size: 11.5px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .brand { text-align: center; }
  .logo {
    max-width: 104px;
    max-height: 64px;
    margin: 0 auto 8px;
    display: block;
    object-fit: contain;
  }
  .shop {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    line-height: 1.25;
  }
  .contact { margin: 4px 0 0; font-size: 10.5px; color: #555; line-height: 1.45; }
  /* Jahitan putus-putus, meneruskan bahasa "tepi terperforasi" dari aplikasi. */
  .seam { border: none; border-top: 1px dashed #9a9a9a; margin: 10px 0; }
  .docline {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .kind { font-size: 10px; letter-spacing: 0.18em; color: #555; }
  .no { font-size: 14px; font-weight: 700; letter-spacing: 0.04em; }
  .date { font-size: 10.5px; color: #555; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2.5px 0; vertical-align: top; font-variant-numeric: tabular-nums; }
  td:first-child { width: 38%; color: #555; padding-right: 8px; }
  td:last-child { text-align: right; }
  .money td:last-child { font-weight: 600; }
  .strong td { padding-top: 5px; font-size: 13px; font-weight: 700; color: #000; }
  .strong td:first-child { color: #000; letter-spacing: 0.04em; }
  .block-label {
    font-size: 9.5px;
    letter-spacing: 0.18em;
    color: #555;
    margin: 0 0 5px;
  }
  .track { display: flex; gap: 10px; align-items: center; }
  .track svg { flex: 0 0 auto; }
  .track-copy { min-width: 0; }
  .track-url {
    margin: 3px 0 0;
    font-size: 9px;
    line-height: 1.45;
    color: #555;
    word-break: break-all;
  }
  .note { font-size: 10px; color: #333; line-height: 1.55; white-space: pre-wrap; }
  .fine { font-size: 9.5px; color: #555; line-height: 1.55; }
  .foot { text-align: center; font-size: 10.5px; line-height: 1.6; }
  .by { text-align: center; font-size: 8.5px; letter-spacing: 0.14em; color: #8a8a8a; margin-top: 10px; }
`;

function rowsFor(lines: ReceiptLine[], group: ReceiptLine['group'], extraClass = ''): string {
  const rows = lines
    .filter((l) => l.group === group)
    .map(
      (l) =>
        `<tr class="${l.emphasis ? 'strong' : ''}"><td>${escapeHtml(l.label)}</td>` +
        `<td>${escapeHtml(l.value)}</td></tr>`,
    )
    .join('');
  return rows ? `<table class="${extraClass}">${rows}</table>` : '';
}

/**
 * Open a thermal-style receipt for a service ticket in a new window and trigger
 * the browser print dialog. Shared by NotifyModal and the ticket detail action
 * bar so both produce an identical nota. Guarded in demo mode.
 *
 * Nota ini adalah satu-satunya artefak FixMaster yang keluar dari toko dan
 * dibawa pulang pelanggan, jadi yang dominan di atasnya adalah identitas TOKO
 * — logo, nama, kontak, catatan miliknya sendiri. FixMaster hanya menempel
 * sebagai satu baris atribusi di kaki.
 */
export function printServiceReceipt(service: Service, org: Organization): void {
  if (demoGuard('Cetak nota aktif di FixMaster versi penuh — daftar gratis.')) return;
  const win = window.open('', '_blank', 'width=380,height=640');
  if (!win) {
    toast.error('Popup diblokir browser');
    return;
  }

  const lines = serviceReceiptLines(service);
  const pick = (label: string) => lines.find((l) => l.label === label)?.value ?? '';
  const track = trackingUrl(window.location.origin, org.id, service.serviceNo);
  const note = (org.settings?.publicNote ?? '').trim();
  const contact = [org.address, org.phone].filter(Boolean).join(' · ');
  const garansi = rowsFor(lines, 'garansi');

  const head = `
    <div class="brand">
      ${
        org.logoDataUrl
          ? `<img class="logo" src="${escapeHtml(org.logoDataUrl)}" alt="" onerror="this.remove()"/>`
          : ''
      }
      <h1 class="shop">${escapeHtml(org.name)}</h1>
      ${contact ? `<p class="contact">${escapeHtml(contact)}</p>` : ''}
    </div>`;

  win.document.write(`<!doctype html>
<html lang="id"><head><meta charset="utf-8"/>
<title>Nota ${escapeHtml(service.serviceNo)} — ${escapeHtml(org.name)}</title>
<style>${PRINT_STYLE}</style>
</head><body>
  ${head}
  <hr class="seam"/>
  <div class="docline">
    <span class="kind">NOTA SERVIS</span>
    <span class="no">${escapeHtml(service.serviceNo)}</span>
  </div>
  ${pick('Tanggal') ? `<div class="date">${escapeHtml(pick('Tanggal'))}</div>` : ''}
  <hr class="seam"/>
  ${rowsFor(lines, 'unit')}
  <hr class="seam"/>
  ${rowsFor(lines, 'uang', 'money')}
  ${
    garansi
      ? `<hr class="seam"/><p class="block-label">GARANSI</p>${garansi}`
      : ''
  }
  <hr class="seam"/>
  <p class="block-label">LACAK STATUS</p>
  <div class="track">
    ${qrSvg(track, { size: 74, margin: 2 })}
    <div class="track-copy">
      <div>Pindai untuk melihat status,<br/>riwayat, dan masa garansi.</div>
      <p class="track-url">${escapeHtml(track)}</p>
    </div>
  </div>
  ${note ? `<hr class="seam"/><div class="note">${escapeHtml(note)}</div>` : ''}
  <hr class="seam"/>
  <div class="fine">
    Simpan nota ini sebagai bukti pengambilan unit dan klaim garansi.
    Pengambilan di luar jam operasional harap dikonfirmasi lebih dulu.
  </div>
  <hr class="seam"/>
  <div class="foot">
    Terima kasih atas kepercayaan Anda.<br/>
    Senang bisa membantu — sampai jumpa kembali!
  </div>
  <div class="by">DICETAK DENGAN FIXMASTER</div>
  <script>
    // Logo toko bisa berupa URL Storage yang lambat. window.onload sudah
    // menunggu gambar, tapi jaringan yang menggantung tidak boleh menyandera
    // dialog cetak — mana pun yang lebih dulu, itu yang jalan.
    var done = false;
    function go() { if (!done) { done = true; window.print(); } }
    window.onload = go;
    setTimeout(go, 3000);
  </script>
</body></html>`);
  win.document.close();
}
