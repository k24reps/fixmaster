import {
  serviceReceiptLines,
  trackingUrl,
  trackingUrlLabel,
  type ReceiptLine,
} from '@/lib/business/notify';
import { qrSvg } from '@/lib/qr';
import { fmtDate, localDateOf } from '@/lib/time';
import { openPrintWindow, buildPrintDocument, escapeHtml } from '@/lib/print';
import {
  BASE_FONT_DOTS,
  STRONG_FONT_DOTS,
  STRONG_TRACKING_EM,
  dotsToPx,
  fitsBeside,
  normalizePaperWidth,
  paperSpec,
  type PaperSpec,
  type PaperWidth,
} from '@/lib/business/receiptPaper';
import { resolveReceiptSettings, receiptLines } from '@/lib/business/receiptTemplate';
import {
  receiptAddress,
  reprintStamp,
  serviceDocPlan,
  stampWithTime,
  type GaugeStage,
  type GaugeTick,
  type ServiceDocKind,
} from '@/lib/business/receiptContent';
import type { TranslationKey } from '@/i18n';
import { receiptStyle, LOGO_MAX_MM } from './receiptStyle';
import { receiptText } from './receiptText';
import type { Service, Organization, Outlet } from '@/data/types';

export { escapeHtml };

/** Lebar gulungan pilihan toko; belum dipilih = 58mm. */
export function paperWidthOf(org: Pick<Organization, 'settings'>): PaperWidth {
  return normalizePaperWidth(org.settings?.receipt?.paperWidth);
}

/** Setelan nota toko ini, sudah dibersihkan dan berbawaan. */
export function receiptConfigOf(org: Pick<Organization, 'settings'>) {
  return resolveReceiptSettings(org.settings?.receipt);
}

/** Teks bebas milik toko: tiap baris di-escape, baris dipisah `<br/>`. */
export function multiline(text: string): string {
  return receiptLines(text).map(escapeHtml).join('<br/>');
}

/** Modul QR 4 titik (0,5mm): cukup besar untuk head 203 dpi, kecil cukup untuk 58mm. */
const QR_MODULE_DOTS = 4;

/**
 * Satu baris label→nilai pada nota. `cls` = 'strong' untuk baris total.
 *
 * Label dan nilai berdampingan (nilai rata kanan) selama keduanya muat di satu
 * baris kertas. Bila tidak, baris ditumpuk: label di atas, nilai utuh di
 * bawahnya (rata kiri, kecuali nominal yang tetap rata kanan). Kolom yang
 * dipatok persentase memaksa nilai panjang membungkus di ruang sempit dan
 * kadang memotong label di tengah kata ("Kelengkapa/n"). Tanpa `paper`, selalu
 * berdampingan.
 */
export function receiptRow(label: string, value: string, cls = '', paper?: PaperSpec): string {
  const strong = cls.split(' ').includes('strong');
  const side =
    !paper ||
    fitsBeside(
      label,
      value,
      paper,
      strong ? STRONG_FONT_DOTS : BASE_FONT_DOTS,
      strong ? STRONG_TRACKING_EM : 0,
    );
  if (side) {
    return `<tr class="${cls}"><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`;
  }
  return `<tr class="${`${cls} stack`.trim()}"><td colspan="2"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value)}</span></td></tr>`;
}

/**
 * Label baris nota servis menurut kuncinya. Kunci `warrantyPart` tak ada di
 * sini: labelnya nama sparepart, yaitu data milik toko, bukan teks aplikasi.
 */
const LINE_LABEL: Partial<Record<ReceiptLine['key'], TranslationKey>> = {
  date: 'receipt.line.date',
  serviceNo: 'receipt.line.serviceNo',
  customer: 'receipt.line.customer',
  device: 'receipt.line.device',
  imei: 'receipt.line.imei',
  condition: 'receipt.line.condition',
  complaint: 'receipt.line.complaint',
  accessories: 'receipt.line.accessories',
  pickedUp: 'receipt.line.pickedUp',
  technician: 'receipt.line.technician',
  estimate: 'receipt.line.estimate',
  cost: 'receipt.line.cost',
  dp: 'receipt.line.dp',
  remaining: 'receipt.line.remaining',
  paidDp: 'receipt.line.paidDp',
  dpReceived: 'receipt.line.dpReceived',
  dpRetained: 'receipt.line.dpRetained',
  dpRefunded: 'receipt.line.dpRefunded',
  warrantyService: 'receipt.line.warrantyService',
  warrantyParts: 'receipt.line.warrantyParts',
};

function lineLabel(l: ReceiptLine): string {
  const key = LINE_LABEL[l.key];
  return key ? receiptText(key) : l.label;
}

function lineValue(l: ReceiptLine): string {
  if (l.until !== undefined)
    return l.until
      ? `${receiptText('receipt.warranty.until')} ${fmtDate(l.until)}`
      : receiptText('receipt.warranty.none');
  return l.value;
}

