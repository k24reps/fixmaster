/**
 * Pure notification + document helpers: WhatsApp deep links, message
 * template interpolation, and public tracking codes. No DOM/repository
 * deps → unit-testable.
 */
import type { Service, Organization } from '@/data/types';
import { fmtRp } from '@/lib/format';
import { fmtDate } from '@/lib/time';
import { STATUS_LABELS } from './services';

/** Normalize an Indonesian phone to wa.me format (62xxxxxxxxxx, digits only). */
export function toWaNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (!digits.startsWith('62')) digits = '62' + digits;
  return digits;
}

/** Build a wa.me deep link with a pre-filled message. */
export function waLink(phone: string, message: string): string {
  return `https://wa.me/${toWaNumber(phone)}?text=${encodeURIComponent(message)}`;
}

/**
 * Interpolate a template with {placeholders}. Unknown placeholders are
 * left as-is so authors can spot typos.
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? vars[key] : match,
  );
}

/** Variables available to service-related WA templates. */
export function serviceVars(service: Service, org: Organization): Record<string, string> {
  return {
    nama: service.customerName,
    no_servis: service.serviceNo,
    perangkat: service.device,
    status: STATUS_LABELS[service.status],
    biaya: fmtRp(service.finalCost),
    toko: org.name,
    estimasi: fmtRp(service.estimateCost),
  };
}

/**
 * Default WA messages: multi-line, sapaan sopan, satu ajakan aksi yang jelas.
 * `*bold*` adalah markup WhatsApp (bukan markdown) — dipakai untuk data yang
 * dicari pelanggan sekilas (no servis, nominal, status).
 */
export const DEFAULT_WA_TEMPLATES = {
  diterima: `Halo {nama}, terima kasih sudah mempercayakan perangkat Anda kepada kami.

Unit *{perangkat}* sudah kami terima dan masuk antrean pengerjaan.
No. Servis: *{no_servis}*
Estimasi biaya: {estimasi}

Status pengerjaan bisa dipantau kapan saja di:
{tautan}

Kami kabari lagi begitu ada perkembangan. Salam, {toko}`,
  selesai: `Halo {nama}, kabar baik — servis Anda sudah *SELESAI*.

Perangkat: *{perangkat}*
No. Servis: *{no_servis}*
Total biaya: *{biaya}*

Unit siap diambil di {toko} pada jam operasional. Mohon tunjukkan pesan ini saat pengambilan.

Terima kasih atas kepercayaan Anda.`,
  konfirmasi: `Halo {nama}, hasil pemeriksaan unit *{perangkat}* (No. Servis *{no_servis}*) sudah keluar.

Estimasi biaya perbaikan: *{estimasi}*

Mohon konfirmasinya apakah pengerjaan kami lanjutkan. Bila ada yang ingin ditanyakan lebih dulu, silakan balas pesan ini — dengan senang hati kami jelaskan.

Terima kasih, {toko}`,
};

export type WaTemplateKey = keyof typeof DEFAULT_WA_TEMPLATES;

/** Human labels for each WA template key (used by NotifyModal & Settings). */
export const WA_TEMPLATE_LABELS: Record<WaTemplateKey, string> = {
  diterima: 'Diterima',
  selesai: 'Selesai',
  konfirmasi: 'Konfirmasi',
};

/** Placeholder variables available to WA templates (for the Settings editor hint). */
export const WA_TEMPLATE_VARS = [
  'nama',
  'no_servis',
  'perangkat',
  'status',
  'biaya',
  'estimasi',
  'toko',
  'tautan',
] as const;

/**
 * Merge user overrides over the defaults. Empty/blank overrides fall back to
 * the default for that key, so a cleared field never produces an empty message.
 */
export function resolveWaTemplates(
  overrides: Record<string, string> | null | undefined,
): Record<WaTemplateKey, string> {
  const result = { ...DEFAULT_WA_TEMPLATES };
  if (overrides) {
    for (const key of Object.keys(DEFAULT_WA_TEMPLATES) as WaTemplateKey[]) {
      const v = overrides[key];
      if (typeof v === 'string' && v.trim()) result[key] = v;
    }
  }
  return result;
}

/** Build a public tracking URL for a service. */
export function trackingUrl(origin: string, orgId: string, serviceNo: string): string {
  return `${origin}/track?org=${encodeURIComponent(orgId)}&no=${encodeURIComponent(serviceNo)}`;
}

export interface ReceiptLine {
  label: string;
  value: string;
}

/** Build structured receipt lines for a service (used by the print view). */
export function serviceReceiptLines(service: Service): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  // Tanggal masuk: bukti kapan unit diterima — pertanyaan nomor satu saat klaim.
  if (service.createdAt)
    lines.push({ label: 'Tanggal', value: fmtDate(service.createdAt) });
  lines.push(
    { label: 'No. Servis', value: service.serviceNo },
    { label: 'Pelanggan', value: service.customerName },
    { label: 'Perangkat', value: service.device },
  );
  if (service.complaint) lines.push({ label: 'Keluhan', value: service.complaint });
  if (service.accessories)
    lines.push({ label: 'Kelengkapan', value: service.accessories });
  lines.push({ label: 'Status', value: STATUS_LABELS[service.status] });
  if (service.estimateCost > 0)
    lines.push({ label: 'Estimasi', value: fmtRp(service.estimateCost) });
  if (service.finalCost > 0)
    lines.push({ label: 'Biaya', value: fmtRp(service.finalCost) });
  if (service.downPayment > 0) {
    lines.push({ label: 'DP', value: fmtRp(service.downPayment) });
    lines.push({
      label: 'Sisa',
      value: fmtRp(Math.max(0, service.finalCost - service.downPayment)),
    });
  }
  // Warranty (auto-filled from the shop's default when a service is marked
  // 'selesai'). Printed so the customer has proof of coverage on the nota.
  if (service.warrantyServiceUntil) {
    lines.push({
      label: 'Garansi Jasa s/d',
      value: fmtDate(service.warrantyServiceUntil),
    });
  }
  if (service.warrantyPartsUntil) {
    lines.push({ label: 'Garansi Part s/d', value: fmtDate(service.warrantyPartsUntil) });
  }
  return lines;
}
