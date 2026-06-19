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
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
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

export const DEFAULT_WA_TEMPLATES = {
  diterima:
    'Halo {nama}, unit {perangkat} Anda telah kami terima dengan no servis {no_servis}. Cek status: {tautan}. Terima kasih — {toko}',
  selesai:
    'Halo {nama}, kabar baik! Servis {perangkat} (no {no_servis}) sudah *selesai*. Total biaya {biaya}. Silakan ambil di {toko}. Terima kasih!',
  konfirmasi:
    'Halo {nama}, estimasi biaya servis {perangkat} (no {no_servis}) adalah {biaya}. Mohon konfirmasi untuk kami lanjutkan. — {toko}',
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
  const lines: ReceiptLine[] = [
    { label: 'No. Servis', value: service.serviceNo },
    { label: 'Pelanggan', value: service.customerName },
    { label: 'Perangkat', value: service.device },
    { label: 'Status', value: STATUS_LABELS[service.status] },
  ];
  if (service.estimateCost > 0) lines.push({ label: 'Estimasi', value: fmtRp(service.estimateCost) });
  if (service.finalCost > 0) lines.push({ label: 'Biaya', value: fmtRp(service.finalCost) });
  if (service.downPayment > 0) {
    lines.push({ label: 'DP', value: fmtRp(service.downPayment) });
    lines.push({ label: 'Sisa', value: fmtRp(Math.max(0, service.finalCost - service.downPayment)) });
  }
  // Warranty (auto-filled from the shop's default when a service is marked
  // 'selesai'). Printed so the customer has proof of coverage on the nota.
  if (service.warrantyServiceUntil) {
    lines.push({ label: 'Garansi Jasa s/d', value: fmtDate(service.warrantyServiceUntil) });
  }
  if (service.warrantyPartsUntil) {
    lines.push({ label: 'Garansi Part s/d', value: fmtDate(service.warrantyPartsUntil) });
  }
  return lines;
}