function rowsFor(
  lines: ReceiptLine[],
  group: ReceiptLine['group'],
  paper: PaperSpec,
  extraClass = '',
): string {
  const rows = lines
    .filter((l) => l.group === group)
    .map((l) => receiptRow(lineLabel(l), lineValue(l), l.emphasis ? 'strong' : '', paper))
    .join('');
  return rows ? `<table class="${extraClass}">${rows}</table>` : '';
}

const STAGE_LABEL: Record<GaugeStage, TranslationKey> = {
  received: 'receipt.stage.received',
  working: 'receipt.stage.working',
  ready: 'receipt.stage.ready',
  pickedUp: 'receipt.stage.pickedUp',
};

/**
 * Pita tahap: empat segmen, yang sudah dilewati berupa batang hitam tebal dan
 * yang belum berupa garis titik-titik (bahasa jahitan yang sama dengan `.seam`).
 * Tahap saat ini ditebalkan dan digaris bawah. Semuanya GARIS dan teks, bukan
 * latar: latar hilang bila "background graphics" mati, garis tepi tidak.
 * Hierarki tahap terbaca tanpa abu-abu, jadi selamat dari ambang 1-bit.
 */
export function stageGaugeHtml(ticks: GaugeTick[]): string {
  if (!ticks.length) return '';
  const steps = ticks
    .map((t) => {
      const cls = ['step', t.reached ? 'on' : 'off', t.current ? 'cur' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}"><i class="bar"></i><span class="nm">${escapeHtml(receiptText(STAGE_LABEL[t.stage]))}</span></div>`;
    })
    .join('');
  return `<div class="gauge">${steps}</div>`;
}

/** Kotak tanda tangan penerima: bingkai kosong yang diisi tangan, bukan latar. */
export function signBoxHtml(): string {
  return `<div class="sign"><p class="block-label">${escapeHtml(receiptText('receipt.sign.label'))}</p><div class="sign-box"></div></div>`;
}

const DOC_TEXT: Record<ServiceDocKind, { kind: TranslationKey; title: TranslationKey }> = {
  intake: { kind: 'receipt.doc.intake', title: 'receipt.title.intake' },
  service: { kind: 'receipt.doc.service', title: 'receipt.title.service' },
  handover: { kind: 'receipt.doc.handover', title: 'receipt.title.handover' },
};

export interface ReceiptDoc {
  demoMessage: string;
  title: string;
  kind: string;
  no: string;
  date: string;
  /** Alamat kepala kertas bila bukan alamat usaha (alamat cabang). */
  address?: string;
  body: string;
  /**
   * Dokumen yang dibatalkan tidak menutup dengan ucapan terima kasih (bawaan
   * maupun buatan toko): kertas yang menyatakan "BATAL" lalu berpamitan
   * "sampai jumpa kembali!" terbaca seperti pesta. Atribusi tetap tercetak.
   */
  voided?: boolean;
}

/** Kotak BATAL berbingkai: dipakai bersama oleh nota tiket batal dan struk batal. */
export function voidMarkHtml(): string {
  return `<div class="void-mark">${escapeHtml(receiptText('receipt.void'))}</div>`;
}

/** Penanda salinan di kepala isi, sama untuk struk POS dan nota servis. `at` = saat dicetak. */
export function reprintMarkHtml(at: string): string {
  return `<div class="reprint"><strong>${escapeHtml(receiptText('receipt.reprint'))}</strong><br/>${escapeHtml(at)}</div>`;
}

