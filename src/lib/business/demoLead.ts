import type { TranslationKey } from '@/i18n';

/**
 * Gerbang demo di landing: nama toko + nomor WhatsApp (migrasi 0102).
 * Aturan di sini adalah cermin `submit_demo_lead`; demoLead.test.ts membaca
 * migrasinya supaya kedua sisi tidak bisa berbeda diam-diam. Klien memeriksa
 * lebih dulu agar pengunjung mendapat pesan sebelum menunggu jaringan, tetapi
 * yang mengikat tetap server.
 */

export const SHOP_NAME_MIN = 2;
export const SHOP_NAME_MAX = 60;
/** Kontak dihapus otomatis sekian hari sesudah terakhir diisi (/privacy). */
export const DEMO_LEAD_RETENTION_DAYS = 90;

/** Nomor seluler Indonesia dalam bentuk baku 62xxxxxxxxxx (10–13 digit lokal). */
export const ID_MOBILE_PATTERN = '^628[1-9][0-9]{7,10}$';
const ID_MOBILE_RE = new RegExp(ID_MOBILE_PATTERN);

export type DemoLeadSource = 'hero' | 'final' | 'demo';

/** Rapikan spasi seperti server: ujung dibuang, spasi beruntun jadi satu. */
export function cleanShopName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * `0812-3456-7890`, `+62 812 3456 7890`, `62 0812…`, `812…` → `6281234567890`.
 * Null bila hasilnya bukan nomor seluler Indonesia.
 */
export function normalizeIdPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('620')) digits = '62' + digits.slice(3);
  else if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (digits.startsWith('8')) digits = '62' + digits;
  return ID_MOBILE_RE.test(digits) ? digits : null;
}

const LINK_RE = /(https?:\/\/|www\.)/i;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS_RE = /[\u0000-\u001f\u007f<>]/;

export interface DemoLeadErrors {
  shopName?: TranslationKey;
  phone?: TranslationKey;
}

export function demoLeadErrors(input: { shopName: string; phone: string }): DemoLeadErrors {
  const errors: DemoLeadErrors = {};
  const name = cleanShopName(input.shopName);
  if (name.length < SHOP_NAME_MIN) errors.shopName = 'demoGate.errorNameShort';
  else if (name.length > SHOP_NAME_MAX) errors.shopName = 'demoGate.errorNameLong';
  else if (LINK_RE.test(name) || FORBIDDEN_CHARS_RE.test(name)) errors.shopName = 'demoGate.errorNameLink';
  if (!normalizeIdPhone(input.phone)) errors.phone = 'demoGate.errorPhone';
  return errors;
}
