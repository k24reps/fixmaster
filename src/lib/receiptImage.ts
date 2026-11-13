import type { PaperSpec } from '@/lib/business/receiptPaper';

/**
 * Nota sebagai gambar, untuk aplikasi printer termal di Android (XANTRI, RawBT).
 *
 * Kenapa bukan dialog cetak: Chrome Android memakai ukuran kertas dari aplikasi
 * printer, bukan `@page` yang dihitung `fit()`, jadi nota 15 cm tercetak di
 * halaman yang jauh lebih panjang dan sisanya kertas kosong. Gambar setinggi isi
 * nota dicetak aplikasi itu apa adanya: kertas berhenti di akhir nota.
 */

/** Titik head per px CSS: 203 dpi head, 96 px CSS per inci. */
export const DOTS_PER_PX = 203 / 96;

/**
 * Pembungkus SVG untuk dokumen nota. `viewBox` dalam px CSS, ukuran luar dalam
 * titik head, supaya browser merasterisasi vektornya langsung di resolusi head
 * (bukan memperbesar bitmap 96 dpi yang kabur).
 */
export function receiptSvg(markup: string, widthPx: number, heightPx: number, scale = DOTS_PER_PX): string {
  const w = Math.round(widthPx * scale);
  const h = Math.round(heightPx * scale);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${widthPx} ${heightPx}">` +
    `<foreignObject x="0" y="0" width="${widthPx}" height="${heightPx}">${markup}</foreignObject></svg>`
  );
}

/**
 * Hitam-putih murni, ditumpuk di atas putih. Tepi huruf yang antialias (abu-abu)
 * akan di-dither aplikasi printer jadi bintik; ambang 50% sama dengan head termal.
 */
export function thresholdPixels(data: Uint8ClampedArray, cut = 128): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const v = a * lum + (1 - a) * 255 < cut ? 0 : 255;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
}

/**
 * Gambar di dalam SVG-sebagai-gambar tidak boleh memuat sumber luar, jadi logo
 * (URL Storage di mode cloud) diubah jadi data URL. Gagal dimuat = logonya
 * dibuang, sama seperti `onerror` di nota cetak.
 */
async function inlineImages(doc: Document): Promise<void> {
  const imgs = [...doc.images].filter((img) => !img.src.startsWith('data:'));
  await Promise.all(
    imgs.map(async (img) => {
      try {
        const res = await fetch(img.src, { mode: 'cors' });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const url = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(blob);
        });
        img.src = url;
        await img.decode().catch(() => undefined);
      } catch {
        img.remove();
      }
    }),
  );
}

function loadFrame(html: string, widthPx: number): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${Math.ceil(widthPx) + 40}px`,
    height: '10px',
    border: '0',
    visibility: 'hidden',
  });
  return new Promise((resolve, reject) => {
    frame.onload = () => resolve(frame);
    frame.onerror = () => reject(new Error('frame'));
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/** Render dokumen nota (HTML cetak dengan `roll: null`) jadi PNG selebar head printer. */
export async function renderReceiptPng(html: string, paper: PaperSpec): Promise<Blob> {
  const frame = await loadFrame(html, paper.printablePx);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error('frame');
    await inlineImages(doc);
    // Gambar = isi <body> saja: lebar gulungan dan margin tengah milik halaman cetak.
    const fit = doc.createElement('style');
    fit.textContent = 'html{width:auto!important;padding:0!important;background:#fff}body{margin:0!important}';
    doc.head.appendChild(fit);
    await doc.fonts?.ready;
    const width = paper.printablePx;
    const height = Math.ceil(doc.body.getBoundingClientRect().height);
    const markup = new XMLSerializer().serializeToString(doc.documentElement);
    const svg = receiptSvg(markup, width, height);

    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    thresholdPixels(pixels.data);
    ctx.putImageData(pixels, 0, 0);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'),
    );
  } finally {
    frame.remove();
  }
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/**
 * Bagikan ke aplikasi printer lewat lembar Bagikan. Perangkat tanpa berbagi
 * berkas (kebanyakan desktop), atau bila jeda render menghabiskan izin gestur
 * pengguna, gambar diunduh supaya tetap bisa dibuka di aplikasi printer.
 */
export async function shareOrDownload(blob: Blob, fileName: string): Promise<ShareOutcome> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
