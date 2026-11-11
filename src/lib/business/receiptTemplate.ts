import type { ReceiptSettings } from '@/data/types';
import { normalizePaperWidth, type PaperWidth } from './receiptPaper';

/**
 * Setelan nota & struk yang sudah dibersihkan. `ReceiptSettings` adalah jsonb
 * yang ditulis tangan (atau oleh versi aplikasi lain), jadi setiap pembacaan
 * lewat sini: nilai asing jatuh ke bawaan, bukan merusak kertas yang sedang
 * dicetak di depan pelanggan.
 *
 * Bawaan sengaja SAMA dengan kertas sebelum fitur ini ada: toko yang tak pernah
 * membuka Pengaturan › Nota & Struk melihat nota yang persis sama.
 */

/** Batas panjang per kolom. Terms mengikuti `PUBLIC_NOTE_MAX`; header lebih pendek karena ada di puncak kertas. */
export const RECEIPT_TEXT_MAX = { header: 120, footer: 160, terms: 280 } as const;

export interface ResolvedReceiptSettings {
  paperWidth: PaperWidth;
  /** '' = tak ada (header), atau pakai teks bawaan (footer, terms). */
  header: string;
  footer: string;
  serviceTerms: string;
  saleTerms: string;
  showQr: boolean;
  showTrackUrl: boolean;
  showImei: boolean;
  showTechnician: boolean;
  showTime: boolean;
}

/** Hanya string; CRLF jadi LF; spasi tepi dan baris kosong beruntun dibuang; dipotong ke `max`. */
export function cleanReceiptText(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
    .trim();
}

export function resolveReceiptSettings(raw: unknown): ResolvedReceiptSettings {
  const r: Partial<Record<keyof ReceiptSettings, unknown>> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    paperWidth: normalizePaperWidth(r.paperWidth),
    header: cleanReceiptText(r.header, RECEIPT_TEXT_MAX.header),
    footer: cleanReceiptText(r.footer, RECEIPT_TEXT_MAX.footer),
    serviceTerms: cleanReceiptText(r.serviceTerms, RECEIPT_TEXT_MAX.terms),
    saleTerms: cleanReceiptText(r.saleTerms, RECEIPT_TEXT_MAX.terms),
    // Yang dulu selalu tercetak: hanya `false` yang mematikan.
    showQr: r.showQr !== false,
    showTrackUrl: r.showTrackUrl !== false,
    showImei: r.showImei !== false,
    // Yang dulu tak pernah tercetak: hanya `true` yang menyalakan.
    showTechnician: r.showTechnician === true,
    showTime: r.showTime === true,
  };
}

/** Lebih dari satu baris dipisah `<br/>`; pemanggil meng-escape tiap baris. */
export function receiptLines(text: string): string[] {
  return text.split('\n');
}
