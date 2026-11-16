import type { TranslationKey } from '@/i18n';

/**
 * Gerbang demo di landing: nama toko + nomor WhatsApp (migrasi 0102, saringan
 * nomor asal-asalan 0104).
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

/**
 * Awalan operator seluler yang dipakai (migrasi 0104): Telkomsel 0811–0813,
 * 0821–0823, 0851–0853; Indosat 0814–0816, 0855–0858; XL 0817–0819, 0859,
 * 0877–0879; Axis 0831–0833, 0838; Tri 0895–0899; Smartfren 0881–0889; Ceria
 * 0828; Byru 0868. Sengaja longgar: menolak nomor asli lebih mahal daripada
 * meloloskan nomor palsu.
 */
export const ID_MOBILE_OPERATOR_PATTERN =
  '^628(1[1-9]|2[1238]|3[1238]|5[1-35-9]|68|7[7-9]|8[1-9]|9[5-9])';
const OPERATOR_RE = new RegExp(ID_MOBILE_OPERATOR_PATTERN);

/** Angka beruntun naik atau turun (9→0 dan 0→9 ikut dihitung), minimal 6 digit. */
function isDigitRun(digits: string): boolean {
  if (digits.length < 6) return false;
  const step = (i: number) => (Number(digits[i + 1]) - Number(digits[i]) + 10) % 10;
  const first = step(0);
  if (first !== 1 && first !== 9) return false;
  for (let i = 1; i < digits.length - 1; i++) if (step(i) !== first) return false;
  return true;
}

/**
 * Gerbang demo tidak memakai OTP, jadi nomor tidak bisa dipastikan aktif. Yang
 * bisa ditolak adalah isian asal-asalan yang jelas: awalan yang tidak dipakai
 * operator, nomor pelanggan nol semua (0812-0000-0000), dan deret urut
 * (0812-3456-7890, contoh di placeholder; 0857-1234-5678). Nomor cantik
 * berangka sama (0812-8888-8888) tetap diterima karena memang dijual dan dipakai.
 * `phone` sudah dalam bentuk baku dari normalizeIdPhone.
 */
export function isPlausibleIdMobile(phone: string): boolean {
  if (!OPERATOR_RE.test(phone)) return false;
  const subscriber = phone.slice(5);
  if (/^0+$/.test(subscriber)) return false;
  return !isDigitRun(phone.slice(3)) && !isDigitRun(subscriber);
}

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

/** Isian gerbang yang belum dikirim. Landing membagi satu draf ke gerbang hero
 * dan gerbang penutup, supaya isian tidak hilang saat pengunjung menggulir. */
export interface DemoLeadDraft {
  shopName: string;
  phone: string;
}

export const EMPTY_DEMO_LEAD_DRAFT: DemoLeadDraft = { shopName: '', phone: '' };

export function demoLeadErrors(input: DemoLeadDraft): DemoLeadErrors {
  const errors: DemoLeadErrors = {};
  const name = cleanShopName(input.shopName);
  if (name.length < SHOP_NAME_MIN) errors.shopName = 'demoGate.errorNameShort';
  else if (name.length > SHOP_NAME_MAX) errors.shopName = 'demoGate.errorNameLong';
  else if (LINK_RE.test(name) || FORBIDDEN_CHARS_RE.test(name)) errors.shopName = 'demoGate.errorNameLink';
  const phone = normalizeIdPhone(input.phone);
  if (!phone) errors.phone = 'demoGate.errorPhone';
  else if (!isPlausibleIdMobile(phone)) errors.phone = 'demoGate.errorPhoneFake';
  return errors;
}
