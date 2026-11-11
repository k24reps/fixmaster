import { serviceReceiptLines, trackingUrl, type ReceiptLine } from '@/lib/business/notify';
import { qrSvg } from '@/lib/qr';
import { openPrintWindow, buildPrintDocument, escapeHtml } from '@/lib/print';
import {
  dotsToPx,
  normalizePaperWidth,
  paperSpec,
  type PaperWidth,
} from '@/lib/business/receiptPaper';
import { receiptStyle, LOGO_MAX_MM } from './receiptStyle';
import type { Service, Organization } from '@/data/types';

export { escapeHtml };

/** Lebar gulungan pilihan toko; belum dipilih = 58mm. */
export function paperWidthOf(org: Pick<Organization, 'settings'>): PaperWidth {
  return normalizePaperWidth(org.settings?.receipt?.paperWidth);
}

/** Modul QR 4 titik (0,5mm): cukup besar untuk head 203 dpi, kecil cukup untuk 58mm. */
const QR_MODULE_DOTS = 4;

/** Satu baris label→nilai pada nota. `cls` = 'strong' untuk baris total. */
export function receiptRow(label: string, value: string, cls = ''): string {
  return `<tr class="${cls}"><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
}

function rowsFor(lines: ReceiptLine[], group: ReceiptLine['group'], extraClass = ''): string {
  const rows = lines
    .filter((l) => l.group === group)
    .map((l) => receiptRow(l.label, l.value, l.emphasis ? 'strong' : ''))
    .join('');
  return rows ? `<table class="${extraClass}">${rows}</table>` : '';
}

export interface ReceiptDoc {
  demoMessage: string;
  title: string;
  kind: string;
  no: string;
  date: string;
  body: string;
}

/**
 * Kertas yang sama untuk setiap dokumen yang dibawa pulang pelanggan: kepala
 * toko (logo, nama, kontak), baris jenis+nomor+tanggal, kaki ucapan terima
 * kasih, atribusi, dan pemicu cetak. Pemanggil hanya mengisi `body` — isi di
 * antara tanggal dan kaki.
 *
 * Nota dan struk adalah satu-satunya artefak FixMaster yang keluar dari toko,
 * jadi yang dominan di atasnya adalah identitas TOKO; FixMaster hanya menempel
 * sebagai satu baris atribusi di kaki. Keduanya harus tetap identik — karena
 * itu badannya satu fungsi, bukan dua dokumen yang kebetulan mirip.
 */
function receiptParts(org: Organization, o: ReceiptDoc) {
  const paper = paperSpec(paperWidthOf(org));
  const contact = [org.address, org.phone].filter(Boolean).join(' · ');
  return {
    title: `${o.title} ${o.no} | ${org.name}`,
    style: receiptStyle(paper),
    paper,
    body: `
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
    <span class="kind">${escapeHtml(o.kind)}</span>
    <span class="no">${escapeHtml(o.no)}</span>
  </div>
  ${o.date ? `<div class="date">${escapeHtml(o.date)}</div>` : ''}
  ${o.body}
  <hr class="seam"/>
  <div class="foot">
    Terima kasih atas kepercayaan Anda.<br/>
    Senang bisa membantu, sampai jumpa kembali!
  </div>
  <div class="by">DICETAK DENGAN FIXMASTER</div>`,
  };
}

export function openReceiptWindow(org: Organization, o: ReceiptDoc): void {
  const { title, style, body, paper } = receiptParts(org, o);
  openPrintWindow({
    demoMessage: o.demoMessage,
    title,
    style,
    body,
    roll: { widthMm: paper.widthMm, logoMm: LOGO_MAX_MM },
  });
}

/** HTML yang sama persis dengan yang dikirim ke printer, tanpa skrip cetak. */
export function receiptPreviewHtml(org: Organization, o: ReceiptDoc): string {
  const { title, style, body } = receiptParts(org, o);
  return buildPrintDocument({ title, style, body, roll: null });
}

/**
 * Open a thermal-style receipt for a service ticket in a new window and trigger
 * the browser print dialog. Shared by NotifyModal and the ticket detail action
 * bar so both produce an identical nota. Guarded in demo mode.
 */
export function printServiceReceipt(service: Service, org: Organization): void {
  const lines = serviceReceiptLines(service);
  const pick = (label: string) => lines.find((l) => l.label === label)?.value ?? '';
  const track = trackingUrl(window.location.origin, org.id, service.serviceNo);
  const note = (org.settings?.publicNote ?? '').trim();
  const garansi = rowsFor(lines, 'garansi');

  openReceiptWindow(org, {
    demoMessage: 'Cetak nota tersedia di FixMaster versi penuh. Daftar gratis.',
    title: 'Nota',
    kind: 'NOTA SERVIS',
    no: service.serviceNo,
    date: pick('Tanggal'),
    body: `
  <hr class="seam"/>
  ${rowsFor(lines, 'unit')}
  <hr class="seam"/>
  ${rowsFor(lines, 'uang', 'money')}
  ${garansi ? `<hr class="seam"/><div class="block"><p class="block-label">GARANSI</p>${garansi}</div>` : ''}
  <hr class="seam"/>
  <div class="block">
  <p class="block-label">LACAK STATUS</p>
  <div class="track">
    ${qrSvg(track, { modulePx: dotsToPx(QR_MODULE_DOTS), margin: 2 })}
    <div class="track-copy">
      <div>Pindai untuk melihat status,<br/>riwayat, dan masa garansi.</div>
      <p class="track-url">${escapeHtml(track)}</p>
    </div>
  </div>
  </div>
  ${note ? `<hr class="seam"/><div class="note">${escapeHtml(note)}</div>` : ''}
  <hr class="seam"/>
  <div class="fine">
    Simpan nota ini sebagai bukti pengambilan unit dan klaim garansi.
    Pengambilan di luar jam operasional harap dikonfirmasi lebih dulu.
  </div>`,
  });
}