/** Bagian-bagian isi dipisah jahitan titik; bagian kosong tidak meninggalkan jahitan ganda. */
export function joinSections(sections: string[]): string {
  return sections
    .filter(Boolean)
    .map((s) => `<hr class="seam"/>${s}`)
    .join('\n  ');
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
  const cfg = receiptConfigOf(org);
  const contact = [o.address ?? org.address, org.phone].filter(Boolean).join(' · ');
  const foot = o.voided
    ? ''
    : cfg.footer
      ? multiline(cfg.footer)
      : `${escapeHtml(receiptText('receipt.foot.thanks'))}<br/>
    ${escapeHtml(receiptText('receipt.foot.again'))}`;
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
    ${cfg.header ? `<p class="tagline">${multiline(cfg.header)}</p>` : ''}
  </div>
  <hr class="seam"/>
  <div class="docline">
    <span class="kind">${escapeHtml(o.kind)}</span>
    <span class="no">${escapeHtml(o.no)}</span>
  </div>
  ${o.date ? `<div class="date">${escapeHtml(o.date)}</div>` : ''}
  ${o.body}
  <hr class="seam"/>
  ${foot ? `<div class="foot">${foot}</div>` : ''}
  <div class="by">${escapeHtml(receiptText('receipt.by'))}</div>`,
  };
}

/** true bila jendela cetak benar-benar terbuka (bukan diblokir popup atau mode demo). */
export function openReceiptWindow(org: Organization, o: ReceiptDoc): boolean {
  const { title, style, body, paper } = receiptParts(org, o);
  return openPrintWindow({
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
 * Dokumen nota servis. Tiket batal tidak mencetak garansi, kode QR pelacakan,
 * maupun "simpan sebagai bukti pengambilan": unitnya tak akan diambil dan tak
 * ada garansi yang bisa diklaim, jadi kertasnya hanya mencatat nasib DP. Ia
 * ditandai kotak BATAL yang sama dengan struk batal dan tanpa ucapan kaki.
 */
export interface ServiceReceiptOptions {
  /** Kode lacak (0100). Tanpa kode, alamat lama `?org=&no=` yang tercetak. */
  trackCode?: string | null;
  /** Dokumen berjenis sama sudah pernah dicetak — lihat `isServiceReprint`. */
  reprint?: boolean;
  /** Hanya untuk tes; default sekarang. */
  now?: Date;
}

export function serviceReceiptDoc(
  service: Service,
  org: Organization,
  origin: string,
  outlets: ReadonlyArray<Pick<Outlet, 'id' | 'address'>> = [],
  opts: ServiceReceiptOptions = {},
): ReceiptDoc {
  const cfg = receiptConfigOf(org);
  // Baris yang dimatikan toko dibuang di sini, bukan di notify: serviceReceiptLines
  // adalah isi tiket apa adanya, yang tercetak adalah pilihan toko.
  const lines = serviceReceiptLines(service).filter(
    (l) => (l.key !== 'imei' || cfg.showImei) && (l.key !== 'technician' || cfg.showTechnician),
  );
  const cancelled = service.status === 'batal';
  const track = trackingUrl(origin, org.id, service.serviceNo, opts.trackCode);
  // Kertas batal sudah berkotak BATAL; salinannya tak perlu penanda kedua.
  const reprint = opts.reprint && !cancelled ? reprintMarkHtml(reprintStamp(opts.now ?? new Date())) : '';
  const note = (org.settings?.publicNote ?? '').trim();
  const paper = paperSpec(paperWidthOf(org));
  const garansi = rowsFor(lines, 'garansi', paper);
  const showTrack = !cancelled && (cfg.showQr || cfg.showTrackUrl);
  // Kertas yang sama dicetak saat unit diterima, siap, dan diserahkan: judul,
  // pita tahap, dan kotak tanda tangan mengikuti tahap SAAT CETAK.
  const plan = serviceDocPlan(service);
  const text = DOC_TEXT[plan.kind];
  const fine = cfg.serviceTerms
    ? multiline(cfg.serviceTerms)
    : escapeHtml(
        receiptText(plan.kind === 'handover' ? 'receipt.service.fineHandover' : 'receipt.service.fine'),
      );

  return {
    demoMessage: receiptText('receipt.demo.service'),
    title: receiptText(text.title),
    kind: receiptText(text.kind),
    no: service.serviceNo,
    date: service.createdAt
      ? stampWithTime(localDateOf(service.createdAt), service.createdAt, cfg.showTime)
      : '',
    address: receiptAddress(org.address, service.outletId, outlets),
    voided: cancelled,
    body: `
  ${reprint}${cancelled ? voidMarkHtml() : stageGaugeHtml(plan.gauge)}
  ${joinSections([
    rowsFor(lines, 'unit', paper),
    rowsFor(lines, 'uang', paper, 'money'),
    garansi
      ? `<div class="block"><p class="block-label">${escapeHtml(receiptText('receipt.block.warranty'))}</p>${garansi}</div>`
      : '',
    showTrack
      ? `<div class="block">
  <p class="block-label">${escapeHtml(receiptText('receipt.block.track'))}</p>
  <div class="track">
    ${cfg.showQr ? qrSvg(track, { modulePx: dotsToPx(QR_MODULE_DOTS), margin: 2 }) : ''}
    <div class="track-copy">
      <div>${escapeHtml(receiptText('receipt.track.copy'))}</div>
      ${cfg.showTrackUrl ? `<p class="track-url">${escapeHtml(trackingUrlLabel(track))}</p>` : ''}
    </div>
  </div>
  </div>`
      : '',
    note ? `<div class="note">${escapeHtml(note)}</div>` : '',
    plan.signature ? signBoxHtml() : '',
    cancelled ? '' : `<div class="fine">${fine}</div>`,
  ])}`,
  };
}

/**
 * Buka nota servis di jendela cetak. Dipanggil hanya lewat `useServicePrint`,
 * yang memuat kode lacak dan jejak cetak lebih dulu lalu mencatat cetakan ini.
 * Mengembalikan false bila jendela tak terbuka (popup diblokir, mode demo),
 * supaya cetakan yang gagal tidak tercatat.
 */
export function printServiceReceipt(
  service: Service,
  org: Organization,
  outlets: ReadonlyArray<Pick<Outlet, 'id' | 'address'>> = [],
  opts: ServiceReceiptOptions = {},
): boolean {
  return openReceiptWindow(org, serviceReceiptDoc(service, org, window.location.origin, outlets, opts));
}
